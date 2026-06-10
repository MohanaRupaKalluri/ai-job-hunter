import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCompanies, createCompany, updateCompany, deleteCompany, bulkImportCompanies } from "@/lib/api/companies.functions";
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
import { Plus, Trash2, Upload, RefreshCw, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/companies")({ component: CompaniesPage });

function CompaniesPage() {
  const listFn = useServerFn(listCompanies);
  const createFn = useServerFn(createCompany);
  const updateFn = useServerFn(updateCompany);
  const deleteFn = useServerFn(deleteCompany);
  const bulkFn = useServerFn(bulkImportCompanies);
  const scrapeFn = useServerFn(triggerScrapeForMe);
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
    mutationFn: (companyId: string) => scrapeFn({ data: { companyId } }),
    onSuccess: (r: any) => {
      const cs = r?.companyStatuses?.[0];
      toast.success(
        `${cs?.company ?? "Company"}: ${cs?.status ?? "ok"} · saved ${r.newJobs}/${r.scraped} · skipped ${r.skipped} · scored ${r.scored}`,
      );
      invalidate();
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
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
                      <Button size="icon" variant="ghost" title="Scrape this company" disabled={scrapeOne.isPending} onClick={() => scrapeOne.mutate(c.id)}>
                        {scrapeOne.isPending && scrapeOne.variables === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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
    </div>
  );
}