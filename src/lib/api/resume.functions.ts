import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",", 2)[1] : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const uploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(120),
  size: z.number().int().min(1).max(MAX_BYTES),
  data_base64: z.string().min(8),
});

export const uploadResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!ALLOWED_MIME.includes(data.mime_type)) {
      throw new Error("Only PDF and DOCX files are accepted.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const bytes = decodeBase64(data.data_base64);
    if (bytes.byteLength > MAX_BYTES) throw new Error("Resume exceeds 10 MB limit.");

    // Archive previous resume if present
    const { data: prev } = await supabaseAdmin
      .from("profiles")
      .select("resume_path, resume_filename, resume_size_bytes, resume_mime_type, resume_uploaded_at")
      .eq("id", userId)
      .maybeSingle();
    if (prev?.resume_path) {
      await supabaseAdmin.from("resume_archive").insert({
        user_id: userId,
        storage_path: prev.resume_path,
        filename: prev.resume_filename,
        size_bytes: prev.resume_size_bytes,
        mime_type: prev.resume_mime_type,
        uploaded_at: prev.resume_uploaded_at,
      });
    }

    const ext = data.mime_type === "application/pdf" ? "pdf" : "docx";
    const ts = Date.now();
    const path = `${userId}/resume-${ts}.${ext}`;
    const up = await supabaseAdmin.storage.from("resumes").upload(path, bytes, {
      contentType: data.mime_type,
      upsert: true,
    });
    if (up.error) throw new Error(up.error.message);

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("profiles")
      .update({
        resume_path: path,
        resume_filename: data.filename,
        resume_size_bytes: bytes.byteLength,
        resume_mime_type: data.mime_type,
        resume_uploaded_at: now,
        resume_status: "parsing",
        resume_error: null,
      })
      .eq("id", userId);

    await supabaseAdmin.from("action_logs").insert({
      user_id: userId, action: "resume.uploaded", target_type: "profile", target_id: userId,
      metadata: { filename: data.filename, size: bytes.byteLength },
    });

    // Parse synchronously (Workers don't support background tasks)
    try {
      const { extractResumeText, parseResumeText } = await import("@/lib/server/resume-parser.server");
      const text = await extractResumeText(bytes, data.mime_type);
      if (!text || text.length < 30) throw new Error("Could not extract readable text from resume.");
      const parsed = await parseResumeText(text);

      // Fetch current profile to know which fields are empty
      const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle();
      const fillIfEmpty: Record<string, unknown> = {};
      if (profile) {
        if (!profile.full_name && parsed.full_name) fillIfEmpty.full_name = parsed.full_name;
        if (!profile.email && parsed.email) fillIfEmpty.email = parsed.email;
        if (!profile.phone && parsed.phone) fillIfEmpty.phone = parsed.phone;
        if (!profile.linkedin_url && parsed.linkedin_url) fillIfEmpty.linkedin_url = parsed.linkedin_url;
        if (!profile.github_url && parsed.github_url) fillIfEmpty.github_url = parsed.github_url;
        if (!profile.portfolio_url && parsed.portfolio_url) fillIfEmpty.portfolio_url = parsed.portfolio_url;
        if ((!profile.skills || profile.skills.length === 0) && parsed.skills.length)
          fillIfEmpty.skills = parsed.skills.slice(0, 200);
        if (profile.years_experience == null && parsed.years_experience != null)
          fillIfEmpty.years_experience = parsed.years_experience;
      }

      await supabaseAdmin
        .from("profiles")
        .update({
          ...fillIfEmpty,
          profile_resume_text: text.slice(0, 200000),
          resume_parsed_skills: parsed.skills,
          resume_parsed_technologies: parsed.technologies,
          resume_parsed_certifications: parsed.certifications,
          resume_parsed_experience: parsed.experience,
          resume_parsed_education: parsed.education,
          resume_parsed_years_experience: parsed.years_experience ?? null,
          resume_status: "ready",
          resume_error: null,
        })
        .eq("id", userId);

      await supabaseAdmin.from("action_logs").insert({
        user_id: userId, action: "resume.parsed", target_type: "profile", target_id: userId,
        metadata: { skills: parsed.skills.length, technologies: parsed.technologies.length },
      });

      return { ok: true, status: "ready" as const };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("profiles")
        .update({ resume_status: "failed", resume_error: message })
        .eq("id", userId);
      await supabaseAdmin.from("action_logs").insert({
        user_id: userId, action: "resume.parse_failed", target_type: "profile", target_id: userId,
        metadata: { error: message },
      });
      return { ok: false, status: "failed" as const, error: message };
    }
  });

export const deleteResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const { data: prev } = await supabaseAdmin
      .from("profiles")
      .select("resume_path, resume_filename, resume_size_bytes, resume_mime_type, resume_uploaded_at")
      .eq("id", userId)
      .maybeSingle();
    if (prev?.resume_path) {
      await supabaseAdmin.from("resume_archive").insert({
        user_id: userId,
        storage_path: prev.resume_path,
        filename: prev.resume_filename,
        size_bytes: prev.resume_size_bytes,
        mime_type: prev.resume_mime_type,
        uploaded_at: prev.resume_uploaded_at,
      });
      await supabaseAdmin.storage.from("resumes").remove([prev.resume_path]);
    }
    await supabaseAdmin
      .from("profiles")
      .update({
        resume_path: null, resume_filename: null, resume_size_bytes: null, resume_mime_type: null,
        resume_uploaded_at: null, resume_status: "none", resume_error: null,
        profile_resume_text: null,
        resume_parsed_skills: [], resume_parsed_technologies: [], resume_parsed_certifications: [],
        resume_parsed_experience: [], resume_parsed_education: [], resume_parsed_years_experience: null,
      })
      .eq("id", userId);
    await supabaseAdmin.from("action_logs").insert({
      user_id: userId, action: "resume.deleted", target_type: "profile", target_id: userId,
    });
    return { ok: true };
  });

export const getResumeDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("resume_path")
      .eq("id", context.userId)
      .maybeSingle();
    if (!prof?.resume_path) throw new Error("No resume uploaded.");
    const { data, error } = await supabaseAdmin.storage
      .from("resumes")
      .createSignedUrl(prof.resume_path, 60 * 5);
    if (error) throw new Error(error.message);
    return { url: data.signedUrl };
  });