import { generateText } from "ai";
import { z } from "zod";
import { createLovableAi } from "./ai-gateway.server";

export async function extractResumeText(bytes: Uint8Array, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf" || mimeType === "application/x-pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : text).trim();
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return (result.value ?? "").trim();
  }
  throw new Error(`Unsupported resume type: ${mimeType}. Please upload a PDF or DOCX file.`);
}

const parsedSchema = z.object({
  skills: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  years_experience: z.number().min(0).max(80).nullable().optional(),
  experience: z
    .array(
      z.object({
        title: z.string().default(""),
        company: z.string().default(""),
        period: z.string().default(""),
        bullets: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  education: z
    .array(z.object({ school: z.string().default(""), degree: z.string().default(""), period: z.string().default("") }))
    .default([]),
  full_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  github_url: z.string().nullable().optional(),
  portfolio_url: z.string().nullable().optional(),
});

export type ParsedResume = z.infer<typeof parsedSchema>;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI did not return JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function parseResumeText(resumeText: string): Promise<ParsedResume> {
  const model = createLovableAi();
  const { text } = await generateText({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an ATS resume parser. Extract structured data ONLY from the resume text. Do NOT invent or guess. If a field is missing leave it empty/null. Return ONLY JSON in this exact shape: {full_name?, email?, phone?, linkedin_url?, github_url?, portfolio_url?, skills:[], technologies:[], certifications:[], years_experience?, experience:[{title,company,period,bullets:[]}], education:[{school,degree,period}]}. 'skills' are role/soft skills, 'technologies' are concrete tools/languages/frameworks. years_experience is total professional years inferred from experience entries (number).",
      },
      { role: "user", content: `RESUME TEXT:\n${resumeText.slice(0, 20000)}` },
    ],
  });
  return parsedSchema.parse(extractJson(text));
}