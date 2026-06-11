import { generateText } from "ai";
import { z } from "zod";
import { createLovableAi } from "./ai-gateway.server";
import { withAiErrors } from "./ai-errors.server";
import { discoverJobs, type DiscoveredJob } from "./job-providers.server";
import { extractJob } from "./job-extractor.server";
import { classifyRole, applyScoreCaps } from "@/lib/role-classifier";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const matchSchema = z.object({
  role_score: z.number().min(0).max(100),
  technical_score: z.number().min(0).max(100),
  experience_score: z.number().min(0).max(100),
  location_score: z.number().min(0).max(100),
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
  const roleClass = classifyRole(job.title, job.description);
  const { text } = await withAiErrors("AI match analysis", () => generateText({
    model,
    messages: [
      {
        role: "system",
        content:
          "You score a job posting against a candidate profile. Return ONLY JSON: {role_score, technical_score, experience_score, location_score, matched_skills, missing_skills, rationale}. Each score is 0-100. WEIGHTS: role_score 40%, technical_score 30%, experience_score 20%, location_score 10%. RULES: role_score must reflect how closely the job TITLE matches the candidate's target roles — internships, sales, marketing, trading, nursing, recruiting, coordinator, or any non-software role MUST score below 20. technical_score reflects overlap between the candidate's actual tools/languages and the JOB's stated requirements; if key required technologies are absent from the candidate's resume, score below 50. Be strict and objective. matched_skills lists skills explicitly present in BOTH profile and job. missing_skills lists job-required skills the candidate lacks. Rationale: 2 short sentences.",
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
  }));
  const parsed = matchSchema.parse(extractJson(text));
  const rawOverall =
    parsed.role_score * 0.4 +
    parsed.technical_score * 0.3 +
    parsed.experience_score * 0.2 +
    parsed.location_score * 0.1;
  const { overall, caps } = applyScoreCaps(rawOverall, {
    roleClass,
    matchedSkillsCount: parsed.matched_skills.length,
    missingSkillsCount: parsed.missing_skills.length,
  });
  const rationale = caps.length ? `${parsed.rationale} [${caps.join("; ")}]` : parsed.rationale;
  // Map to DB columns: skill_score = technical, resume_score = role (catch-all).
  return {
    skill_score: parsed.technical_score,
    experience_score: parsed.experience_score,
    location_score: parsed.location_score,
    resume_score: parsed.role_score,
    matched_skills: parsed.matched_skills,
    missing_skills: parsed.missing_skills,
    rationale,
    overall_score: overall,
    category: categorize(overall),
    role_class: roleClass,
  };
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
  companyStatuses?: {
    company: string;
    url?: string;
    status: "success" | "partial" | "failed" | "timeout" | "skipped";
    found: number;
    saved: number;
    skipped: number;
    scored: number;
    source?: string;
    error?: string;
    skipReasons?: { unrelated: number; duplicate: number; missing_description: number; error: number };
  }[];
  sources?: Record<string, number>;
  skipReasons?: { unrelated: number; duplicate: number; missing_description: number; error: number };
  finishedAt?: string;
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
  opts: { companyId?: string; maxJobs?: number; mode?: "normal" | "test" } = {},
): Promise<RunReport> {
  const report: RunReport = {
    ok: true, scraped: 0, newJobs: 0, matched: 0, skipped: 0, scored: 0,
    companiesChecked: 0, extracted: 0, extractionFailed: 0,
    errors: [], companyStatuses: [], sources: {},
    skipReasons: { unrelated: 0, duplicate: 0, missing_description: 0, error: 0 },
  };

  const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle();
  let cq = supabaseAdmin.from("companies").select("*").eq("user_id", userId);
  if (opts.companyId) cq = cq.eq("id", opts.companyId);
  else cq = cq.eq("tracking_enabled", true);
  const { data: companies } = await cq;

  let totalSavedThisRun = 0;
  const isTest = opts.mode === "test";
  const perCompanyCap = isTest ? 5 : MAX_JOBS_PER_COMPANY;
  const runCap = isTest ? (opts.maxJobs ?? 5) : Math.min(opts.maxJobs ?? MAX_JOBS_PER_RUN, MAX_JOBS_PER_RUN);

  for (const c of companies ?? []) {
    let errorMsg: string | null = null;
    let source = "generic";
    const cStat = {
      company: c.name,
      url: c.careers_url as string | undefined,
      status: "success" as "success"|"partial"|"failed"|"timeout"|"skipped",
      found: 0, saved: 0, skipped: 0, scored: 0,
      source: undefined as string | undefined,
      error: undefined as string | undefined,
      skipReasons: { unrelated: 0, duplicate: 0, missing_description: 0, error: 0 },
    };
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
      const preFiltered = providerHadDescription && !isTest ? allJobs.filter(matchesRoleFilter) : allJobs;
      const preSkipped = providerHadDescription ? allJobs.length - preFiltered.length : 0;
      cStat.skipped += preSkipped;
      cStat.skipReasons.unrelated += preSkipped;
      report.skipped += preSkipped;
      report.skipReasons!.unrelated += preSkipped;

      // Per-company batch cap + global run cap.
      const remainingRun = runCap - totalSavedThisRun;
      const batch = preFiltered.slice(0, Math.min(perCompanyCap, remainingRun));
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
        // can read the real description text. Test mode bypasses the filter.
        if (!providerHadDescription && !isTest) {
          const passes = matchesRoleFilter({ title: finalTitle, description: finalDescription });
          if (!passes) {
            report.skipped += 1;
            cStat.skipped += 1;
            cStat.skipReasons.unrelated += 1;
            report.skipReasons!.unrelated += 1;
            continue;
          }
        }

        if (!finalDescription || finalDescription.trim().length < 30) {
          // Still save it in test mode so the user can inspect raw discovery.
          if (!isTest) {
            report.skipped += 1;
            cStat.skipped += 1;
            cStat.skipReasons.missing_description += 1;
            report.skipReasons!.missing_description += 1;
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
        if (insErr) {
          report.skipped += 1;
          cStat.skipped += 1;
          cStat.skipReasons.error += 1;
          report.skipReasons!.error += 1;
          continue;
        }
        if (!inserted) {
          // Row already existed (duplicate apply_url for this user).
          report.skipped += 1;
          cStat.skipped += 1;
          cStat.skipReasons.duplicate += 1;
          report.skipReasons!.duplicate += 1;
          continue;
        }
        report.newJobs += 1;
        cStat.saved += 1;
        totalSavedThisRun += 1;
        if (profile && extractionOk && !isTest) {
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

  report.finishedAt = new Date().toISOString();
  await supabaseAdmin.from("action_logs").insert({
    user_id: userId,
    action: isTest ? "scrape.test" : "scrape.completed",
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