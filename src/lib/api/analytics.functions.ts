import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [jobsAll, jobsWeek, excellent, strong, apps, interviews, rejections, offers] = await Promise.all([
      sb.from("jobs").select("id", { count: "exact", head: true }),
      sb.from("jobs").select("id", { count: "exact", head: true }).gte("discovered_at", weekAgo),
      sb.from("job_matches").select("id", { count: "exact", head: true }).eq("category", "excellent"),
      sb.from("job_matches").select("id", { count: "exact", head: true }).eq("category", "strong"),
      sb
        .from("applications")
        .select("id", { count: "exact", head: true })
        .in("status", ["applied", "interview", "rejected", "offer"]),
      sb.from("applications").select("id", { count: "exact", head: true }).eq("status", "interview"),
      sb.from("applications").select("id", { count: "exact", head: true }).eq("status", "rejected"),
      sb.from("applications").select("id", { count: "exact", head: true }).eq("status", "offer"),
    ]);

    const applicationsSent = apps.count ?? 0;
    const interviewCount = interviews.count ?? 0;
    const responseRate = applicationsSent > 0 ? Math.round((interviewCount / applicationsSent) * 100) : 0;

    const { data: trend } = await sb
      .from("jobs")
      .select("discovered_at")
      .gte("discovered_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order("discovered_at", { ascending: true });
    const byDay: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      byDay[d.toISOString().slice(0, 10)] = 0;
    }
    for (const j of trend ?? []) {
      const k = (j.discovered_at as string).slice(0, 10);
      if (k in byDay) byDay[k] += 1;
    }

    return {
      totalJobs: jobsAll.count ?? 0,
      jobsThisWeek: jobsWeek.count ?? 0,
      excellentMatches: excellent.count ?? 0,
      strongMatches: strong.count ?? 0,
      applicationsSent,
      interviews: interviewCount,
      rejections: rejections.count ?? 0,
      offers: offers.count ?? 0,
      responseRate,
      trend: Object.entries(byDay).map(([date, count]) => ({ date, count })),
    };
  });