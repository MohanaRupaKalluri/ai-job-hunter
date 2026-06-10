import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
  .handler(async ({ context }) => {
    const { runScrapeForUser } = await import("@/lib/server/scrape-pipeline.server");
    const report = await runScrapeForUser(context.userId);
    return report;
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