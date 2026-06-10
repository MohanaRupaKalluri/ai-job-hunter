/**
 * Visit a job detail page and extract the structured posting:
 * title, location, department, full description, qualifications, requirements,
 * and a normalized apply URL. Pure fetch + HTML parsing — no paid services.
 */

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  return html.match(re)?.[1]?.trim() ?? null;
}

function pickJsonLdJobPosting(html: string): any | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const raw = m[1].trim();
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item) continue;
        const t = item["@type"];
        if (t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"))) return item;
        if (Array.isArray(item["@graph"])) {
          for (const node of item["@graph"]) {
            const nt = node?.["@type"];
            if (nt === "JobPosting" || (Array.isArray(nt) && nt.includes("JobPosting"))) return node;
          }
        }
      }
    } catch { /* ignore malformed json-ld */ }
  }
  return null;
}

/**
 * Carve out a section from cleaned text whose heading matches `headingRe`.
 * Stops at the next ALL CAPS / title-case heading or end of text.
 */
function extractSection(text: string, headingRe: RegExp): string | null {
  const lines = text.split(/\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i].trim())) { start = i + 1; break; }
  }
  if (start === -1) return null;
  const out: string[] = [];
  const headingLike = /^(?:[A-Z][A-Za-z0-9 /&+'-]{2,60}|[A-Z][A-Z0-9 /&+'-]{2,60}):?$/;
  const knownNext = /^(responsibilities|requirements|qualifications|what you'?ll do|what we'?re looking for|about (us|the role|the team|the company)|benefits|perks|compensation|salary|why join|equal opportunity|how to apply|nice to have|preferred|skills|education|experience)/i;
  for (let i = start; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) { out.push(""); continue; }
    if (i !== start && (knownNext.test(t) || (headingLike.test(t) && t.length < 60 && !t.endsWith(".")))) break;
    out.push(lines[i]);
  }
  const body = out.join("\n").trim();
  return body || null;
}

export type ExtractedJob = {
  title: string | null;
  location: string | null;
  department: string | null;
  description: string | null;
  qualifications: string | null;
  requirements: string | null;
  apply_url: string;
  diagnostics: {
    success: boolean;
    source_url: string;
    final_url: string;
    http_status: number | null;
    description_length: number;
    requirements_found: boolean;
    qualifications_found: boolean;
    used_json_ld: boolean;
    error?: string;
  };
};

async function fetchHtml(url: string, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AIJobHunterBot/1.0)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, html: text };
  } finally {
    clearTimeout(t);
  }
}

export async function extractJob(detailUrl: string, fallbackTitle?: string): Promise<ExtractedJob> {
  const diag: ExtractedJob["diagnostics"] = {
    success: false,
    source_url: detailUrl,
    final_url: detailUrl,
    http_status: null,
    description_length: 0,
    requirements_found: false,
    qualifications_found: false,
    used_json_ld: false,
  };
  let title: string | null = fallbackTitle ?? null;
  let location: string | null = null;
  let department: string | null = null;
  let description: string | null = null;
  let qualifications: string | null = null;
  let requirements: string | null = null;

  try {
    const r = await fetchHtml(detailUrl);
    diag.http_status = r.status;
    diag.final_url = r.finalUrl;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = r.html;

    // 1. JSON-LD JobPosting (preferred; structured + accurate)
    const ld = pickJsonLdJobPosting(html);
    if (ld) {
      diag.used_json_ld = true;
      title = title || (ld.title ?? null);
      department = department || (ld.industry ?? ld.occupationalCategory ?? null);
      const loc = ld.jobLocation;
      if (loc) {
        const arr = Array.isArray(loc) ? loc : [loc];
        location = arr
          .map((l: any) => {
            const a = l?.address ?? l;
            return [a?.addressLocality, a?.addressRegion, a?.addressCountry].filter(Boolean).join(", ");
          })
          .filter(Boolean)
          .join(" / ") || null;
      }
      if (typeof ld.description === "string") description = stripHtml(ld.description);
    }

    // 2. Open Graph / title fallbacks
    if (!title) title = metaContent(html, "og:title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;

    // 3. HTML body extraction for description if JSON-LD missing.
    if (!description) {
      // Look for a content container
      const main =
        html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
        html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
        html.match(/<div[^>]+class=["'][^"']*(job-description|jobDescription|posting-content|content-intro|description)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[2] ??
        html;
      description = stripHtml(main).slice(0, 12000);
    }

    if (description) {
      qualifications = extractSection(description, /^(qualifications|what we'?re looking for|skills|education|preferred qualifications|minimum qualifications)/i);
      requirements = extractSection(description, /^(requirements|responsibilities|what you'?ll do|the role|key responsibilities|essential duties)/i);
    }

    diag.description_length = (description ?? "").length;
    diag.qualifications_found = !!qualifications && qualifications.length > 20;
    diag.requirements_found = !!requirements && requirements.length > 20;
    diag.success = diag.description_length >= 200; // heuristic: usable post has at least 200 chars
  } catch (e) {
    diag.error = (e as Error).message;
    diag.success = false;
  }

  return {
    title,
    location,
    department,
    description,
    qualifications,
    requirements,
    apply_url: detailUrl,
    diagnostics: diag,
  };
}