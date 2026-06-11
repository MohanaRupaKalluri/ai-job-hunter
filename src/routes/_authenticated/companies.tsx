import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCompanies, createCompany, updateCompany, deleteCompany, bulkImportCompanies, discoveryTest, extractionTest, enableAllTracking } from "@/lib/api/companies.functions";
import { triggerScrapeForMe } from "@/lib/api/jobs.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Upload, RefreshCw, Loader2, Search, FlaskConical, Zap, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/companies")({ component: CompaniesPage });

function CompaniesPage() {
  const listFn = useServerFn(listCompanies);
  const createFn = useServerFn(createCompany);
  const updateFn = useServerFn(updateCompany);
  const deleteFn = useServerFn(deleteCompany);
  const bulkFn = useServerFn(bulkImportCompanies);
  const scrapeFn = useServerFn(triggerScrapeForMe);
  const discoverFn = useServerFn(discoveryTest);
  const extractFn = useServerFn(extractionTest);
  const enableAllFn = useServerFn(enableAllTracking);
  const qc = useQueryClient();
  const { data: companies } = useSuspenseQuery(queryOptions({ queryKey: ["companies"], queryFn: () => listFn() }));

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["companies"] });

  const create = useMutation({
    mutationFn: () => createFn({ data: { name, careers_url: url, tracking_enabled: true } }),
    onSuccess: () => { toast.success("Company added"); setName(""); setUrl(""); setOpen(false); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; tracking_enabled: boolean }) => updateFn({ data: { id: v.id, patch: { tracking_enabled: v.tracking_enabled } } }),
    onSuccess: invalidate,
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); invalidate(); },
  });

  const scrapeOne = useMutation({
    mutationFn: (v: { companyId: string; mode?: "test" | "normal" }) =>
      scrapeFn({ data: { companyId: v.companyId, mode: v.mode } }),
    onSuccess: (r: any) => {
      const cs = r?.companyStatuses?.[0];
      toast.success(
        `${cs?.company ?? "Company"}: ${cs?.status ?? "ok"} · saved ${r.newJobs}/${r.scraped} · skipped ${r.skipped} · scored ${r.scored}`,
      );
      invalidate();
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["latest-scrape"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enableAll = useMutation({
    mutationFn: () => enableAllFn(),
    onSuccess: (r: any) => { toast.success(`Enabled tracking on ${r.updated} companies`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [discResult, setDiscResult] = useState<any | null>(null);
  const discover = useMutation({
    mutationFn: (id: string) => discoverFn({ data: { id } }),
    onSuccess: (r: any) => setDiscResult(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const [extractResult, setExtractResult] = useState<any | null>(null);
  const extractTest = useMutation({
    mutationFn: (id: string) => extractFn({ data: { id, limit: 5 } }),
    onSuccess: (r: any) => setExtractResult(r),
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleCsv(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const rows: { name: string; careers_url: string; tracking_enabled: boolean }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0 && /name/i.test(line) && /url/i.test(line)) continue;
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length >= 2 && cols[0] && /^https?:\/\//.test(cols[1])) {
        rows.push({ name: cols[0], careers_url: cols[1], tracking_enabled: true });
      }
    }
    if (!rows.length) return toast.error("No valid rows found (expected: name,url)");
    try {
      const res = await bulkFn({ data: { rows } });
      toast.success(`Imported ${res.inserted} companies`);
      invalidate();
    } catch (e) { toast.error((e as Error).message); }
  }

  const disabledCount = companies.filter((c: any) => !c.tracking_enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Companies</h1>
          <p className="text-muted-foreground text-sm">Career pages to monitor every 12 hours</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsv(f); e.target.value = ""; }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Import CSV</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add company</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add company</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" /></div>
                <div><Label>Careers URL</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://acme.com/careers" /></div>
              </div>
              <DialogFooter><Button onClick={() => create.mutate()} disabled={!name || !url || create.isPending}>Add</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {disabledCount > 0 && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5 flex items-center gap-3 flex-wrap">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-[14rem]">
            <p className="font-medium text-sm">{disabledCount} {disabledCount === 1 ? "company has" : "companies have"} tracking disabled</p>
            <p className="text-xs text-muted-foreground">Disabled companies are skipped during "Scrape now".</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => enableAll.mutate()} disabled={enableAll.isPending}>
            {enableAll.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Enable tracking for all
          </Button>
        </Card>
      )}

      <Card>
        {companies.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <p>No companies yet.</p>
            <p className="text-sm mt-1">Add one or import a CSV with columns: <code>name,url</code></p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Careers URL</TableHead>
                <TableHead>Last scraped</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="max-w-xs truncate"><a href={c.careers_url} target="_blank" rel="noreferrer" className="text-primary underline">{c.careers_url}</a></TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {c.last_scraped_at ? new Date(c.last_scraped_at).toLocaleString() : "Never"}
                    {c.last_scrape_status ? <div className="opacity-70">{c.last_scrape_status}</div> : null}
                  </TableCell>
                  <TableCell><Switch checked={c.tracking_enabled} onCheckedChange={(v) => toggle.mutate({ id: c.id, tracking_enabled: v })} /></TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" title="Discovery test (no save)" disabled={discover.isPending} onClick={() => discover.mutate(c.id)}>
                        {discover.isPending && discover.variables === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" title="Extraction test (first 5, no save)" disabled={extractTest.isPending} onClick={() => extractTest.mutate(c.id)}>
                        {extractTest.isPending && extractTest.variables === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" title="Test scrape (first 5, ignore role filter, no scoring)" disabled={scrapeOne.isPending} onClick={() => scrapeOne.mutate({ companyId: c.id, mode: "test" })}>
                        {scrapeOne.isPending && (scrapeOne.variables as any)?.companyId === c.id && (scrapeOne.variables as any)?.mode === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" title="Scrape this company" disabled={scrapeOne.isPending} onClick={() => scrapeOne.mutate({ companyId: c.id })}>
                        {scrapeOne.isPending && (scrapeOne.variables as any)?.companyId === c.id && !(scrapeOne.variables as any)?.mode ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => del.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!discResult} onOpenChange={(o) => !o && setDiscResult(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Discovery test · {discResult?.company}</DialogTitle>
          </DialogHeader>
          {discResult && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Source" value={discResult.source} />
                <Stat label="Career homepage" value={discResult.diagnostics?.isCareerHomepage ? "Yes" : "No"} />
                <Stat label="Pages visited" value={discResult.diagnostics?.pagesVisited?.length ?? 0} />
                <Stat label="Listing pages" value={discResult.diagnostics?.listingPagesFound?.length ?? 0} />
                <Stat label="Job links" value={discResult.diagnostics?.jobLinksDiscovered ?? 0} />
                <Stat label="Total jobs" value={discResult.total} />
              </div>
              <div>
                <p className="font-medium mb-1">Sample titles</p>
                {discResult.sampleTitles?.length ? (
                  <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                    {discResult.sampleTitles.map((t: string, i: number) => <li key={i}>{t}</li>)}
                  </ul>
                ) : <p className="text-muted-foreground">No titles found.</p>}
              </div>
              <div>
                <p className="font-medium mb-1">Sample URLs</p>
                {discResult.sampleUrls?.length ? (
                  <ul className="space-y-0.5 text-xs">
                    {discResult.sampleUrls.map((u: string, i: number) => (
                      <li key={i}><a href={u} target="_blank" rel="noreferrer" className="text-primary underline break-all">{u}</a></li>
                    ))}
                  </ul>
                ) : <p className="text-muted-foreground">No URLs found.</p>}
              </div>
              {discResult.diagnostics?.listingPagesFound?.length ? (
                <div>
                  <p className="font-medium mb-1">Listing pages followed</p>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {discResult.diagnostics.listingPagesFound.slice(0, 8).map((u: string, i: number) => (
                      <li key={i} className="break-all">{u}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setDiscResult(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!extractResult} onOpenChange={(o) => !o && setExtractResult(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Extraction test · {extractResult?.company}</DialogTitle>
          </DialogHeader>
          {extractResult && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Discovered" value={extractResult.discovered} />
                <Stat label="Tested" value={extractResult.tested} />
                <Stat label="Succeeded" value={extractResult.successes} />
                <Stat label="Source" value={extractResult.source} />
              </div>
              <p className="text-muted-foreground text-xs">
                Nothing was saved or scored. Use this to verify quality before running a full scrape.
              </p>
              <div className="space-y-3">
                {extractResult.results.map((r: any, i: number) => (
                  <div key={i} className="rounded border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.title || r.discovered_title}</div>
                        <a href={r.apply_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline break-all">{r.apply_url}</a>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {r.diagnostics ? <span className={`text-xs px-2 py-0.5 rounded border ${r.diagnostics.success ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"}`}>{r.diagnostics.success ? "ok" : "weak"}</span> : null}
                        {r.diagnostics?.used_json_ld ? <span className="text-xs px-2 py-0.5 rounded border">JSON-LD</span> : null}
                        {r.diagnostics ? <span className="text-xs px-2 py-0.5 rounded border">{r.diagnostics.description_length} chars</span> : null}
                      </div>
                    </div>
                    {r.location || r.department ? (
                      <p className="text-xs text-muted-foreground">{[r.location, r.department].filter(Boolean).join(" • ")}</p>
                    ) : null}
                    {r.description_excerpt ? (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">{r.description_excerpt}</p>
                    ) : r.error ? (
                      <p className="text-xs text-destructive">{r.error}</p>
                    ) : null}
                    {r.requirements_excerpt ? (
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">Requirements</p>
                        <p className="text-xs whitespace-pre-wrap line-clamp-4">{r.requirements_excerpt}</p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setExtractResult(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border bg-muted/30 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{String(value ?? "—")}</div>
    </div>
  );
}