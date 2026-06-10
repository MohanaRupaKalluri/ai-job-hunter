import Firecrawl from "@mendable/firecrawl-js";

export function hasFirecrawl() {
  return !!process.env.FIRECRAWL_API_KEY;
}

export function getFirecrawl() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "FIRECRAWL_API_KEY is not configured. Connect the Firecrawl integration in Settings to enable scraping.",
    );
  }
  return new Firecrawl({ apiKey });
}

export async function scrapeCareerPage(url: string): Promise<{ markdown: string; links: string[] }> {
  const fc = getFirecrawl();
  const res: any = await fc.scrape(url, {
    formats: ["markdown", "links"],
    onlyMainContent: true,
    waitFor: 1500,
  });
  const markdown: string = res?.markdown ?? res?.data?.markdown ?? "";
  const links: string[] = res?.links ?? res?.data?.links ?? [];
  return { markdown: markdown.slice(0, 18000), links: links.slice(0, 200) };
}