import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Mail, Search, ShieldCheck, Clock, FileText } from "lucide-react";
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
  const scrape = useMutation({ mutationFn: () => scrapeFn(), onSuccess: (r: any) => toast.success(`Scraped ${r.scraped} · ${r.newJobs} new · ${r.matched} matched`), onError: (e: Error) => toast.error(e.message) });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const digestEnabled = (profile as any)?.daily_digest_enabled ?? true;
  const toggleDigest = useMutation({
    mutationFn: (next: boolean) => updateFn({ data: { daily_digest_enabled: next } as any }),
    onSuccess: () => { toast.success("Preferences saved."); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth" }); }

  const p: any = profile ?? {};
  const resumeStatus = p.resume_status ?? "none";

  return (
    <div className="space-y-6 max-w-3xl">
      <div><h1 className="text-2xl font-semibold">Settings</h1><p className="text-muted-foreground text-sm">Integrations, automations, and account</p></div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h3 className="font-semibold">Resume</h3></div>
          <Badge variant="outline" className={resumeStatus === "ready" ? "border-emerald-500/40 text-emerald-300" : ""}>{resumeStatus}</Badge>
        </div>
        {p.resume_path ? (
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• File: <span className="text-foreground">{p.resume_filename}</span></li>
            <li>• Last upload: <span className="text-foreground">{p.resume_uploaded_at ? new Date(p.resume_uploaded_at).toLocaleString() : "—"}</span></li>
            <li>• Parsed skills: <span className="text-foreground">{(p.resume_parsed_skills ?? []).length}</span></li>
            <li>• Parsed experience: <span className="text-foreground">{p.resume_parsed_years_experience ?? "—"} yrs</span></li>
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No resume uploaded yet. Add one on the <span className="text-foreground">Profile</span> page to power AI job matching.</p>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Search className="h-4 w-4 text-primary" /><h3 className="font-semibold">Job discovery</h3></div><Badge variant="outline" className="border-emerald-500/40 text-emerald-300">Built-in · No key needed</Badge></div>
        <p className="text-sm text-muted-foreground">Discovery runs every 12 hours and is also available on demand. It auto-detects the best provider per company URL:</p>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li><span className="text-foreground">Greenhouse</span> — public Job Board API (e.g. <code className="text-xs">boards.greenhouse.io/acme</code>)</li>
          <li><span className="text-foreground">Lever</span> — public Postings API (e.g. <code className="text-xs">jobs.lever.co/acme</code>)</li>
          <li><span className="text-foreground">Workable</span> — public job feed (e.g. <code className="text-xs">apply.workable.com/acme</code>)</li>
          <li><span className="text-foreground">Generic HTML</span> — fetch + link extraction for everything else</li>
          <li><span className="text-foreground">Manual import</span> — paste any job URL from the Jobs page</li>
        </ul>
        <div className="text-sm bg-muted/40 border rounded-md p-3 space-y-1">
          <p className="font-medium">Firecrawl (optional)</p>
          <p className="text-muted-foreground">Only needed for JavaScript-heavy career pages that don't render meaningful HTML on first fetch. The app works without it. To enable: open the <span className="text-foreground">Connectors</span> panel, find <span className="text-foreground">Firecrawl</span>, and authorize. The pipeline will use it automatically when generic fetch returns nothing.</p>
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