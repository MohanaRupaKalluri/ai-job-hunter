import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/_authenticated/tracker")({ component: () => <div className="space-y-4"><h1 className="text-2xl font-semibold">Application Tracker</h1><Card className="p-12 text-center text-muted-foreground">Kanban + table view of applications (Phase 4).</Card></div> });