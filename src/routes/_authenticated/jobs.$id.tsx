import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getJob } from "@/lib/api/jobs.functions";

export const Route = createFileRoute("/_authenticated/jobs/$id")({
  component: JobDetailPage,
});

function scoreColor(s: number) {
  if (s >= 85) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  if (s >= 75) return "bg-sky-500/20 text-sky-300 border-sky-500/30";
  if (s >= 60) return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function JobDetailPage() {
  const { id } = Route.useParams();
  const fetchJob = useServerFn(getJob);
  const { data: job, isLoading } = useQuery({
    queryKey: ["job", id],
    queryFn: () => fetchJob({ data: { id } }),
  });

  if (isLoading) {
    return <Card className="p-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></Card>;
  }
  if (!job) {
    return <Card className="p-12 text-center text-muted-foreground">Job not found.</Card>;
  }

  const match = (job as any).job_matches?.[0] ?? null;
  const diag = (job as any).extraction_diagnostics ?? null;
  const status = (job as any).extraction_status ?? "unknown";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <Link to="/jobs" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" />All jobs</Link>
          <h1 className="text-2xl font-semibold">{(job as any).title}</h1>
          <p className="text-muted-foreground text-sm">
            {(job as any).company_name}
            {(job as any).location ? ` • ${(job as any).location}` : ""}
            {(job as any).department ? ` • ${(job as any).department}` : ""}
          </p>
        </div>
        <Button asChild><a href={(job as any).apply_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-2" />Open posting</a></Button>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={status === "ok" ? "secondary" : "destructive"}>Extraction: {status}</Badge>
          {diag?.used_json_ld ? <Badge variant="outline">JSON-LD</Badge> : null}
          {diag ? <Badge variant="outline">Description {diag.description_length} chars</Badge> : null}
          {diag ? <Badge variant="outline">{diag.requirements_found ? "Requirements ✓" : "No requirements"}</Badge> : null}
          {diag ? <Badge variant="outline">{diag.qualifications_found ? "Qualifications ✓" : "No qualifications"}</Badge> : null}
          {diag?.error ? <Badge variant="destructive">{diag.error}</Badge> : null}
        </div>
      </Card>

      {match && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold">Resume match</h2>
            <Badge variant="outline" className={scoreColor(match.overall_score)}>
              <Sparkles className="h-3 w-3 mr-1" />{match.overall_score} • {match.category}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{match.rationale}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Stat label="Skill" value={match.skill_score} />
            <Stat label="Experience" value={match.experience_score} />
            <Stat label="Location" value={match.location_score} />
            <Stat label="Resume" value={match.resume_score} />
          </div>
          {match.matched_skills?.length ? (
            <div>
              <p className="text-xs uppercase text-muted-foreground mb-1">Matched skills</p>
              <div className="flex flex-wrap gap-1">{match.matched_skills.map((s: string) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
            </div>
          ) : null}
          {match.missing_skills?.length ? (
            <div>
              <p className="text-xs uppercase text-muted-foreground mb-1">Missing skills</p>
              <div className="flex flex-wrap gap-1">{match.missing_skills.map((s: string) => <Badge key={s} variant="outline">{s}</Badge>)}</div>
            </div>
          ) : null}
        </Card>
      )}

      {(job as any).requirements && (
        <Card className="p-4">
          <h2 className="font-semibold mb-2">Parsed requirements</h2>
          <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{(job as any).requirements}</pre>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="font-semibold mb-2">Raw extracted description</h2>
        {(job as any).description ? (
          <pre className="whitespace-pre-wrap text-sm text-muted-foreground max-h-[600px] overflow-y-auto">{(job as any).description}</pre>
        ) : (
          <p className="text-sm text-muted-foreground">No description was extracted.</p>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border bg-muted/30 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{Math.round(value)}</div>
    </div>
  );
}