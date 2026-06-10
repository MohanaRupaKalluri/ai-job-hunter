import { generateText } from "ai";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAi } from "./ai-gateway.server";
import { withAiErrors } from "./ai-errors.server";
import {
  type ResumeDoc,
  resumeToDocx,
  textToPdf,
  resumeToPdf,
} from "./document-generators.server";

const resumeSchema = z.object({
  name: z.string(),
  contact: z.object({
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    links: z.array(z.string()).default([]),
  }),
  summary: z.string(),
  skills: z.array(z.string()).default([]),
  experience: z
    .array(
      z.object({
        title: z.string(),
        company: z.string(),
        period: z.string(),
        bullets: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  education: z
    .array(z.object({ school: z.string(), degree: z.string(), period: z.string() }))
    .default([]),
});

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in AI response");
  return JSON.parse(raw.slice(start, end + 1));
}

async function loadJobWithProfile(userId: string, jobId: string) {
  const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle();
  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) throw new Error("Complete your profile first.");
  if (!job) throw new Error("Job not found.");
  return { profile, job };
}

async function findCachedDocument(userId: string, jobId: string, kind: "resume" | "cover_letter") {
  // Prefer the most recent PDF when both formats exist.
  const { data } = await supabaseAdmin
    .from("generated_documents")
    .select("id, format, created_at, kind")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(5);
  if (!data?.length) return null;
  const pdf = data.find((d) => d.format === "pdf");
  const chosen = pdf ?? data[0];
  const siblings = data.filter((d) => d.format !== chosen.format);
  return { primary: chosen, sibling: siblings[0] ?? null };
}

export async function runResumeGeneration(userId: string, jobId: string, opts?: { force?: boolean }) {
  if (!opts?.force) {
    const cached = await findCachedDocument(userId, jobId, "resume");
    if (cached) {
      return {
        docx_id: cached.primary.format === "docx" ? cached.primary.id : cached.sibling?.id ?? null,
        pdf_id: cached.primary.format === "pdf" ? cached.primary.id : cached.sibling?.id ?? null,
        cached: true as const,
      };
    }
  }
  const { profile, job } = await loadJobWithProfile(userId, jobId);
  const model = createLovableAi();
  const { text } = await withAiErrors("Resume generation", () => generateText({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an ATS resume writer. Build a clean, ATS-friendly resume tailored to the job. RULES: only use facts present in the candidate profile, do not invent any experience, employer, dates, or credential. If a section has no data, leave it empty. Optimize keywords drawn from the job description. Return ONLY JSON in this shape: {name, contact:{email?,phone?,location?,links:[]}, summary, skills:[], experience:[{title,company,period,bullets:[]}], education:[{school,degree,period}]}.",
      },
      {
        role: "user",
        content: `CANDIDATE PROFILE (factual source — do not embellish):\n${JSON.stringify(profile, null, 2)}\n\nJOB:\nTitle: ${job.title}\nCompany: ${job.company_name}\nLocation: ${job.location ?? ""}\nDescription:\n${(job.description ?? "").slice(0, 6000)}`,
      },
    ],
  }));
  const resume = resumeSchema.parse(extractJson(text)) as ResumeDoc;

  const docxBytes = await resumeToDocx(resume);
  const pdfBytes = await resumeToPdf(resume);
  const ts = Date.now();
  const base = `${userId}/resume-${jobId}-${ts}`;
  const docxPath = `${base}.docx`;
  const pdfPath = `${base}.pdf`;

  const up1 = await supabaseAdmin.storage.from("generated-docs").upload(docxPath, docxBytes, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: true,
  });
  if (up1.error) throw new Error(up1.error.message);
  const up2 = await supabaseAdmin.storage.from("generated-docs").upload(pdfPath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up2.error) throw new Error(up2.error.message);

  const { data: docxRow } = await supabaseAdmin
    .from("generated_documents")
    .insert({
      user_id: userId,
      job_id: jobId,
      kind: "resume",
      format: "docx",
      storage_path: docxPath,
      content_preview: resume.summary.slice(0, 400),
    })
    .select()
    .single();
  const { data: pdfRow } = await supabaseAdmin
    .from("generated_documents")
    .insert({
      user_id: userId,
      job_id: jobId,
      kind: "resume",
      format: "pdf",
      storage_path: pdfPath,
      content_preview: resume.summary.slice(0, 400),
    })
    .select()
    .single();

  await supabaseAdmin.from("applications").upsert(
    {
      user_id: userId,
      job_id: jobId,
      status: "resume_generated",
      resume_document_id: pdfRow?.id ?? docxRow?.id,
    },
    { onConflict: "user_id,job_id" },
  );

  await supabaseAdmin.from("action_logs").insert({
    user_id: userId,
    action: "resume.generated",
    target_type: "job",
    target_id: jobId,
    metadata: { docx_id: docxRow?.id, pdf_id: pdfRow?.id },
  });

  return { docx_id: docxRow?.id, pdf_id: pdfRow?.id, cached: false as const };
}

