import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Mail, Search, ShieldCheck, Clock } from "lucide-react";
import { triggerScrapeForMe } from "@/lib/api/jobs.functions";
import { getMyProfile, upsertMyProfile } from "@/lib/api/profile.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const scrapeFn = useServerFn(triggerScrapeForMe);
  const profileFn = useServerFn(getMyProfile);
  const updateFn = useServerFn(upsertMyProfile);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const scrape = useMutation({ mutationFn: () => scrapeFn(), onSuccess: (r: any) => { if (r?.skippedNoFirecrawl) toast.error("Firecrawl is not connected."); else toast.success(`Scraped ${r.scraped} · ${r.newJobs} new · ${r.matched} matched`); }, onError: (e: Error) => toast.error(e.message) });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const digestEnabled = (profile as any)?.daily_digest_enabled ?? true;
  const toggleDigest = useMutation({
    mutationFn: (next: boolean) => updateFn({ data: { daily_digest_enabled: next } as any }),
    onSuccess: () => { toast.success("Preferences saved."); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth" }); }

  return (
    <div className="space-y-6 max-w-3xl">
      <div><h1 className="text-2xl font-semibold">Settings</h1><p className="text-muted-foreground text-sm">Integrations, automations, and account</p></div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Search className="h-4 w-4 text-primary" /><h3 className="font-semibold">Job scraping (Firecrawl)</h3></div><Badge variant="outline">Connect required</Badge></div>
        <p className="text-sm text-muted-foreground">Scraping runs automatically every 12 hours. Without Firecrawl connected, the scheduler logs a "skipped" entry and no new jobs appear.</p>
        <div className="text-sm bg-muted/40 border rounded-md p-3 space-y-1">
          <p className="font-medium">How to connect</p>
          <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
            <li>Open the <span className="font-medium text-foreground">Connectors</span> panel in the Lovable sidebar.</li>
            <li>Search for <span className="font-medium text-foreground">Firecrawl</span> and click Connect.</li>
            <li>Sign in with your Firecrawl account (free tier works) and authorize this project.</li>
            <li>Return here and click <span className="font-medium text-foreground">Run scrape now</span> to verify.</li>
          </ol>
        </div>
        <Button onClick={() => scrape.mutate()} disabled={scrape.isPending} variant="outline">{scrape.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}Run scrape now</Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /><h3 className="font-semibold">Daily email digest (Resend)</h3></div><Badge variant="outline">Connect required</Badge></div>
        <p className="text-sm text-muted-foreground">Daily at 09:00 UTC, opted-in users receive their top 20 new matches with apply links. The cron job skips silently when Resend isn't connected.</p>
        <div className="text-sm bg-muted/40 border rounded-md p-3 space-y-1">
          <p className="font-medium">How to connect</p>
          <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
            <li>Open <span className="font-medium text-foreground">Connectors</span> in the sidebar and pick <span className="font-medium text-foreground">Resend</span>.</li>
            <li>Authorize with your Resend account, then verify a sending domain (use <code className="text-xs">onboarding@resend.dev</code> for testing).</li>
          </ol>
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div><Label htmlFor="digest">Email me a daily digest</Label><p className="text-xs text-muted-foreground">Sent only when Resend is connected.</p></div>
          <Switch id="digest" checked={digestEnabled} onCheckedChange={(v) => toggleDigest.mutate(v)} />
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /><h3 className="font-semibold">Automation schedule</h3></div>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Scraping & matching: <span className="text-foreground">every 12 hours</span></li>
          <li>• Daily digest: <span className="text-foreground">09:00 UTC</span> (if Resend connected)</li>
          <li>• On-demand: use <span className="text-foreground">Run scrape now</span> above or the Scrape button on the Jobs page.</li>
        </ul>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h3 className="font-semibold">Safety</h3></div>
        <p className="text-sm text-muted-foreground">Auto-apply is <span className="text-foreground font-medium">permanently disabled</span>. Every Apply action shows a confirmation dialog and only opens the employer's apply page in a new tab — you submit it yourself. Scraping, scoring, document generation, exports, and apply actions are recorded in the <span className="text-foreground">Audit Logs</span>.</p>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Account</h3>
        <Button variant="outline" onClick={signOut}>Sign out</Button>
      </Card>
    </div>
  );
}