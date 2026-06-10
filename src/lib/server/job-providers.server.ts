/**
 * Hybrid job-discovery providers. No paid service required.
 *
 * Resolution order for a given careers URL:
 *  1. Greenhouse public Job Board API
 *  2. Lever public Postings API
 *  3. Workable public job feed
 *  4. Generic fetch + HTML extraction (anchor links that look like jobs)
 *  5. Firecrawl (optional, only if FIRECRAWL_API_KEY is set) for JS-heavy pages
 */

export type DiscoveredJob = {
  title: string;
  location?: string | null;
  employment_type?: string | null;
  posted_date?: string | null;
  apply_url: string;
  description?: string | null;
  external_id?: string | null;
};

function abs(href: string, base: string) {
  try { return new URL(href, base).toString(); } catch { return href; }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(s?: string | null) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// ---------- Provider detection ----------

type Provider =
  | { kind: "greenhouse"; slug: string }
  | { kind: "lever"; slug: string }
  | { kind: "workable"; slug: string }
  | { kind: "generic" };

export function detectProvider(careersUrl: string): Provider {
  let u: URL;
  try { u = new URL(careersUrl); } catch { return { kind: "generic" }; }
  const host = u.hostname.toLowerCase();

  // Greenhouse: boards.greenhouse.io/{slug}  or  jobs.greenhouse.io/{slug}
  if (host.endsWith("greenhouse.io")) {
    const slug = u.pathname.split("/").filter(Boolean)[0];
    if (slug) return { kind: "greenhouse", slug };
  }
  // Greenhouse embedded: boards.eu.greenhouse.io etc.
  if (host.includes("greenhouse.io")) {
    const slug = u.pathname.split("/").filter(Boolean)[0];
    if (slug) return { kind: "greenhouse", slug };
  }

  // Lever: jobs.lever.co/{slug}
  if (host.endsWith("lever.co")) {
    const slug = u.pathname.split("/").filter(Boolean)[0];
    if (slug) return { kind: "lever", slug };
  }

  // Workable: apply.workable.com/{slug}  or  {slug}.workable.com
  if (host === "apply.workable.com" || host === "jobs.workable.com") {
    const slug = u.pathname.split("/").filter(Boolean)[0];
    if (slug) return { kind: "workable", slug };
  }
  if (host.endsWith(".workable.com")) {
    const slug = host.split(".")[0];
    if (slug && slug !== "www") return { kind: "workable", slug };
  }

  return { kind: "generic" };
}

// ---------- Greenhouse ----------

async function fetchGreenhouse(slug: string): Promise<DiscoveredJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Greenhouse ${res.status}`);
  const data: any = await res.json();
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map((j: any) => ({
    title: String(j.title ?? "").trim(),
    location: j.location?.name ?? null,
    employment_type: j.metadata?.find?.((m: any) => /type|employment/i.test(m?.name))?.value ?? null,
    posted_date: isoDate(j.updated_at ?? j.first_published),
    apply_url: String(j.absolute_url ?? ""),
    description: j.content ? stripHtml(String(j.content)).slice(0, 8000) : null,
    external_id: j.id != null ? `gh_${j.id}` : null,
  })).filter((j: DiscoveredJob) => j.title && j.apply_url);
}

// ---------- Lever ----------

async function fetchLever(slug: string): Promise<DiscoveredJob[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Lever ${res.status}`);
  const data: any = await res.json();
  const jobs = Array.isArray(data) ? data : [];
  return jobs.map((j: any) => ({
    title: String(j.text ?? "").trim(),
    location: j.categories?.location ?? null,
    employment_type: j.categories?.commitment ?? null,
    posted_date: isoDate(j.createdAt ? new Date(j.createdAt).toISOString() : null),
    apply_url: String(j.hostedUrl ?? j.applyUrl ?? ""),
    description: [j.descriptionPlain, ...(j.lists?.map((l: any) => `${l.text}: ${stripHtml(l.content ?? "")}`) ?? [])]
      .filter(Boolean).join("\n\n").slice(0, 8000) || null,
    external_id: j.id ? `lv_${j.id}` : null,
  })).filter((j: DiscoveredJob) => j.title && j.apply_url);
}

// ---------- Workable ----------

async function fetchWorkable(slug: string): Promise<DiscoveredJob[]> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Workable ${res.status}`);
  const data: any = await res.json();
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map((j: any) => ({
    title: String(j.title ?? "").trim(),
    location: j.location?.city ? [j.location.city, j.location.country].filter(Boolean).join(", ") : (j.location?.country ?? null),
    employment_type: j.type ?? null,
    posted_date: isoDate(j.published_on ?? j.created_at),
    apply_url: j.url ?? (j.shortcode ? `https://apply.workable.com/${slug}/j/${j.shortcode}/` : ""),
    description: j.description ? stripHtml(String(j.description)).slice(0, 8000) : null,
    external_id: j.shortcode ? `wk_${j.shortcode}` : null,
  })).filter((j: DiscoveredJob) => j.title && j.apply_url);
}

// ---------- Generic fallback (fetch + HTML link harvest) ----------

const JOB_LINK_HINTS = /(jobs?|career|positions?|roles?|opening|apply|posting|vacanc)/i;

async function fetchGeneric(careersUrl: string): Promise<DiscoveredJob[]> {
  const res = await fetch(careersUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; AIJobHunterBot/1.0)",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const text = stripHtml(m[2]);
    if (!href || !text || text.length < 3 || text.length > 160) continue;
    if (!JOB_LINK_HINTS.test(href) && !JOB_LINK_HINTS.test(text)) continue;
    const url = abs(href, careersUrl);
    if (!/^https?:/i.test(url)) continue;
    if (!seen.has(url)) seen.set(url, text);
  }
  return Array.from(seen.entries()).slice(0, 80).map(([url, text]) => ({
    title: text,
    apply_url: url,
    location: null,
    employment_type: null,
    posted_date: null,
    description: null,
    external_id: null,
  }));
}

// ---------- Public entry point ----------

export type DiscoverResult = {
  jobs: DiscoveredJob[];
  source: "greenhouse" | "lever" | "workable" | "generic" | "firecrawl";
};

export async function discoverJobs(careersUrl: string): Promise<DiscoverResult> {
  const provider = detectProvider(careersUrl);
  if (provider.kind === "greenhouse")
    return { jobs: await fetchGreenhouse(provider.slug), source: "greenhouse" };
  if (provider.kind === "lever")
    return { jobs: await fetchLever(provider.slug), source: "lever" };
  if (provider.kind === "workable")
    return { jobs: await fetchWorkable(provider.slug), source: "workable" };

  // Generic: try fetch first (free, no JS).
  try {
    const jobs = await fetchGeneric(careersUrl);
    if (jobs.length > 0) return { jobs, source: "generic" };
  } catch {
    // fall through to Firecrawl if available
  }

  // Optional Firecrawl fallback for JS-heavy pages.
  if (process.env.FIRECRAWL_API_KEY) {
    const { extractJobsFromPage } = await import("./firecrawl-extract.server");
    const jobs = await extractJobsFromPage(careersUrl);
    return { jobs, source: "firecrawl" };
  }
  return { jobs: [], source: "generic" };
}