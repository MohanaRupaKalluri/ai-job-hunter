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

// Words that suggest a page LISTS jobs (career hub / index).
const LISTING_HINTS = /(careers?|jobs?|openings?|opportunities|positions?|roles?|vacanc|search[-_]?jobs|join[-_]?us|work[-_]?with[-_]?us|hiring|talent)/i;
// Words/patterns that suggest a single job DETAIL page.
const DETAIL_HINTS = /(\/jobs?\/|\/careers?\/[^/]+\/|\/positions?\/|\/openings?\/|\/opportunit(?:y|ies)\/|\/roles?\/|\/posting\/|\/vacanc(?:y|ies)\/|gh_jid=|job[-_]?id=|requisition)/i;
const DETAIL_SLUG = /\/[a-z0-9][a-z0-9-_]{6,}/i; // long slug after path segment
const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|ico|css|js|pdf|zip|mp4|webm|woff2?)(\?|$)/i;

type Anchor = { url: string; text: string };

function parseAnchors(html: string, base: string): Anchor[] {
  const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const out: Anchor[] = [];
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const text = stripHtml(m[2]);
    if (!href) continue;
    if (href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;
    const url = abs(href, base);
    if (!/^https?:/i.test(url)) continue;
    if (ASSET_RE.test(url)) continue;
    out.push({ url, text });
  }
  return out;
}

function sameHost(a: string, b: string) {
  try { return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, ""); }
  catch { return false; }
}

function looksLikeListing(a: Anchor) {
  return LISTING_HINTS.test(a.url) || LISTING_HINTS.test(a.text);
}
function looksLikeDetail(a: Anchor) {
  if (LISTING_HINTS.test(a.text) && !DETAIL_HINTS.test(a.url)) return false;
  if (DETAIL_HINTS.test(a.url)) return true;
  // a long descriptive anchor under a /careers or /jobs path is probably a posting
  if (/\/(careers?|jobs?|openings?|positions?)\//i.test(a.url) && DETAIL_SLUG.test(a.url) && a.text.length >= 6 && a.text.length <= 160) return true;
  return false;
}

async function fetchHtml(url: string, timeoutMs = 15000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AIJobHunterBot/1.0)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export type GenericDiagnostics = {
  startUrl: string;
  pagesVisited: string[];
  listingPagesFound: string[];
  isCareerHomepage: boolean;
  jobLinksDiscovered: number;
};

/**
 * Generic crawl up to 2 levels deep from the supplied careers URL.
 * Level 0: the supplied URL
 * Level 1: listing-like links discovered on level 0 (same host)
 * Job-detail links found at any level are collected.
 */
async function crawlGeneric(
  careersUrl: string,
  opts: { maxPages?: number; maxDetails?: number } = {},
): Promise<{ jobs: DiscoveredJob[]; diagnostics: GenericDiagnostics }> {
  const maxPages = opts.maxPages ?? 8;
  const maxDetails = opts.maxDetails ?? 80;

  const diagnostics: GenericDiagnostics = {
    startUrl: careersUrl,
    pagesVisited: [],
    listingPagesFound: [],
    isCareerHomepage: false,
    jobLinksDiscovered: 0,
  };

  const visited = new Set<string>();
  const detail = new Map<string, string>(); // url -> title
  // BFS queue with depth.
  const queue: { url: string; depth: number }[] = [{ url: careersUrl, depth: 0 }];

  while (queue.length && visited.size < maxPages && detail.size < maxDetails) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    diagnostics.pagesVisited.push(url);
    let html = "";
    try { html = await fetchHtml(url); } catch { continue; }
    const anchors = parseAnchors(html, url).filter((a) => sameHost(a.url, careersUrl));

    let detailOnThisPage = 0;
    for (const a of anchors) {
      if (looksLikeDetail(a) && a.text && a.text.length >= 3 && a.text.length <= 160) {
        if (!detail.has(a.url)) detail.set(a.url, a.text);
        detailOnThisPage += 1;
        if (detail.size >= maxDetails) break;
      }
    }

    // Treat the start page as a "career homepage" if it produced almost no
    // detail links but exposes listing-style navigation.
    if (depth === 0 && detailOnThisPage < 3) {
      const listings = anchors.filter(looksLikeListing);
      diagnostics.isCareerHomepage = listings.length > 0;
      // Enqueue up to ~6 unique listing destinations, depth+1.
      const enq: string[] = [];
      for (const a of listings) {
        if (enq.length >= 6) break;
        if (visited.has(a.url) || queue.some((q) => q.url === a.url)) continue;
        // Don't re-enqueue the start URL itself or the homepage.
        try {
          const u = new URL(a.url);
          if (u.pathname === "/" || a.url === careersUrl) continue;
        } catch { continue; }
        enq.push(a.url);
        diagnostics.listingPagesFound.push(a.url);
        queue.push({ url: a.url, depth: depth + 1 });
      }
    }
  }

  diagnostics.jobLinksDiscovered = detail.size;

  const jobs: DiscoveredJob[] = Array.from(detail.entries()).map(([url, text]) => ({
    title: text,
    apply_url: url,
    location: null,
    employment_type: null,
    posted_date: null,
    description: null,
    external_id: null,
  }));
  return { jobs, diagnostics };
}

// ---------- Public entry point ----------

export type DiscoverResult = {
  jobs: DiscoveredJob[];
  source: "greenhouse" | "lever" | "workable" | "generic" | "firecrawl";
  diagnostics?: GenericDiagnostics;
};

export async function discoverJobs(careersUrl: string): Promise<DiscoverResult> {
  const provider = detectProvider(careersUrl);
  if (provider.kind === "greenhouse")
    return { jobs: await fetchGreenhouse(provider.slug), source: "greenhouse" };
  if (provider.kind === "lever")
    return { jobs: await fetchLever(provider.slug), source: "lever" };
  if (provider.kind === "workable")
    return { jobs: await fetchWorkable(provider.slug), source: "workable" };

  // Generic crawl up to 2 levels deep (free, no JS).
  try {
    const { jobs, diagnostics } = await crawlGeneric(careersUrl);
    if (jobs.length > 0) return { jobs, source: "generic", diagnostics };
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

/**
 * Read-only discovery report used by the "Discovery Test" button.
 * Returns the same generic crawl output PLUS diagnostics, without saving anything.
 */
export async function discoveryReport(careersUrl: string): Promise<{
  source: DiscoverResult["source"];
  jobs: DiscoveredJob[];
  diagnostics: GenericDiagnostics;
}> {
  const empty: GenericDiagnostics = {
    startUrl: careersUrl, pagesVisited: [], listingPagesFound: [],
    isCareerHomepage: false, jobLinksDiscovered: 0,
  };
  const provider = detectProvider(careersUrl);
  if (provider.kind !== "generic") {
    const r = await discoverJobs(careersUrl);
    return { source: r.source, jobs: r.jobs, diagnostics: { ...empty, jobLinksDiscovered: r.jobs.length } };
  }
  try {
    const { jobs, diagnostics } = await crawlGeneric(careersUrl);
    return { source: "generic", jobs, diagnostics };
  } catch (e) {
    return { source: "generic", jobs: [], diagnostics: empty };
  }
}