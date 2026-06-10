import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDocuments, getDocumentUrl } from "@/lib/api/documents.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/resumes")({ component: ResumesPage });

function ResumesPage() {
  const listFn = useServerFn(listDocuments);
  const urlFn = useServerFn(getDocumentUrl);
  const { data, isLoading } = useQuery({ queryKey: ["docs", "resume"], queryFn: () => listFn({ data: { kind: "resume" } }) });

  async function download(id: string) {
    try { const r = await urlFn({ data: { id } }); window.open(r.url, "_blank"); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">Resumes</h1><p className="text-muted-foreground text-sm">ATS-optimized resumes generated for jobs scoring 75+</p></div>
      {isLoading ? (<Card className="p-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></Card>) : !data?.length ? (
        <Card className="p-12 text-center text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="font-medium">No resumes yet.</p><p className="text-sm mt-1">Generate one from the Jobs page on any 75+ match.</p></Card>
      ) : (
        <div className="grid gap-3">{data.map((d: any) => (
          <Card key={d.id} className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="font-medium truncate">{d.jobs?.title ?? "Resume"}</p><p className="text-sm text-muted-foreground">{d.jobs?.company_name} · {d.format.toUpperCase()} · {new Date(d.created_at).toLocaleString()}</p></div>
            <Button variant="outline" size="sm" onClick={() => download(d.id)}><Download className="h-4 w-4 mr-1" />Download</Button>
          </Card>
        ))}</div>
      )}
    </div>
  );
}