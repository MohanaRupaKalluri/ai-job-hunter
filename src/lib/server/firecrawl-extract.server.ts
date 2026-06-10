import { generateText } from "ai";
import { z } from "zod";
import { scrapeCareerPage } from "./firecrawl.server";
import { createLovableAi } from "./ai-gateway.server";
import type { DiscoveredJob } from "./job-providers.server";

const jobsSchema = z.object({
  jobs: z
    .array(
      z.object({
        title: z.string(),
        location: z.string().nullable().optional(),
        employment_type: z.string().nullable().optional(),
        posted_date: z.string().nullable().optional(),
        apply_url: z.string(),
        description: z.string().nullable().optional(),
      }),
    )
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

function abs(href: string, base: string) {
  try { return new URL(href, base).toString(); } catch { return href; }
}

export async function extractJobsFromPage(careersUrl: string): Promise<DiscoveredJob[]> {
  const { markdown, links } = await scrapeCareerPage(careersUrl);
  const model = createLovableAi();
  const { text } = await generateText({
    model,
    messages: [
      { role: "system", content: "Extract job listings as strict JSON {\"jobs\":[{title,location?,employment_type?,posted_date?,apply_url,description?}]}. apply_url must be from the provided links." },
      { role: "user", content: `Source: ${careersUrl}\n\nMARKDOWN:\n${markdown}\n\nLINKS:\n${links.slice(0, 60).join("\n")}` },
    ],
  });
  const parsed = jobsSchema.parse(extractJson(text));
  return parsed.jobs.map((j) => ({
    title: j.title,
    location: j.location ?? null,
    employment_type: j.employment_type ?? null,
    posted_date: j.posted_date && /^\d{4}-\d{2}-\d{2}$/.test(j.posted_date) ? j.posted_date : null,
    apply_url: abs(j.apply_url, careersUrl),
    description: j.description ?? null,
    external_id: null,
  }));
}