import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const statusEnum = z.enum([
  "found",
  "resume_generated",
  "cover_letter_generated",
  "applied",
  "interview",
  "rejected",
  "offer",
]);

export const listApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("applications")
      .select(
        "*, jobs(id, title, company_name, location, apply_url), resume_doc:generated_documents!applications_resume_document_id_fkey(id, storage_path, format), cover_doc:generated_documents!applications_cover_letter_document_id_fkey(id, storage_path, format)",
      )
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        job_id: z.string().uuid(),
        status: statusEnum.optional(),
        notes: z.string().max(5000).nullable().optional(),
        applied_at: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: any = { user_id: context.userId, job_id: data.job_id };
    if (data.status) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.applied_at !== undefined) patch.applied_at = data.applied_at;
    if (data.status === "applied" && !data.applied_at) patch.applied_at = new Date().toISOString();
    if (data.status === "interview") patch.interview_at = new Date().toISOString();
    if (data.status === "rejected") patch.rejected_at = new Date().toISOString();
    if (data.status === "offer") patch.offer_at = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("applications")
      .upsert(patch, { onConflict: "user_id,job_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("action_logs").insert({
      user_id: context.userId,
      action: `application.${data.status ?? "saved"}`,
      target_type: "application",
      target_id: row.id,
      metadata: { job_id: data.job_id },
    });
    return row;
  });

export const deleteApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("applications")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordApplyAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ job_id: z.string().uuid(), apply_url: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await context.supabase.from("action_logs").insert({
      user_id: context.userId,
      action: "application.opened_apply_url",
      target_type: "job",
      target_id: data.job_id,
      metadata: { apply_url: data.apply_url, auto_submitted: false },
    });
    return { ok: true };
  });