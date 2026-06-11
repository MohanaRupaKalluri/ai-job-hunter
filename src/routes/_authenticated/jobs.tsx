import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { ExternalLink, FileText, Mail, Bookmark, Sparkles, Download, RefreshCw, Loader2, Plus, Trash2, AlertTriangle, Info, RotateCw, ScrollText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { listJobs, triggerScrapeForMe, importJobManual, clearAllJobs, getLatestScrapeRun } from "@/lib/api/jobs.functions";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_CHIP_KEYWORDS } from "@/lib/job-keywords";
import { generateResumeForJob, generateCoverLetterForJob } from "@/lib/api/documents.functions";
import { upsertApplication, recordApplyAction } from "@/lib/api/applications.functions";

export const Route = createFileRoute("/_authenticated/jobs")({ component: JobsPage });

function scoreColor(s: number) {
  if (s >= 85) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  if (s >= 75) return "bg-sky-500/20 text-sky-300 border-sky-500/30";
  if (s >= 60) return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function JobsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listJobs);
  const scrapeFn = useServerFn(triggerScrapeForMe);
  const importFn = useServerFn(importJobManual);
  const clearFn = useServerFn(clearAllJobs);
  const latestFn = useServerFn(getLatestScrapeRun);
  const resumeFn = useServerFn(generateResumeForJob);
  const coverFn = useServerFn(generateCoverLetterForJob);
  const saveFn = useServerFn(upsertApplication);
  const recordFn = useServerFn(recordApplyAction);

  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState("0");
  const [category, setCategory] = useState<"all"|"excellent"|"strong"|"moderate"|"weak">("all");
  const [sortBy, setSortBy] = useState<"score"|"newest">("score");
  const [softwareOnly, setSoftwareOnly] = useState(true);
  const [hideRejected, setHideRejected] = useState(true);
  const [activeChips, setActiveChips] = useState<string[]>([]);
  const [workMode, setWorkMode] = useState<"any"|"remote"|"hybrid"|"onsite">("any");
  const [usOnly, setUsOnly] = useState(false);
  const [showInternational, setShowInternational] = useState(false);
  const [excludeIndia, setExcludeIndia] = useState(true);
  const [stateFilter, setStateFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [confirmJob, setConfirmJob] = useState<{id:string; apply_url:string; title:string}|null>(null);
  const [confirmScrape, setConfirmScrape] = useState(false);
  const [confirmUsScrape, setConfirmUsScrape] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [lastReport, setLastReport] = useState<any | null>(null);
  const [importForm, setImportForm] = useState({ url: "", title: "", company: "", location: "", description: "" });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs", search, minScore, category, sortBy, softwareOnly, hideRejected, activeChips, workMode, usOnly, showInternational, excludeIndia, stateFilter, cityFilter],
    queryFn: () => listFn({ data: {
      search: search || undefined,
      minScore: Number(minScore) || undefined,
      category, sortBy, softwareOnly, hideRejected,
      keywords: activeChips.length ? activeChips : undefined,
      workMode, usOnly, showInternational, excludeIndia,
      state: stateFilter || undefined,
      city: cityFilter || undefined,
    } }),
  });
  const { data: latestRun } = useQuery({
    queryKey: ["latest-scrape"],
    queryFn: () => latestFn(),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["jobs"] });
  const scrape = useMutation({
    mutationFn: (mode: "normal" | "us_software" = "normal") => scrapeFn({ data: { mode } }),
    onSuccess: (r: any) => {
      setLastReport(r);
      setLogsOpen(true);
      toast.success(
        `Checked ${r.companiesChecked} cos · found ${r.scraped} · saved ${r.newJobs} · filtered ${r.skipped} · scored ${r.scored}${r.errors?.length ? ` · ${r.errors.length} errors` : ""}`,
      );
      invalidate();
      qc.invalidateQueries({ queryKey: ["latest-scrape"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const clearJobs = useMutation({
    mutationFn: () => clearFn(),
    onSuccess: () => { toast.success("All jobs cleared"); setConfirmClear(false); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const importJob = useMutation({
    mutationFn: () => importFn({ data: importForm }),
    onSuccess: () => { toast.success("Job imported."); setImportOpen(false); setImportForm({ url: "", title: "", company: "", location: "", description: "" }); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const makeResume = useMutation({
    mutationFn: (v: { id: string; force?: boolean }) => resumeFn({ data: { job_id: v.id, force: !!v.force } }),
    onSuccess: (r: any) => { toast.success(r?.cached ? "Loaded existing resume (no AI used)." : "Resume generated (used ~1 AI credit)."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const makeCover = useMutation({
    mutationFn: (v: { id: string; force?: boolean }) => coverFn({ data: { job_id: v.id, force: !!v.force } }),
    onSuccess: (r: any) => { toast.success(r?.cached ? "Loaded existing cover letter (no AI used)." : "Cover letter generated (used ~1 AI credit)."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const addToTracker = useMutation({ mutationFn: (id: string) => saveFn({ data: { job_id: id, status: "found" } }), onSuccess: () => { toast.success("Added to tracker."); invalidate(); }, onError: (e: Error) => toast.error(e.message) });

  function exportRows(format: "csv"|"xlsx") {
    if (!jobs?.length) return;
    const rows = jobs.map((j: any) => ({ Title: j.title, Company: j.company_name, Location: j.location ?? "", Type: j.employment_type ?? "", Score: j.match?.overall_score ?? "", Category: j.match?.category ?? "", "Apply URL": j.apply_url, Discovered: j.discovered_at }));
    const ws = XLSX.utils.json_to_sheet(rows);
    if (format === "csv") { downloadBlob(new Blob([XLSX.utils.sheet_to_csv(ws)], { type: "text/csv" }), "jobs.csv"); return; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Jobs");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([buf], { type: "application/octet-stream" }), "jobs.xlsx");
  }

  function confirmApply() { if (!confirmJob) return; recordFn({ data: { job_id: confirmJob.id, apply_url: confirmJob.apply_url } }); window.open(confirmJob.apply_url, "_blank", "noopener,noreferrer"); setConfirmJob(null); }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-semibold">Jobs</h1><p className="text-muted-foreground text-sm">Discovered jobs scored against your profile</p></div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => exportRows("csv")} disabled={!jobs?.length}><Download className="h-4 w-4 mr-2" />CSV</Button>
          <Button variant="outline" onClick={() => exportRows("xlsx")} disabled={!jobs?.length}><Download className="h-4 w-4 mr-2" />XLSX</Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}><Plus className="h-4 w-4 mr-2" />Import URL</Button>
          <Button variant="outline" onClick={() => { setLastReport((latestRun as any)?.metadata ?? null); setLogsOpen(true); }}><ScrollText className="h-4 w-4 mr-2" />Scrape logs</Button>
          <Button variant="outline" onClick={() => setConfirmClear(true)} disabled={!jobs?.length}><Trash2 className="h-4 w-4 mr-2" />Clear jobs</Button>
          <Button variant="outline" onClick={() => setConfirmUsScrape(true)} disabled={scrape.isPending}>
            {scrape.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}US software only
          </Button>
          <Button onClick={() => setConfirmScrape(true)} disabled={scrape.isPending}>{scrape.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}Scrape now</Button>
        </div>
      </div>
      <Card className="p-4"><div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Input placeholder="Search title or company…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={minScore} onValueChange={setMinScore}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">Any score</SelectItem><SelectItem value="60">60+</SelectItem><SelectItem value="75">75+ (Strong)</SelectItem><SelectItem value="85">85+ (Excellent)</SelectItem></SelectContent></Select>
        <Select value={category} onValueChange={(v) => setCategory(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem><SelectItem value="excellent">Excellent</SelectItem><SelectItem value="strong">Strong</SelectItem><SelectItem value="moderate">Moderate</SelectItem><SelectItem value="weak">Weak</SelectItem></SelectContent></Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="score">Sort by score</SelectItem><SelectItem value="newest">Sort by newest</SelectItem></SelectContent></Select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        <Select value={workMode} onValueChange={(v) => setWorkMode(v as any)}>
          <SelectTrigger><SelectValue placeholder="Work mode" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any work mode</SelectItem>
            <SelectItem value="remote">Remote</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
            <SelectItem value="onsite">Onsite</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="State (e.g. Texas)" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} />
        <Input placeholder="City (e.g. Austin)" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {DEFAULT_CHIP_KEYWORDS.map((k) => {
          const active = activeChips.includes(k);
          return (
            <button
              key={k}
              onClick={() => setActiveChips((prev) => active ? prev.filter((x) => x !== k) : [...prev, k])}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 text-foreground border-border hover:bg-muted"}`}
            >{k}</button>
          );
        })}
        <button
          onClick={() => setUsOnly((v) => !v)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${usOnly ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 text-foreground border-border hover:bg-muted"}`}
        >United States</button>
        <button
          onClick={() => setWorkMode((v) => v === "remote" ? "any" : "remote")}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${workMode === "remote" ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 text-foreground border-border hover:bg-muted"}`}
        >Remote</button>
        {activeChips.length || usOnly || workMode !== "any" || stateFilter || cityFilter ? (
          <button
            onClick={() => { setActiveChips([]); setUsOnly(false); setWorkMode("any"); setStateFilter(""); setCityFilter(""); }}
            className="text-xs px-2.5 py-1 rounded-full border bg-transparent text-muted-foreground hover:bg-muted"
          >Clear filters</button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-6 mt-3 text-sm">
        <label className="flex items-center gap-2 cursor-pointer"><Switch checked={softwareOnly} onCheckedChange={setSoftwareOnly} />Software jobs only</label>
        <label className="flex items-center gap-2 cursor-pointer"><Switch checked={hideRejected} onCheckedChange={setHideRejected} />Hide rejected roles (interns, sales, etc.)</label>
        <label className="flex items-center gap-2 cursor-pointer"><Switch checked={excludeIndia} onCheckedChange={setExcludeIndia} />Exclude India</label>
        <label className="flex items-center gap-2 cursor-pointer"><Switch checked={showInternational} onCheckedChange={setShowInternational} />Show international jobs</label>
      </div>
      </Card>
      {isLoading ? (
        <Card className="p-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></Card>
      ) : !jobs?.length ? (
        <Card className="p-10 text-center space-y-4">
          <div>
            <p className="font-medium">No jobs found yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Try Scrape Selected Company or Import Job URL.</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            <Button variant="outline" asChild><Link to="/companies"><RefreshCw className="h-4 w-4 mr-2" />Scrape Selected Company</Link></Button>
            <Button onClick={() => setConfirmUsScrape(true)} disabled={scrape.isPending}>
              {scrape.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Scrape All — US Software Only
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}><Plus className="h-4 w-4 mr-2" />Import Job URL</Button>
          </div>
          {latestRun ? (
            <p className="text-xs text-muted-foreground">
              Last run: saved {(latestRun as any).metadata?.newJobs ?? 0} of {(latestRun as any).metadata?.scraped ?? 0} discovered ·{" "}
              <button className="underline" onClick={() => { setLastReport((latestRun as any).metadata); setLogsOpen(true); }}>view scrape logs</button>
            </p>
          ) : null}
        </Card>
      ) : (<div className="grid gap-3">{jobs.map((j: any) => { const score = j.match?.overall_score ?? 0; const canGen = score >= 75; return (
        <Card key={j.id} className="p-4"><div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold truncate">{j.title}</h3>{j.match && (<Badge variant="outline" className={scoreColor(score)}><Sparkles className="h-3 w-3 mr-1" />{score} • {j.match.category}</Badge>)}</div>
            <p className="text-sm text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{j.company_name}</span>
              {j.location ? (
                <span>• {j.location}</span>
              ) : (
                <Badge variant="outline" className="text-xs">Location Unknown</Badge>
              )}
              {j.work_mode && j.work_mode !== "unknown" ? (
                <Badge variant="secondary" className="text-xs capitalize">{j.work_mode}</Badge>
              ) : null}
              {j.country && j.country !== "United States" ? (
                <Badge variant="outline" className="text-xs">{j.country}</Badge>
              ) : null}
              {j.employment_type ? <span>• {j.employment_type}</span> : null}
            </p>
            {j.matched_keywords?.length ? (
              <div className="flex flex-wrap gap-1 mt-2">
                {j.matched_keywords.slice(0, 8).map((k: string) => (
                  <Badge key={k} variant="secondary" className="text-xs">{k}</Badge>
                ))}
              </div>
            ) : null}
            {j.match?.rationale && (<p className="text-xs text-muted-foreground mt-2 line-clamp-2">{j.match.rationale}</p>)}
            {j.match?.matched_skills?.length ? (<div className="flex flex-wrap gap-1 mt-2">{j.match.matched_skills.slice(0,6).map((s: string) => (<Badge key={s} variant="secondary" className="text-xs">{s}</Badge>))}</div>) : null}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => addToTracker.mutate(j.id)}><Bookmark className="h-4 w-4 mr-1" />Track</Button>
            <Button variant="outline" size="sm" asChild><Link to="/jobs/$id" params={{ id: j.id }}><Info className="h-4 w-4 mr-1" />Details</Link></Button>
            <Button variant="outline" size="sm" disabled={!canGen || makeResume.isPending} onClick={() => makeResume.mutate({ id: j.id })} title={canGen ? "Use cached resume or generate one (≈1 credit)" : "Available for 75+ matches"}>{makeResume.isPending && (makeResume.variables as any)?.id === j.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}Resume</Button>
            <Button variant="ghost" size="icon" disabled={!canGen || makeResume.isPending} onClick={() => makeResume.mutate({ id: j.id, force: true })} title="Regenerate resume (≈1 credit)" className="h-8 w-8"><RotateCw className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="sm" disabled={makeCover.isPending} onClick={() => makeCover.mutate({ id: j.id })} title="Use cached cover letter or generate one (≈1 credit)">{makeCover.isPending && (makeCover.variables as any)?.id === j.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}Cover</Button>
            <Button variant="ghost" size="icon" disabled={makeCover.isPending} onClick={() => makeCover.mutate({ id: j.id, force: true })} title="Regenerate cover letter (≈1 credit)" className="h-8 w-8"><RotateCw className="h-3.5 w-3.5" /></Button>
            <Button size="sm" onClick={() => setConfirmJob({ id: j.id, apply_url: j.apply_url, title: j.title })}><ExternalLink className="h-4 w-4 mr-1" />Apply</Button>
          </div>
        </div></Card>
      ); })}</div>)}
      <Dialog open={!!confirmJob} onOpenChange={(o) => !o && setConfirmJob(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Open application page?</DialogTitle><DialogDescription>AI Job Hunter never submits applications for you. We'll open the employer's apply URL in a new tab so you can review and submit it yourself.</DialogDescription></DialogHeader>
          <p className="text-sm bg-muted p-3 rounded font-mono break-all">{confirmJob?.apply_url}</p>
          <DialogFooter><Button variant="ghost" onClick={() => setConfirmJob(null)}>Cancel</Button><Button onClick={confirmApply}>I understand, open page</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import job manually</DialogTitle>
            <DialogDescription>Paste any job posting URL. Title, company, and description are auto-detected when possible; you can also paste the description for the best AI match score.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label htmlFor="imp-url">Job URL *</Label><Input id="imp-url" placeholder="https://…" value={importForm.url} onChange={(e) => setImportForm({ ...importForm, url: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="imp-title">Title</Label><Input id="imp-title" value={importForm.title} onChange={(e) => setImportForm({ ...importForm, title: e.target.value })} /></div>
              <div><Label htmlFor="imp-company">Company</Label><Input id="imp-company" value={importForm.company} onChange={(e) => setImportForm({ ...importForm, company: e.target.value })} /></div>
            </div>
            <div><Label htmlFor="imp-loc">Location</Label><Input id="imp-loc" value={importForm.location} onChange={(e) => setImportForm({ ...importForm, location: e.target.value })} /></div>
            <div><Label htmlFor="imp-desc">Description (paste for best matching)</Label><Textarea id="imp-desc" rows={6} value={importForm.description} onChange={(e) => setImportForm({ ...importForm, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={() => importJob.mutate()} disabled={!importForm.url || importJob.isPending}>{importJob.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Import job</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmScrape} onOpenChange={setConfirmScrape}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-400" />Scrape all tracked companies?</DialogTitle>
            <DialogDescription>
              This checks every company with tracking enabled. To stay within timeouts and AI budget, each run is capped at <strong>10 jobs per company</strong> and <strong>50 jobs total</strong>. Only roles matching .NET / C# / ASP.NET / Software Engineer / Full Stack / Backend / SQL Server / Azure / Java are saved. Remaining jobs are queued for the next run.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmScrape(false)}>Cancel</Button>
            <Button onClick={() => { setConfirmScrape(false); scrape.mutate("normal"); }}>Run full scrape</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmUsScrape} onOpenChange={setConfirmUsScrape}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-400" />Scrape all — US software only?</DialogTitle>
            <DialogDescription>
              Runs a wider sweep capped at <strong>20 jobs per company</strong> and <strong>300 jobs total</strong>. Skips non-software roles, India, and other non-US locations before saving. You'll see per-skip reasons in the scrape log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmUsScrape(false)}>Cancel</Button>
            <Button onClick={() => { setConfirmUsScrape(false); scrape.mutate("us_software"); }}>Run US software scrape</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all jobs?</DialogTitle>
            <DialogDescription>This permanently deletes every discovered job and its match scores. Use for testing. Applications and generated documents are not deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => clearJobs.mutate()} disabled={clearJobs.isPending}>{clearJobs.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Delete all</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scrape logs</DialogTitle>
            <DialogDescription>Per-company breakdown of the latest scrape run.</DialogDescription>
          </DialogHeader>
          {lastReport ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Companies" value={lastReport.companiesChecked} />
                <Stat label="Jobs discovered" value={lastReport.scraped} />
                <Stat label="Jobs saved" value={lastReport.newJobs} />
                <Stat label="Jobs filtered" value={lastReport.skipped} />
                <Stat label="Jobs scored" value={lastReport.scored} />
                <Stat label="Extracted" value={lastReport.extracted} />
                <Stat label="Extract failed" value={lastReport.extractionFailed} />
                <Stat label="Errors" value={lastReport.errors?.length ?? 0} />
              </div>
              {lastReport.skipReasons ? (
                <div className="text-xs text-muted-foreground">
                  Skip reasons —{" "}
                  {Object.entries(lastReport.skipReasons)
                    .filter(([, v]: any) => Number(v) > 0)
                    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
                    .join(" · ") || "none"}
                </div>
              ) : null}
              <div className="rounded border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Company</th>
                      <th className="text-left p-2">Provider</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-right p-2">Found</th>
                      <th className="text-right p-2">Saved</th>
                      <th className="text-right p-2">Skipped</th>
                      <th className="text-left p-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(lastReport.companyStatuses ?? []).map((s: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 font-medium">
                          {s.company}
                          {s.url ? <div className="text-muted-foreground truncate max-w-[14rem]">{s.url}</div> : null}
                        </td>
                        <td className="p-2">{s.source ?? "—"}</td>
                        <td className="p-2">
                          <span className={
                            s.status === "success" ? "text-emerald-300" :
                            s.status === "partial" ? "text-amber-300" :
                            s.status === "timeout" ? "text-orange-300" :
                            s.status === "failed" ? "text-destructive" : "text-muted-foreground"
                          }>{s.status}</span>
                        </td>
                        <td className="p-2 text-right">{s.found}</td>
                        <td className="p-2 text-right">{s.saved}</td>
                        <td className="p-2 text-right">{s.skipped}</td>
                        <td className="p-2 text-muted-foreground">
                          {s.error ?? (s.skipReasons
                            ? Object.entries(s.skipReasons).filter(([,v]: any) => v > 0).map(([k,v]) => `${k.replace("_"," ")}: ${v}`).join(" · ")
                            : "")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No scrape runs yet. Click "Scrape now" to start one.</p>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setLogsOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border bg-muted/30 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{String(value ?? 0)}</div>
    </div>
  );
}