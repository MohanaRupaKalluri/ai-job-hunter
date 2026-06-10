import { generateText } from "ai";
import { z } from "zod";
import { createLovableAi } from "./ai-gateway.server";
import { discoverJobs, type DiscoveredJob } from "./job-providers.server";
import { extractJob } from "./job-extractor.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const matchSchema = z.object({
  skill_score: z.number().min(0).max(100),
  experience_score: z.number().min(0).max(100),
  location_score: z.number().min(0).max(100),
  resume_score: z.number().min(0).max(100),
  matched_skills: z.array(z.string()).default([]),
  missing_skills: z.array(z.string()).default([]),
  rationale: z.string().default(""),
});

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in AI response");
  return JSON.parse(raw.slice(start, end + 1));
}

function categorize(score: number): "excellent" | "strong" | "moderate" | "weak" {
  if (score >= 85) return "excellent";
  if (score >= 75) return "strong";
  if (score >= 60) return "moderate";
  return "weak";
}

export async function scoreJobAgainstProfile(profile: any, job: any) {
  const model = createLovableAi();
  const { text } = await generateText({
    model,
    messages: [
      {
        role: "system",
        content:
          "You score a job posting against a candidate profile. Return ONLY JSON: {skill_score, experience_score, location_score, resume_score, matched_skills, missing_skills, rationale}. Each score is 0-100. skill_score weighs 40%, experience 30%, location 10%, resume 20%. Be objective. Rationale: 2 short sentences.",
      },
      {
        role: "user",
        content: `CANDIDATE PROFILE:\n${JSON.stringify(
          {
            skills:
              profile.profile_resume_text
                ? profile.resume_parsed_skills?.length
                  ? profile.resume_parsed_skills
                  : profile.skills
                : profile.skills,
            technologies: profile.resume_parsed_technologies ?? [],
            years_experience: profile.years_experience,
            desired_roles: profile.desired_roles,
            preferred_locations: profile.preferred_locations,
            remote_preference: profile.remote_preference,
            resume_excerpt: (profile.profile_resume_text ?? "").slice(0, 4000),
          },
          null,
          2,
        )}\n\nJOB:\nTitle: ${job.title}\nCompany: ${job.company_name}\nLocation: ${job.location ?? "Unknown"}\nType: ${job.employment_type ?? "Unknown"}\nDescription:\n${(job.description ?? "").slice(0, 4000)}`,
      },
    ],
  });
  const parsed = matchSchema.parse(extractJson(text));
  const overall =
    parsed.skill_score * 0.4 +
    parsed.experience_score * 0.3 +
    parsed.location_score * 0.1 +
    parsed.resume_score * 0.2;
  return { ...parsed, overall_score: Math.round(overall * 100) / 100, category: categorize(overall) };
}

export type RunReport = {
  ok: boolean;
  scraped: number;
  newJobs: number;
  matched: number;
  skipped: number;
  scored: number;
  companiesChecked: number;
  extracted: number;
  extractionFailed: number;
  errors: { company: string; error: string }[];
  companyStatuses?: { company: string; status: "success" | "partial" | "failed" | "timeout"; found: number; saved: number; skipped: number; scored: number; source?: string; error?: string }[];
  sources?: Record<string, number>;
};

const ROLE_KEYWORDS = [
  ".net", "c#", "asp.net", "software engineer", "full stack", "fullstack",
  "full-stack", "backend", "back-end", "sql server", "azure", "java",
];
function matchesRoleFilter(j: { title?: string | null; description?: string | null }) {
  const hay = `${j.title ?? ""}\n${j.description ?? ""}`.toLowerCase();
  return ROLE_KEYWORDS.some((k) => hay.includes(k));
}

