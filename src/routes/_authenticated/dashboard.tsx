import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getDashboardStats } from "@/lib/api/dashboard.functions";
import { getMyProfile } from "@/lib/api/profile.functions";
import { recalculateAllScores } from "@/lib/api/jobs.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, TrendingUp, Send, MessageSquare, Building2, Sparkles, Loader2, RefreshCw, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-3xl font-semibold mt-2">{value}</div>
    </Card>
  );
}

function Dashboard() {
  const qc = useQueryClient();
  const statsFn = useServerFn(getDashboardStats);
  const profileFn = useServerFn(getMyProfile);
  const recalcFn = useServerFn(recalculateAllScores);
  const { data: stats } = useSuspenseQuery(queryOptions({ queryKey: ["stats"], queryFn: () => statsFn() }));
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const recalc = useMutation({
    mutationFn: () => recalcFn(),
    onSuccess: (r: any) => {
      toast.success(`Recalculated ${r.scored}/${r.total} scores${r.failed ? ` · ${r.failed} failed` : ""}`);
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dist = stats.scoreDistribution ?? { excellent: 0, strong: 0, moderate: 0, weak: 0 };
  const distTotal = Math.max(1, dist.excellent + dist.strong + dist.moderate + dist.weak);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Overview of your automated job search</p>
        </div>
        <Button variant="outline" onClick={() => recalc.mutate()} disabled={recalc.isPending}>
          {recalc.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Recalculate scores
        </Button>
      </div>

      {profile && !profile.onboarded && (
        <Card className="p-5 border-primary/40" style={{ background: "color-mix(in oklab, var(--primary) 8%, transparent)" }}>
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold">Complete your profile</h3>
              <p className="text-sm text-muted-foreground mt-1">Add your skills, experience, and preferences so the AI can match you to the right jobs.</p>
            </div>
            <Button asChild><Link to="/profile">Complete profile</Link></Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total jobs found" value={stats.totalJobs} icon={Briefcase} />
        <Stat label="This week" value={stats.jobsThisWeek} icon={TrendingUp} />
        <Stat label="High match (75+)" value={stats.highMatch} icon={Sparkles} />
        <Stat label="Applications sent" value={stats.applicationsSent} icon={Send} />
        <Stat label="Interviews" value={stats.interviews} icon={MessageSquare} />
        <Stat label="Response rate" value={`${stats.responseRate}%`} icon={TrendingUp} />
        <Stat label="Tracked companies" value={stats.trackedCompanies} icon={Building2} />
        <Stat label="Rejected" value={stats.rejectedCount ?? 0} icon={XCircle} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Match score distribution</h3>
          <div className="space-y-2 text-sm">
            {([
              ["Excellent (85+)", dist.excellent, "bg-emerald-500"],
              ["Strong (75-84)", dist.strong, "bg-sky-500"],
              ["Moderate (60-74)", dist.moderate, "bg-amber-500"],
              ["Weak (<60)", dist.weak, "bg-muted-foreground"],
            ] as const).map(([label, count, color]) => (
              <div key={label}>
                <div className="flex justify-between text-xs"><span>{label}</span><span>{count}</span></div>
                <div className="h-2 rounded bg-muted overflow-hidden">
                  <div className={`h-full ${color}`} style={{ width: `${(count / distTotal) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Top matches</h3>
          {stats.topMatches?.length ? (
            <ul className="space-y-2 text-sm">
              {stats.topMatches.map((m: any) => m.job && (
                <li key={m.job.id} className="flex items-center justify-between gap-2">
                  <Link to="/jobs/$id" params={{ id: m.job.id }} className="truncate hover:underline">
                    {m.job.title} <span className="text-muted-foreground">— {m.job.company_name}</span>
                  </Link>
                  <Badge variant="outline">{Math.round(m.score)}</Badge>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No matches yet.</p>}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">New jobs</h3>
        {stats.newJobs?.length ? (
          <ul className="space-y-2 text-sm">
            {stats.newJobs.map((j: any) => (
              <li key={j.id} className="flex justify-between gap-2">
                <Link to="/jobs/$id" params={{ id: j.id }} className="truncate hover:underline">
                  {j.title} <span className="text-muted-foreground">— {j.company_name}</span>
                </Link>
                <span className="text-xs text-muted-foreground">{new Date(j.discovered_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No jobs discovered yet.</p>}
      </Card>
    </div>
  );
}