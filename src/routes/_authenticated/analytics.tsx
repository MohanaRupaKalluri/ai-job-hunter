import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAnalytics } from "@/lib/api/analytics.functions";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({ component: AnalyticsPage });

function Stat({ label, value }: { label: string; value: number|string }) {
  return <Card className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="text-3xl font-semibold mt-2">{value}</p></Card>;
}

function AnalyticsPage() {
  const fn = useServerFn(getAnalytics);
  const { data, isLoading } = useQuery({ queryKey: ["analytics"], queryFn: () => fn() });

  if (isLoading || !data) return <Card className="p-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></Card>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">Analytics</h1><p className="text-muted-foreground text-sm">Performance across your job search</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total jobs found" value={data.totalJobs} />
        <Stat label="New this week" value={data.jobsThisWeek} />
        <Stat label="Excellent matches" value={data.excellentMatches} />
        <Stat label="Strong matches" value={data.strongMatches} />
        <Stat label="Applications sent" value={data.applicationsSent} />
        <Stat label="Interviews" value={data.interviews} />
        <Stat label="Rejections" value={data.rejections} />
        <Stat label="Offers" value={data.offers} />
      </div>
      <Card className="p-5"><p className="text-sm text-muted-foreground mb-2">Response rate</p><p className="text-3xl font-semibold">{data.responseRate}%</p></Card>
      <Card className="p-5">
        <p className="text-sm font-medium mb-3">Jobs discovered (last 14 days)</p>
        <div className="h-64"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.trend}>
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
            <Line type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer></div>
      </Card>
    </div>
  );
}