const MAX_JOBS_PER_COMPANY = 10;
const MAX_JOBS_PER_RUN = 50;
const COMPANY_TIMEOUT_MS = 5 * 60 * 1000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function runScrapeForUser(
  userId: string,
  opts: { companyId?: string; maxJobs?: number } = {},
): Promise<RunReport> {
  const report: RunReport = {
    ok: true, scraped: 0, newJobs: 0, matched: 0, skipped: 0, scored: 0,
    companiesChecked: 0, extracted: 0, extractionFailed: 0,
    errors: [], companyStatuses: [], sources: {},
  };

  const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle();
  let cq = supabaseAdmin.from("companies").select("*").eq("user_id", userId);
  if (opts.companyId) cq = cq.eq("id", opts.companyId);
  else cq = cq.eq("tracking_enabled", true);
  const { data: companies } = await cq;

  let totalSavedThisRun = 0;
  const runCap = Math.min(opts.maxJobs ?? MAX_JOBS_PER_RUN, MAX_JOBS_PER_RUN);

  for (const c of companies ?? []) {
    let errorMsg: string | null = null;
    let source = "generic";
    const cStat = { company: c.name, status: "success" as "success"|"partial"|"failed"|"timeout", found: 0, saved: 0, skipped: 0, scored: 0, source: undefined as string | undefined, error: undefined as string | undefined };
    report.companiesChecked += 1;
    if (totalSavedThisRun >= runCap) {
      cStat.status = "partial";
      cStat.error = "run cap reached; queued for next run";
      report.companyStatuses!.push(cStat);
      continue;
    }
    try {
      const result = await withTimeout(discoverJobs(c.careers_url), COMPANY_TIMEOUT_MS, `Scrape ${c.name}`);
      source = result.source;
      cStat.source = source;
      report.sources![source] = (report.sources![source] ?? 0) + result.jobs.length;
      if (result.diagnostics) (cStat as any).diagnostics = result.diagnostics;
      const allJobs = result.jobs as DiscoveredJob[];
      cStat.found = allJobs.length;
      report.scraped += allJobs.length;

      // For provider feeds we can pre-filter by description; for generic
      // results description is empty so filter only after extraction below.
      const providerHadDescription = source !== "generic" && source !== "firecrawl";
      const preFiltered = providerHadDescription ? allJobs.filter(matchesRoleFilter) : allJobs;
      const preSkipped = providerHadDescription ? allJobs.length - preFiltered.length : 0;
      cStat.skipped += preSkipped;
      report.skipped += preSkipped;

      // Per-company batch cap + global run cap.
      const remainingRun = runCap - totalSavedThisRun;
      const batch = preFiltered.slice(0, Math.min(MAX_JOBS_PER_COMPANY, remainingRun));
      const queuedForNext = preFiltered.length - batch.length;
      if (queuedForNext > 0) cStat.status = "partial";

      for (const j of batch) {
        // 1. Extract the detail page (skip the network round trip if the
        //    provider already gave us a real description).
        let extracted: Awaited<ReturnType<typeof extractJob>> | null = null;
        if (!providerHadDescription || !j.description) {
          try {
            extracted = await withTimeout(extractJob(j.apply_url, j.title), 20000, `Extract ${j.title}`);
          } catch {
            extracted = null;
          }
        }
        const finalTitle = extracted?.title || j.title;
        const finalLocation = extracted?.location ?? j.location ?? null;
        const finalDepartment = extracted?.department ?? null;
        const finalDescription = extracted?.description ?? j.description ?? null;
        const finalRequirements = extracted?.requirements ?? null;
        const extractionOk = providerHadDescription ? !!j.description : !!extracted?.diagnostics.success;
        const extractionDiag = extracted?.diagnostics ?? {
          success: !!j.description,
          source_url: j.apply_url,
          description_length: (j.description ?? "").length,
          requirements_found: false,
          qualifications_found: false,
          used_json_ld: false,
          provider_supplied: providerHadDescription,
        };
        if (extractionOk) report.extracted += 1; else report.extractionFailed += 1;

        // For generic sources, apply the role filter AFTER extraction so we
        // can read the real description text.
        if (!providerHadDescription) {
          const passes = matchesRoleFilter({ title: finalTitle, description: finalDescription });
          if (!passes) {
            report.skipped += 1;
            cStat.skipped += 1;
            continue;
          }
        }

        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("jobs")
          .upsert(
            {
              user_id: userId,
              company_id: c.id,
              company_name: c.name,
              title: finalTitle,
              location: finalLocation,
              employment_type: j.employment_type ?? null,
              posted_date: j.posted_date ?? null,
              apply_url: j.apply_url,
              source_url: c.careers_url,
              external_id: j.external_id ?? null,
              description: finalDescription,
              department: finalDepartment,
              requirements: finalRequirements,
              extraction_status: extractionOk ? "ok" : "failed",
              extraction_diagnostics: extractionDiag as any,
            },
            { onConflict: "user_id,apply_url", ignoreDuplicates: true },
          )
          .select("id, title, company_name, location, employment_type, description, requirements")
          .maybeSingle();
        if (insErr) continue;
        if (!inserted) continue;
        report.newJobs += 1;
        cStat.saved += 1;
        totalSavedThisRun += 1;
        if (profile && extractionOk) {
          try {
            const score = await scoreJobAgainstProfile(profile, inserted);
            await supabaseAdmin.from("job_matches").upsert(
              {
                user_id: userId,
                job_id: inserted.id,
                skill_score: score.skill_score,
                experience_score: score.experience_score,
                location_score: score.location_score,
                resume_score: score.resume_score,
                overall_score: score.overall_score,
                category: score.category,
                rationale: score.rationale,
                matched_skills: score.matched_skills,
                missing_skills: score.missing_skills,
              },
              { onConflict: "user_id,job_id" },
            );
            report.matched += 1;
            report.scored += 1;
            cStat.scored += 1;
          } catch (e) {
            // continue on AI scoring errors
          }
        }
        if (totalSavedThisRun >= runCap) break;
      }
    } catch (e) {
      errorMsg = (e as Error).message;
      cStat.status = /timed out/i.test(errorMsg) ? "timeout" : "failed";
      cStat.error = errorMsg;
      report.errors.push({ company: c.name, error: errorMsg });
    }
    report.companyStatuses!.push(cStat);
    await supabaseAdmin
      .from("companies")
      .update({
        last_scraped_at: new Date().toISOString(),
        last_scrape_status: errorMsg
          ? `${cStat.status}: ${errorMsg.slice(0, 200)}`
          : `${cStat.status} (${source}) ${cStat.saved}/${cStat.found}`,
      })
      .eq("id", c.id);
  }

  await supabaseAdmin.from("action_logs").insert({
    user_id: userId,
    action: "scrape.completed",
    metadata: report as any,
  });

  return report;
}

