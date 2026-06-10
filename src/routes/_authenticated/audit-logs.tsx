import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listLogs } from "@/lib/api/logs.functions";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit-logs")({ component: AuditLogsPage });

function AuditLogsPage() {
  const fn = useServerFn(listLogs);
  const { data, isLoading } = useQuery({ queryKey: ["logs"], queryFn: () => fn({ data: { limit: 200 } }) });

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">Audit Logs</h1><p className="text-muted-foreground text-sm">Every action performed by you or the system</p></div>
      {isLoading ? (<Card className="p-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></Card>) : !data?.length ? (<Card className="p-12 text-center text-muted-foreground">No activity yet.</Card>) : (
        <Card><Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
          <TableBody>{data.map((l: any) => (
            <TableRow key={l.id}>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</TableCell>
              <TableCell className="font-mono text-xs">{l.action}</TableCell>
              <TableCell className="text-xs">{l.target_type ?? "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-md truncate">{l.metadata && Object.keys(l.metadata).length ? JSON.stringify(l.metadata) : "—"}</TableCell>
            </TableRow>
          ))}</TableBody></Table></Card>
      )}
    </div>
  );
}