import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/_authenticated/analytics")({ component: () => <div className="space-y-4"><h1 className="text-2xl font-semibold">Analytics</h1><Card className="p-12 text-center text-muted-foreground">Charts and trend analysis coming in Phase 4.</Card></div> });