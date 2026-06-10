import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/_authenticated/cover-letters")({ component: () => <div className="space-y-4"><h1 className="text-2xl font-semibold">Cover Letters</h1><Card className="p-12 text-center text-muted-foreground">Tailored cover letters will appear here (Phase 3).</Card></div> });