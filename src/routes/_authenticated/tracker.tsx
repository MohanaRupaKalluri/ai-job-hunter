import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Download, Loader2, Trash2 } from "lucide-react";
import { listApplications, upsertApplication, deleteApplication } from "@/lib/api/applications.functions";

export const Route = createFileRoute("/_authenticated/tracker")({ component: TrackerPage });

const COLS = [
  { key: "found", title: "Saved" },
  { key: "resume_generated", title: "Resume Ready" },
  { key: "applied", title: "Applied" },
  { key: "interview", title: "Interview" },
  { key: "offer", title: "Offer" },
  { key: "rejected", title: "Rejected" },
] as const;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

function TrackerPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listApplications);
  const upsertFn = useServerFn(upsertApplication);
  const delFn = useServerFn(deleteApplication);
  const { data, isLoading } = useQuery({ queryKey: ["applications"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<any>(null);
  const [notes, setNotes] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["applications"] });
  const mUpdate = useMutation({ mutationFn: (v: any) => upsertFn({ data: v }), onSuccess: () => { toast.success("Updated"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const mDelete = useMutation({ mutationFn: (id: string) => delFn({ data: { id } }), onSuccess: () => { toast.success("Removed"); invalidate(); } });

  function exportTracker(format: "csv"|"xlsx") {
    if (!data?.length) return;
    const rows = data.map((a: any) => ({ Job: a.jobs?.title, Company: a.jobs?.company_name, Location: a.jobs?.location ?? "", Status: a.status, AppliedAt: a.applied_at ?? "", Notes: a.notes ?? "" }));
    const ws = XLSX.utils.json_to_sheet(rows);
    if (format === "csv") { downloadBlob(new Blob([XLSX.utils.sheet_to_csv(ws)], { type: "text/csv" }), "tracker.csv"); return; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Applications");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([buf], { type: "application/octet-stream" }), "tracker.xlsx");
  }

  function openEdit(a: any) { setEditing(a); setNotes(a.notes ?? ""); }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-semibold">Application Tracker</h1><p className="text-muted-foreground text-sm">Track each job from saved to offer</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => exportTracker("csv")} disabled={!data?.length}><Download className="h-4 w-4 mr-2" />CSV</Button><Button variant="outline" onClick={() => exportTracker("xlsx")} disabled={!data?.length}><Download className="h-4 w-4 mr-2" />XLSX</Button></div>
      </div>
      {isLoading ? (<Card className="p-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></Card>) : !data?.length ? (<Card className="p-12 text-center text-muted-foreground"><p className="font-medium">No applications yet.</p><p className="text-sm mt-1">Click "Track" on any job to add it here.</p></Card>) : (
        <Tabs defaultValue="kanban">
          <TabsList><TabsTrigger value="kanban">Kanban</TabsTrigger><TabsTrigger value="table">Table</TabsTrigger></TabsList>
          <TabsContent value="kanban">
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {COLS.map((c) => (
                <Card key={c.key} className="p-3 min-h-48">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">{c.title}</p>
                  <div className="space-y-2">{data.filter((a: any) => a.status === c.key).map((a: any) => (
                    <button key={a.id} onClick={() => openEdit(a)} className="w-full text-left bg-muted/40 hover:bg-muted p-2 rounded text-sm transition-colors"><p className="font-medium truncate">{a.jobs?.title}</p><p className="text-xs text-muted-foreground truncate">{a.jobs?.company_name}</p></button>
                  ))}</div>
                </Card>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="table">
            <Card><Table><TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Company</TableHead><TableHead>Status</TableHead><TableHead>Applied</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
              <TableBody>{data.map((a: any) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => openEdit(a)}>
                  <TableCell className="font-medium">{a.jobs?.title}</TableCell><TableCell>{a.jobs?.company_name}</TableCell>
                  <TableCell><Select value={a.status} onValueChange={(v) => mUpdate.mutate({ job_id: a.job_id, status: v })}><SelectTrigger className="w-40" onClick={(e) => e.stopPropagation()}><SelectValue /></SelectTrigger><SelectContent>{COLS.map((c) => (<SelectItem key={c.key} value={c.key}>{c.title}</SelectItem>))}</SelectContent></Select></TableCell>
                  <TableCell className="text-muted-foreground text-sm">{a.applied_at ? new Date(a.applied_at).toLocaleDateString() : "—"}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); mDelete.mutate(a.id); }}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}</TableBody></Table></Card>
          </TabsContent>
        </Tabs>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.jobs?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{editing?.jobs?.company_name}</p>
            <Select value={editing?.status ?? "found"} onValueChange={(v) => { mUpdate.mutate({ job_id: editing.job_id, status: v }); setEditing({ ...editing, status: v }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{COLS.map((c) => (<SelectItem key={c.key} value={c.key}>{c.title}</SelectItem>))}</SelectContent>
            </Select>
            <Textarea placeholder="Notes…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} />
          </div>
          <DialogFooter><Button onClick={() => { mUpdate.mutate({ job_id: editing.job_id, notes }); setEditing(null); }}>Save notes</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}