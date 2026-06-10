import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/_authenticated/resumes")({ component: () => <div className="space-y-4"><h1 className="text-2xl font-semibold">Resumes</h1><Card className="p-12 text-center text-muted-foreground">AI-generated ATS-optimized resumes will appear here (Phase 3).</Card></div> });