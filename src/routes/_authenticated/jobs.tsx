import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/_authenticated/jobs")({ component: () => <Placeholder title="Jobs" desc="Discovered jobs will appear here once the scraper runs (Phase 2)." /> });
function Placeholder({ title, desc }: { title: string; desc: string }) {
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">{title}</h1><Card className="p-12 text-center text-muted-foreground">{desc}</Card></div>;
}