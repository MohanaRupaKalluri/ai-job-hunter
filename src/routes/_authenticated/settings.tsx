import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Mail, Search } from "lucide-react";
import { triggerScrapeForMe } from "@/lib/api/jobs.functions";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const scrapeFn = useServerFn(triggerScrapeForMe);
  const navigate = useNavigate();
  const scrape = useMutation({ mutationFn: () => scrapeFn(), onSuccess: (r: any) => { if (r?.skippedNoFirecrawl) toast.error("Firecrawl is not connected."); else toast.success(`Scraped ${r.scraped} · ${r.newJobs} new · ${r.matched} matched`); }, onError: (e: Error) => toast.error(e.message) });

  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth" }); }

  return (
    <div className="space-y-6 max-w-3xl">
      <div><h1 className="text-2xl font-semibold">Settings</h1><p className="text-muted-foreground text-sm">Integrations, automations, and account</p></div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Search className="h-4 w-4 text-primary" /><h3 className="font-semibold">Job scraping (Firecrawl)</h3></div><Badge variant="outline">Connect required</Badge></div>
        <p className="text-sm text-muted-foreground">Scraping runs every 12 hours via cron. Connect the Firecrawl integration so the scheduler can fetch your tracked companies. Without it, the scrape button will report that Firecrawl is missing.</p>
        <Button onClick={() => scrape.mutate()} disabled={scrape.isPending} variant="outline">{scrape.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}Run scrape now</Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /><h3 className="font-semibold">Daily email digest (Resend)</h3></div><Badge variant="outline">Disabled</Badge></div>
        <p className="text-sm text-muted-foreground">When the Resend integration is connected, a daily email will send your top 20 matches with apply links and generated docs. This feature is intentionally disabled until you connect Resend.</p>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Safety</h3>
        <p className="text-sm text-muted-foreground">Auto-apply is permanently disabled. Every apply action opens the employer page in a new tab and requires explicit user confirmation. All scraping, scoring, generation, exports, and apply actions are recorded in the Audit Logs.</p>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Account</h3>
        <Button variant="outline" onClick={signOut}>Sign out</Button>
      </Card>
    </div>
  );
}