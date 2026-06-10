import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, upsertMyProfile } from "@/lib/api/profile.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });

function ProfilePage() {
  const getFn = useServerFn(getMyProfile);
  const saveFn = useServerFn(upsertMyProfile);
  const qc = useQueryClient();
  const { data: profile } = useSuspenseQuery(queryOptions({ queryKey: ["profile"], queryFn: () => getFn() }));

  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", linkedin_url: "", github_url: "", portfolio_url: "",
    current_resume_url: "", skills: "", years_experience: "" as string | number,
    desired_roles: "", preferred_locations: "", remote_preference: "any" as "remote" | "hybrid" | "onsite" | "any",
    visa_sponsorship_required: false, salary_min: "" as string | number, salary_max: "" as string | number, salary_currency: "USD",
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name ?? "", email: profile.email ?? "", phone: profile.phone ?? "",
      linkedin_url: profile.linkedin_url ?? "", github_url: profile.github_url ?? "", portfolio_url: profile.portfolio_url ?? "",
      current_resume_url: profile.current_resume_url ?? "",
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
      current_resume_url: form.current_resume_url || null,
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

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <p className="text-muted-foreground text-sm">Used by the AI to match you to jobs and tailor resumes</p>
      </div>

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
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Years of experience</Label><Input type="number" min={0} step="0.5" value={form.years_experience} onChange={(e) => set("years_experience", e.target.value)} /></div>
          <div><Label>Current resume URL</Label><Input value={form.current_resume_url} onChange={(e) => set("current_resume_url", e.target.value)} placeholder="https://..." /></div>
        </div>
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