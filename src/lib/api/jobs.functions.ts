import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { REJECT_TITLES, ACCEPT_TITLES, SOFTWARE_HINTS } from "@/lib/role-classifier";
import { JOB_KEYWORDS, matchKeywords } from "@/lib/job-keywords";

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
        keywords: z.array(z.string()).max(50).optional(),
        workMode: z.enum(["any", "remote", "hybrid", "onsite"]).optional(),
        usOnly: z.boolean().optional(),
        excludeIndia: z.boolean().optional(),
        showInternational: z.boolean().optional(),
        state: z.string().trim().max(80).optional(),
        city: z.string().trim().max(120).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("jobs")
      .select(
        "id, title, company_name, location, employment_type, posted_date, apply_url, description, requirements, department, city, state, country, work_mode, raw_location, matched_keywords, discovered_at, job_matches(overall_score, category, rationale, matched_skills, missing_skills), applications(id, status)",
      )
      .limit(data.limit);
    if (data.company) q = q.ilike("company_name", `%${data.company}%`);
    if (data.location) q = q.ilike("location", `%${data.location}%`);
    if (data.state) q = q.ilike("state", `%${data.state}%`);
    if (data.city) q = q.ilike("city", `%${data.city}%`);
    if (data.workMode && data.workMode !== "any") q = q.eq("work_mode", data.workMode);
    q = q.order("discovered_at", { ascending: false });
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let result = (rows ?? []).map((j: any) => ({
      ...j,
      match: j.job_matches?.[0] ?? null,
      application: j.applications?.[0] ?? null,
    }));
    // Full-text search across every job field, not just title.
    if (data.search) {
      const s = data.search.toLowerCase();
      result = result.filter((r) => {
        const hay = [
          r.title, r.company_name, r.location, r.description, r.requirements,
          r.department, r.city, r.state, r.country,
        ].filter(Boolean).join("\n").toLowerCase();
        return hay.includes(s);
      });
    }
    // Default location behavior: hide India + non-US unless user opts in.
    if (data.excludeIndia ?? true) {
      result = result.filter((r) => (r.country ?? "").toLowerCase() !== "india");
    }
    if (data.usOnly) {
      result = result.filter((r) => {
        const c = (r.country ?? "").toLowerCase();
        // Allow US, or remote with unknown country (commonly remote-US).
        return c === "united states" || (!r.country && r.work_mode === "remote");
      });
    } else if (!data.showInternational) {
      // Default: hide explicitly non-US jobs; keep US + unknown-country.
      result = result.filter((r) => {
        const c = (r.country ?? "").toLowerCase();
        return !c || c === "united states";
      });
    }
    // Keyword chip filter: match against stored matched_keywords OR recompute
    // from full text so old jobs (pre-migration) still respect the filter.
    if (data.keywords?.length) {
      const wanted = new Set(data.keywords);
      result = result.filter((r) => {
        const stored: string[] = r.matched_keywords ?? [];
        if (stored.some((k) => wanted.has(k))) return true;
        const live = matchKeywords({
          title: r.title, description: r.description,
          requirements: r.requirements, department: r.department,
        });
        return live.some((k) => wanted.has(k));
      });
    }
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
        if (SOFTWARE_HINTS.some((k) => t.includes(k))) return true;
        // Broaden using full-text keyword catalog so a software description
        // with a generic title (e.g. "Engineer II") still passes.
        const hay = `${r.title ?? ""}\n${r.description ?? ""}\n${r.requirements ?? ""}`.toLowerCase();
        return JOB_KEYWORDS.some((k) => k.aliases.some((a) => hay.includes(a)));
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
    z
      .object({
        companyId: z.string().uuid().optional(),
        mode: z.enum(["normal", "test", "us_software"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { runScrapeForUser } = await import("@/lib/server/scrape-pipeline.server");
    const report = await runScrapeForUser(context.userId, { companyId: data.companyId, mode: data.mode });
    return report;
  });

export const getLatestScrapeRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("action_logs")
      .select("action, metadata, created_at")
      .eq("user_id", context.userId)
      .in("action", ["scrape.completed", "scrape.test"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
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
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), force: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { scoreJobAgainstProfile } = await import("@/lib/server/scrape-pipeline.server");
    if (!data.force) {
      const { data: existing } = await supabaseAdmin
        .from("job_matches")
        .select("*")
        .eq("user_id", context.userId)
        .eq("job_id", data.id)
        .maybeSingle();
      if (existing) return { ...existing, cached: true as const };
    }
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
    return { ...score, cached: false as const };
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