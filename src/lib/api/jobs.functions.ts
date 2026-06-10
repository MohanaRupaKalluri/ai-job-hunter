import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { REJECT_TITLES, ACCEPT_TITLES, SOFTWARE_HINTS } from "@/lib/role-classifier";

export const listJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().trim().max(200).optional(),
        minScore: z.number().min(0).max(100).optional(),
        company: z.string().trim().max(200).optional(),
        location: z.string().trim().max(200).optional(),
        category: z.enum(["excellent", "strong", "moderate", "weak", "all"]).optional(),
        sortBy: z.enum(["score", "newest"]).default("score"),
        limit: z.number().int().min(1).max(500).default(200),
        softwareOnly: z.boolean().optional(),
        hideRejected: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("jobs")
      .select(
        "id, title, company_name, location, employment_type, posted_date, apply_url, description, discovered_at, job_matches(overall_score, category, rationale, matched_skills, missing_skills), applications(id, status)",
      )
      .limit(data.limit);
    if (data.search) q = q.or(`title.ilike.%${data.search}%,company_name.ilike.%${data.search}%`);
    if (data.company) q = q.ilike("company_name", `%${data.company}%`);
    if (data.location) q = q.ilike("location", `%${data.location}%`);
    q = q.order("discovered_at", { ascending: false });
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let result = (rows ?? []).map((j: any) => ({
      ...j,
      match: j.job_matches?.[0] ?? null,
      application: j.applications?.[0] ?? null,
    }));
    if (data.hideRejected) {
      result = result.filter((r) => {
        const t = (r.title ?? "").toLowerCase();
        return !REJECT_TITLES.some((k) => t.includes(k));
      });
    }
    if (data.softwareOnly) {
      result = result.filter((r) => {
        const t = (r.title ?? "").toLowerCase();
        if (REJECT_TITLES.some((k) => t.includes(k))) return false;
        if (ACCEPT_TITLES.some((k) => t.includes(k))) return true;
        return SOFTWARE_HINTS.some((k) => t.includes(k));
      });
    }
    if (data.minScore != null) result = result.filter((r) => (r.match?.overall_score ?? 0) >= data.minScore!);
    if (data.category && data.category !== "all")
      result = result.filter((r) => r.match?.category === data.category);
    if (data.sortBy === "score")
      result.sort((a, b) => (b.match?.overall_score ?? 0) - (a.match?.overall_score ?? 0));
    return result;
  });

export const getJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("jobs")
      .select(
        "*, job_matches(*), applications(*), generated_documents(id, kind, format, storage_path, created_at)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const triggerScrapeForMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ companyId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { runScrapeForUser } = await import("@/lib/server/scrape-pipeline.server");
    const report = await runScrapeForUser(context.userId, { companyId: data.companyId });
    return report;
  });

export const clearAllJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error: mErr } = await context.supabase.from("job_matches").delete().eq("user_id", context.userId);
    if (mErr) throw new Error(mErr.message);
    const { error } = await context.supabase.from("jobs").delete().eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    await context.supabase.from("action_logs").insert({
      user_id: context.userId,
      action: "jobs.cleared",
    });
    return { ok: true };
  });

export const recalculateAllScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { scoreJobAgainstProfile } = await import("@/lib/server/scrape-pipeline.server");
    const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", context.userId).maybeSingle();
    if (!profile) throw new Error("Complete your profile first.");
    const { data: jobs } = await supabaseAdmin
      .from("jobs")
      .select("id, title, company_name, location, employment_type, description")
      .eq("user_id", context.userId)
      .limit(200);
    let scored = 0, failed = 0;
    for (const j of jobs ?? []) {
      try {
        const score = await scoreJobAgainstProfile(profile, j);
        await supabaseAdmin.from("job_matches").upsert(
          {
            user_id: context.userId,
            job_id: j.id,
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
        scored += 1;
      } catch {
        failed += 1;
      }
    }
    await supabaseAdmin.from("action_logs").insert({
      user_id: context.userId,
      action: "scores.recalculated",
      metadata: { scored, failed } as any,
    });
    return { scored, failed, total: jobs?.length ?? 0 };
  });

export const testMatchForJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { scoreJobAgainstProfile } = await import("@/lib/server/scrape-pipeline.server");
    const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", context.userId).maybeSingle();
    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile || !job) throw new Error("Job or profile not found.");
    const score = await scoreJobAgainstProfile(profile, job);
    await supabaseAdmin.from("job_matches").upsert(
      {
        user_id: context.userId,
        job_id: job.id,
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
    return score;
  });

export const importJobManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        url: z.string().trim().url(),
        title: z.string().trim().max(300).optional().or(z.literal("")),
        company: z.string().trim().max(200).optional().or(z.literal("")),
        location: z.string().trim().max(200).optional().or(z.literal("")),
        description: z.string().trim().max(20000).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { importJobByUrl } = await import("@/lib/server/scrape-pipeline.server");
    const job = await importJobByUrl(context.userId, {
      url: data.url,
      title: data.title || null,
      company: data.company || null,
      location: data.location || null,
      description: data.description || null,
    });
    return job;
  });