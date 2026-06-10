import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats } from "@/lib/api/dashboard.functions";
import { getMyProfile } from "@/lib/api/profile.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, TrendingUp, Send, MessageSquare, Building2, Sparkles } from "lucide-react";

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
  const statsFn = useServerFn(getDashboardStats);
  const profileFn = useServerFn(getMyProfile);
  const { data: stats } = useSuspenseQuery(queryOptions({ queryKey: ["stats"], queryFn: () => statsFn() }));
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overview of your automated job search</p>
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
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-2">Next steps</h3>
        <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-5">
          <li>Complete your <Link to="/profile" className="text-primary underline">profile</Link></li>
          <li>Add target <Link to="/companies" className="text-primary underline">companies</Link> to monitor</li>
          <li>The scraper will run every 12 hours (Phase 2)</li>
        </ol>
      </Card>
    </div>
  );
}