export async function importJobByUrl(
  userId: string,
  input: { url: string; title?: string | null; company?: string | null; description?: string | null; location?: string | null },
) {
  let title = input.title?.trim() || null;
  let company = input.company?.trim() || null;
  let description = input.description?.trim() || null;
  let location = input.location?.trim() || null;

  // Try to enrich missing fields from a quick HTML fetch (free).
  if (!title || !company || !description) {
    try {
      const res = await fetch(input.url, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; AIJobHunterBot/1.0)" },
      });
      if (res.ok) {
        const html = await res.text();
        if (!title) {
          const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i);
          const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          title = (og?.[1] ?? t?.[1] ?? "").trim() || null;
        }
        if (!company) {
          const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i);
          company = (og?.[1] ?? new URL(input.url).hostname.replace(/^www\./, "")).trim() || null;
        }
        if (!description) {
          const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i);
          const md = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i);
          description = (og?.[1] ?? md?.[1] ?? "").trim() || null;
        }
      }
    } catch {
      /* ignore enrichment failures */
    }
  }
  if (!title) title = "Imported job";
  if (!company) company = new URL(input.url).hostname.replace(/^www\./, "");

  const { data: inserted, error } = await supabaseAdmin
    .from("jobs")
    .upsert(
      {
        user_id: userId,
        company_name: company,
        title,
        location,
        apply_url: input.url,
        source_url: input.url,
        description,
      },
      { onConflict: "user_id,apply_url", ignoreDuplicates: false },
    )
    .select("id, title, company_name, location, employment_type, description")
    .single();
  if (error) throw new Error(error.message);

  if (inserted) {
    const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (profile) {
      try {
        const score = await scoreJobAgainstProfile(profile, inserted);
        await supabaseAdmin.from("job_matches").upsert(
          {
            user_id: userId,
            job_id: inserted.id,
            skill_score: score.skill_score,
            experience_score: score.experience_score,
            location_score: score.location_score,
            resume_score: score.resume_score,
            overall_score: score.overall_score,
            category: score.category,
            rationale: score.rationale,
            matched_skills: score.matched_skills,
            missing_skills: score.missing_skills,
          },
          { onConflict: "user_id,job_id" },
        );
      } catch {
        /* ignore scoring errors */
      }
    }
    await supabaseAdmin.from("action_logs").insert({
      user_id: userId,
      action: "job.imported_manual",
      target_type: "job",
      target_id: inserted.id,
      metadata: { apply_url: input.url },
    });
  }
  return inserted;
}

export async function runScrapeAllUsers(): Promise<{ users: number; totalNewJobs: number }> {
  const { data: userIds } = await supabaseAdmin
    .from("companies")
    .select("user_id")
    .eq("tracking_enabled", true);
  const unique = Array.from(new Set((userIds ?? []).map((r: any) => r.user_id as string)));
  let totalNewJobs = 0;
  for (const uid of unique) {
    const r = await runScrapeForUser(uid);
    totalNewJobs += r.newJobs;
  }
  return { users: unique.length, totalNewJobs };
}