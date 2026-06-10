import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, upsertMyProfile } from "@/lib/api/profile.functions";
import { uploadResume, deleteResume, getResumeDownloadUrl } from "@/lib/api/resume.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });

function ProfilePage() {
  const getFn = useServerFn(getMyProfile);
  const saveFn = useServerFn(upsertMyProfile);
  const uploadFn = useServerFn(uploadResume);
  const deleteFn = useServerFn(deleteResume);
  const downloadFn = useServerFn(getResumeDownloadUrl);
  const qc = useQueryClient();
  const { data: profile } = useSuspenseQuery(queryOptions({ queryKey: ["profile"], queryFn: () => getFn() }));

  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", linkedin_url: "", github_url: "", portfolio_url: "",
    skills: "", years_experience: "" as string | number,
    desired_roles: "", preferred_locations: "", remote_preference: "any" as "remote" | "hybrid" | "onsite" | "any",
    visa_sponsorship_required: false, salary_min: "" as string | number, salary_max: "" as string | number, salary_currency: "USD",
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name ?? "", email: profile.email ?? "", phone: profile.phone ?? "",
      linkedin_url: profile.linkedin_url ?? "", github_url: profile.github_url ?? "", portfolio_url: profile.portfolio_url ?? "",
      skills: (profile.skills ?? []).join(", "),
      years_experience: profile.years_experience ?? "",
      desired_roles: (profile.desired_roles ?? []).join(", "),
      preferred_locations: (profile.preferred_locations ?? []).join(", "),
      remote_preference: profile.remote_preference ?? "any",
      visa_sponsorship_required: profile.visa_sponsorship_required ?? false,
      salary_min: profile.salary_min ?? "", salary_max: profile.salary_max ?? "",
      salary_currency: profile.salary_currency ?? "USD",
    });
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => saveFn({ data: {
      full_name: form.full_name || null, email: form.email || null, phone: form.phone || null,
      linkedin_url: form.linkedin_url || null, github_url: form.github_url || null, portfolio_url: form.portfolio_url || null,
      skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      years_experience: form.years_experience === "" ? null : Number(form.years_experience),
      desired_roles: form.desired_roles.split(",").map((s) => s.trim()).filter(Boolean),
      preferred_locations: form.preferred_locations.split(",").map((s) => s.trim()).filter(Boolean),
      remote_preference: form.remote_preference,
      visa_sponsorship_required: form.visa_sponsorship_required,
      salary_min: form.salary_min === "" ? null : Number(form.salary_min),
      salary_max: form.salary_max === "" ? null : Number(form.salary_max),
      salary_currency: form.salary_currency || "USD",
    } }),
    onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["profile"] }); qc.invalidateQueries({ queryKey: ["stats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const fileRef = useRef<HTMLInputElement>(null);
  const uploading = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      return uploadFn({ data: { filename: file.name, mime_type: file.type, size: file.size, data_base64: b64 } });
    },
    onSuccess: (r) => {
      if (r.ok) toast.success("Resume uploaded and parsed.");
      else toast.error(`Parsing failed: ${r.error}`);
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removing = useMutation({
    mutationFn: () => deleteFn(),
    onSuccess: () => { toast.success("Resume removed."); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPickFile = (f: File | null | undefined) => {
    if (!f) return;
    const ok = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!ok.includes(f.type)) { toast.error("Please upload a PDF or DOCX file."); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error("File must be under 10 MB."); return; }
    uploading.mutate(f);
  };
  async function onDownload() {
    try { const { url } = await downloadFn(); window.open(url, "_blank", "noopener"); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  const hasResume = !!profile?.resume_path;
  const status = profile?.resume_status ?? "none";
  const sizeMB = profile?.resume_size_bytes ? (profile.resume_size_bytes / (1024 * 1024)).toFixed(2) : null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <p className="text-muted-foreground text-sm">Used by the AI to match you to jobs and tailor resumes</p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />Resume</h3>
          {status === "ready" && <Badge variant="outline" className="border-emerald-500/40 text-emerald-300"><CheckCircle2 className="h-3 w-3 mr-1" />Ready</Badge>}
          {status === "parsing" && <Badge variant="outline"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Parsing</Badge>}
          {status === "uploading" && <Badge variant="outline"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Uploading</Badge>}
          {status === "failed" && <Badge variant="outline" className="border-red-500/40 text-red-300"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>}
          {status === "none" && <Badge variant="outline">No resume</Badge>}
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0])} />
        {hasResume ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-medium truncate">{profile?.resume_filename}</p>
                <p className="text-xs text-muted-foreground">
                  {sizeMB ? `${sizeMB} MB` : ""}{profile?.resume_uploaded_at ? ` · uploaded ${new Date(profile.resume_uploaded_at).toLocaleString()}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onDownload}><Download className="h-4 w-4 mr-1" />Download</Button>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading.isPending}><Upload className="h-4 w-4 mr-1" />Replace</Button>
                <Button variant="outline" size="sm" onClick={() => removing.mutate()} disabled={removing.isPending}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
              </div>
            </div>
            {status === "ready" && (
              <p className="text-xs text-muted-foreground">
                Parsed {(profile?.resume_parsed_skills ?? []).length} skills · {(profile?.resume_parsed_technologies ?? []).length} technologies · {(profile?.resume_parsed_experience as any[] | undefined)?.length ?? 0} roles · {profile?.resume_parsed_years_experience ?? "?"} yrs experience. Used as the primary source for job matching.
              </p>
            )}
            {status === "failed" && profile?.resume_error && (
              <p className="text-xs text-red-300">{profile.resume_error}</p>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Upload your resume so AI can match jobs and tailor applications.</p>
            <Button onClick={() => fileRef.current?.click()} disabled={uploading.isPending}>
              {uploading.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</> : <><Upload className="h-4 w-4 mr-2" />Upload resume</>}
            </Button>
            <p className="text-xs text-muted-foreground">PDF or DOCX · up to 10 MB</p>
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Contact</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div><Label>LinkedIn URL</Label><Input value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/..." /></div>
          <div><Label>GitHub URL</Label><Input value={form.github_url} onChange={(e) => set("github_url", e.target.value)} placeholder="https://github.com/..." /></div>
          <div><Label>Portfolio URL</Label><Input value={form.portfolio_url} onChange={(e) => set("portfolio_url", e.target.value)} /></div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Experience & skills</h3>
        <div><Label>Skills (comma separated)</Label><Textarea rows={2} value={form.skills} onChange={(e) => set("skills", e.target.value)} placeholder="React, TypeScript, PostgreSQL, ..." /></div>
        <div><Label>Years of experience</Label><Input type="number" min={0} step="0.5" value={form.years_experience} onChange={(e) => set("years_experience", e.target.value)} /></div>
        <div><Label>Desired roles (comma separated)</Label><Input value={form.desired_roles} onChange={(e) => set("desired_roles", e.target.value)} placeholder="Senior Frontend Engineer, Full-stack Engineer" /></div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Preferences</h3>
        <div><Label>Preferred locations (comma separated)</Label><Input value={form.preferred_locations} onChange={(e) => set("preferred_locations", e.target.value)} placeholder="Remote, San Francisco, New York" /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Remote preference</Label>
            <Select value={form.remote_preference} onValueChange={(v) => set("remote_preference", v as typeof form.remote_preference)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="remote">Remote only</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="onsite">On-site</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div><Label>Visa sponsorship required</Label><p className="text-xs text-muted-foreground">Filter to companies that sponsor</p></div>
            <Switch checked={form.visa_sponsorship_required} onCheckedChange={(v) => set("visa_sponsorship_required", v)} />
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div><Label>Salary min</Label><Input type="number" min={0} value={form.salary_min} onChange={(e) => set("salary_min", e.target.value)} /></div>
          <div><Label>Salary max</Label><Input type="number" min={0} value={form.salary_max} onChange={(e) => set("salary_max", e.target.value)} /></div>
          <div><Label>Currency</Label><Input value={form.salary_currency} onChange={(e) => set("salary_currency", e.target.value)} /></div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving..." : "Save profile"}</Button>
      </div>
    </div>
  );
}