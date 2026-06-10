import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [jobsAll, jobsWeek, highMatch, applied, interviews, companies] = await Promise.all([
      supabase.from("jobs").select("id", { count: "exact", head: true }),
      supabase.from("jobs").select("id", { count: "exact", head: true }).gte("discovered_at", weekAgo),
      supabase.from("job_matches").select("id", { count: "exact", head: true }).gte("overall_score", 75),
      supabase.from("applications").select("id", { count: "exact", head: true }).in("status", ["applied", "interview", "offer", "rejected"]),
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "interview"),
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("tracking_enabled", true),
    ]);
    const sent = applied.count ?? 0;
    const interviewCount = interviews.count ?? 0;
    return {
      totalJobs: jobsAll.count ?? 0,
      jobsThisWeek: jobsWeek.count ?? 0,
      highMatch: highMatch.count ?? 0,
      applicationsSent: sent,
      interviews: interviewCount,
      responseRate: sent > 0 ? Math.round((interviewCount / sent) * 100) : 0,
      trackedCompanies: companies.count ?? 0,
    };
  });