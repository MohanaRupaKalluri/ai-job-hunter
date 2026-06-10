import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ kind: z.enum(["resume", "cover_letter"]).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("generated_documents")
      .select("*, jobs(id, title, company_name)")
      .order("created_at", { ascending: false });
    if (data.kind) q = q.eq("kind", data.kind);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("generated_documents")
      .select("storage_path, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !doc) throw new Error("Document not found");
    if (doc.user_id !== context.userId) throw new Error("Forbidden");
    const { data: signed, error: sErr } = await context.supabase.storage
      .from("generated-docs")
      .createSignedUrl(doc.storage_path, 60 * 10);
    if (sErr) throw new Error(sErr.message);
    return { url: signed!.signedUrl };
  });

export const generateResumeForJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ job_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { runResumeGeneration } = await import("@/lib/server/document-pipeline.server");
    const out = await runResumeGeneration(context.userId, data.job_id);
    return out;
  });

export const generateCoverLetterForJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ job_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { runCoverLetterGeneration } = await import("@/lib/server/document-pipeline.server");
    const out = await runCoverLetterGeneration(context.userId, data.job_id);
    return out;
  });