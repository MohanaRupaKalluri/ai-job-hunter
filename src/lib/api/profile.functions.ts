import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const profileSchema = z.object({
  full_name: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  linkedin_url: z.string().trim().url().max(500).nullable().optional().or(z.literal("")),
  github_url: z.string().trim().url().max(500).nullable().optional().or(z.literal("")),
  portfolio_url: z.string().trim().url().max(500).nullable().optional().or(z.literal("")),
  current_resume_url: z.string().trim().max(1000).nullable().optional(),
  skills: z.array(z.string().trim().max(60)).max(200).default([]),
  years_experience: z.number().min(0).max(80).nullable().optional(),
  desired_roles: z.array(z.string().trim().max(120)).max(50).default([]),
  preferred_locations: z.array(z.string().trim().max(120)).max(50).default([]),
  remote_preference: z.enum(["remote", "hybrid", "onsite", "any"]).default("any"),
  visa_sponsorship_required: z.boolean().default(false),
  salary_min: z.number().int().min(0).nullable().optional(),
  salary_max: z.number().int().min(0).nullable().optional(),
  salary_currency: z.string().trim().max(8).default("USD"),
  daily_digest_enabled: z.boolean().optional(),
});

export const upsertMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => profileSchema.partial().parse(input))
  .handler(async ({ data, context }) => {
    const payload = { ...data, id: context.userId, onboarded: true };
    const { error } = await context.supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) throw new Error(error.message);
    await context.supabase.from("action_logs").insert({
      user_id: context.userId, action: "profile.updated", target_type: "profile", target_id: context.userId,
    });
    return { ok: true };
  });