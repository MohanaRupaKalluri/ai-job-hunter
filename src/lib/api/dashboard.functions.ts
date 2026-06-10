import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [jobsAll, jobsWeek, highMatch, applied, interviews, companies, rejected, allMatches, topMatchesRaw, recentJobs] = await Promise.all([
      supabase.from("jobs").select("id", { count: "exact", head: true }),
      supabase.from("jobs").select("id", { count: "exact", head: true }).gte("discovered_at", weekAgo),
      supabase.from("job_matches").select("id", { count: "exact", head: true }).gte("overall_score", 75),
      supabase.from("applications").select("id", { count: "exact", head: true }).in("status", ["applied", "interview", "offer", "rejected"]),
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "interview"),
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("tracking_enabled", true),
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "rejected"),
      supabase.from("job_matches").select("overall_score").limit(1000),
      supabase
        .from("job_matches")
        .select("overall_score, category, jobs(id, title, company_name)")
        .order("overall_score", { ascending: false })
        .limit(5),
      supabase
        .from("jobs")
        .select("id, title, company_name, discovered_at")
        .order("discovered_at", { ascending: false })
        .limit(5),
    ]);
    const sent = applied.count ?? 0;
    const interviewCount = interviews.count ?? 0;
    const buckets = { excellent: 0, strong: 0, moderate: 0, weak: 0 };
    for (const m of (allMatches.data ?? []) as { overall_score: number }[]) {
      const s = m.overall_score ?? 0;
      if (s >= 85) buckets.excellent += 1;
      else if (s >= 75) buckets.strong += 1;
      else if (s >= 60) buckets.moderate += 1;
      else buckets.weak += 1;
    }
    return {
      totalJobs: jobsAll.count ?? 0,
      jobsThisWeek: jobsWeek.count ?? 0,
      highMatch: highMatch.count ?? 0,
      applicationsSent: sent,
      interviews: interviewCount,
      responseRate: sent > 0 ? Math.round((interviewCount / sent) * 100) : 0,
      trackedCompanies: companies.count ?? 0,
      rejectedCount: rejected.count ?? 0,
      scoreDistribution: buckets,
      topMatches: (topMatchesRaw.data ?? []).map((m: any) => ({
        score: m.overall_score,
        category: m.category,
        job: m.jobs,
      })),
      newJobs: recentJobs.data ?? [],
    };
  });