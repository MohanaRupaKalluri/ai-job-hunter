import { generateText } from "ai";
import { z } from "zod";
import { scrapeCareerPage, hasFirecrawl } from "./firecrawl.server";
import { createLovableAi } from "./ai-gateway.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const jobsSchema = z.object({
  jobs: z
    .array(
      z.object({
        title: z.string(),
        location: z.string().nullable().optional(),
        employment_type: z.string().nullable().optional(),
        posted_date: z.string().nullable().optional(),
        apply_url: z.string(),
        description: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

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

function absoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

export async function extractJobsFromPage(careersUrl: string) {
  const { markdown, links } = await scrapeCareerPage(careersUrl);
  const linkSample = links.slice(0, 60).join("\n");
  const model = createLovableAi();
  const { text } = await generateText({
    model,
    messages: [
      {
        role: "system",
        content:
          "You extract job listings from career page content. Return ONLY a JSON object {\"jobs\": [{title, location?, employment_type?, posted_date? (YYYY-MM-DD), apply_url, description?}]}. apply_url MUST be one of the links provided, choose the most likely apply URL for each role. Do not invent jobs; only extract what is clearly listed.",
      },
      {
        role: "user",
        content: `Source URL: ${careersUrl}\n\nPAGE CONTENT (markdown, truncated):\n${markdown}\n\nLINKS ON PAGE:\n${linkSample}`,
      },
    ],
  });
  const parsed = jobsSchema.parse(extractJson(text));
  return parsed.jobs.map((j) => ({
    ...j,
    apply_url: absoluteUrl(j.apply_url, careersUrl),
    posted_date: j.posted_date && /^\d{4}-\d{2}-\d{2}$/.test(j.posted_date) ? j.posted_date : null,
  }));
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
            skills: profile.skills,
            years_experience: profile.years_experience,
            desired_roles: profile.desired_roles,
            preferred_locations: profile.preferred_locations,
            remote_preference: profile.remote_preference,
            summary: profile.summary ?? "",
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
  errors: { company: string; error: string }[];
  skippedNoFirecrawl?: boolean;
};

export async function runScrapeForUser(userId: string): Promise<RunReport> {
  const report: RunReport = { ok: true, scraped: 0, newJobs: 0, matched: 0, errors: [] };
  if (!hasFirecrawl()) return { ...report, ok: false, skippedNoFirecrawl: true };

  const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle();
  const { data: companies } = await supabaseAdmin
    .from("companies")
    .select("*")
    .eq("user_id", userId)
    .eq("tracking_enabled", true);

  for (const c of companies ?? []) {
    let status = "ok";
    let errorMsg: string | null = null;
    try {
      const jobs = await extractJobsFromPage(c.careers_url);
      report.scraped += jobs.length;
      for (const j of jobs) {
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("jobs")
          .upsert(
            {
              user_id: userId,
              company_id: c.id,
              company_name: c.name,
              title: j.title,
              location: j.location ?? null,
              employment_type: j.employment_type ?? null,
              posted_date: j.posted_date,
              apply_url: j.apply_url,
              source_url: c.careers_url,
              description: j.description ?? null,
            },
            { onConflict: "user_id,apply_url", ignoreDuplicates: true },
          )
          .select("id, title, company_name, location, employment_type, description")
          .maybeSingle();
        if (insErr) continue;
        if (!inserted) continue;
        report.newJobs += 1;
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
            report.matched += 1;
          } catch (e) {
            // continue on AI scoring errors
          }
        }
      }
    } catch (e) {
      status = "error";
      errorMsg = (e as Error).message;
      report.errors.push({ company: c.name, error: errorMsg });
    }
    await supabaseAdmin
      .from("companies")
      .update({ last_scraped_at: new Date().toISOString(), last_scrape_status: errorMsg ? `error: ${errorMsg.slice(0, 200)}` : status })
      .eq("id", c.id);
  }

  await supabaseAdmin.from("action_logs").insert({
    user_id: userId,
    action: "scrape.completed",
    metadata: report as any,
  });

  return report;
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