export async function runCoverLetterGeneration(userId: string, jobId: string, opts?: { force?: boolean }) {
  if (!opts?.force) {
    const cached = await findCachedDocument(userId, jobId, "cover_letter");
    if (cached) {
      return { document_id: cached.primary.id, cached: true as const };
    }
  }
  const { profile, job } = await loadJobWithProfile(userId, jobId);
  // Pull the latest match (if any) so the letter can highlight matched skills.
  const { data: matchRow } = await supabaseAdmin
    .from("job_matches")
    .select("matched_skills, rationale")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .maybeSingle();
  const model = createLovableAi();
  const { text } = await withAiErrors("Cover letter generation", () => generateText({
    model,
    messages: [
      {
        role: "system",
        content:
          "You write concise, professional cover letters (max 350 words). REQUIRED: address the letter to the named company; reference the job title in paragraph 1; in paragraph 2 connect the candidate's relevant experience to 2-3 of the job's stated requirements; in paragraph 3 highlight matched skills (use the provided MATCHED_SKILLS list verbatim); close with a one-line call to action. RULES: use ONLY facts from the candidate profile and resume — do not invent employers, dates, degrees, certifications, or experience the candidate does not have. Plain prose, 3-4 short paragraphs. Return ONLY the letter body text — no JSON, no headers, no 'Dear Hiring Manager' if the company has a real name to use instead.",
      },
      {
        role: "user",
        content: `PROFILE:\n${JSON.stringify(profile, null, 2)}\n\nMATCHED_SKILLS: ${(matchRow?.matched_skills ?? []).join(", ") || "(none yet)"}\nMATCH_RATIONALE: ${matchRow?.rationale ?? "(none)"}\n\nJOB:\nCompany: ${job.company_name}\nTitle: ${job.title}\nLocation: ${job.location ?? ""}\nDescription:\n${(job.description ?? "").slice(0, 5000)}`,
      },
    ],
  }));
  const letter = text.trim();
  const pdfBytes = await textToPdf(`Cover Letter — ${job.title} at ${job.company_name}`, letter);
  const ts = Date.now();
  const pdfPath = `${userId}/cover-${jobId}-${ts}.pdf`;
  const up = await supabaseAdmin.storage.from("generated-docs").upload(pdfPath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) throw new Error(up.error.message);
  const { data: row } = await supabaseAdmin
    .from("generated_documents")
    .insert({
      user_id: userId,
      job_id: jobId,
      kind: "cover_letter",
      format: "pdf",
      storage_path: pdfPath,
      content_preview: letter.slice(0, 400),
    })
    .select()
    .single();

  await supabaseAdmin.from("applications").upsert(
    {
      user_id: userId,
      job_id: jobId,
      status: "cover_letter_generated",
      cover_letter_document_id: row?.id ?? null,
    },
    { onConflict: "user_id,job_id" },
  );

  await supabaseAdmin.from("action_logs").insert({
    user_id: userId,
    action: "cover_letter.generated",
    target_type: "job",
    target_id: jobId,
    metadata: { document_id: row?.id },
  });

  return { document_id: row?.id, cached: false as const };
}