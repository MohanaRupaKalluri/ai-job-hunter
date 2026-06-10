import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("companies").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const companySchema = z.object({
  name: z.string().trim().min(1).max(200),
  careers_url: z.string().trim().url().max(1000),
  tracking_enabled: z.boolean().default(true),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => companySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("companies").insert({ ...data, user_id: context.userId }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), patch: companySchema.partial() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("companies").update(data.patch).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("companies").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkImportCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ rows: z.array(companySchema).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    if (!data.rows.length) return { inserted: 0 };
    const rows = data.rows.map((r) => ({ ...r, user_id: context.userId }));
    const { data: inserted, error } = await context.supabase.from("companies").upsert(rows, { onConflict: "user_id,careers_url", ignoreDuplicates: false }).select("id");
    if (error) throw new Error(error.message);
    return { inserted: inserted?.length ?? 0 };
  });