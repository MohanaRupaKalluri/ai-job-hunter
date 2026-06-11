// Shared keyword catalog for .NET / full-stack / backend roles.
// Used by both the scraper (to decide which jobs to save and which keywords
// matched) and the Jobs UI (chips + filters).

export type KeywordDef = {
  /** Canonical label used for UI chips and stored in jobs.matched_keywords. */
  label: string;
  /** Lower-case aliases searched across title + description + requirements. */
  aliases: string[];
};

export const JOB_KEYWORDS: KeywordDef[] = [
  { label: ".NET", aliases: [".net", "dotnet", "dot net"] },
  { label: "C#", aliases: ["c#", "csharp", "c sharp"] },
  { label: "ASP.NET", aliases: ["asp.net", "asp net", "aspnet"] },
  { label: "ASP.NET Core", aliases: ["asp.net core", "aspnet core"] },
  { label: "MVC", aliases: ["mvc"] },
  { label: "Web API", aliases: ["web api", "webapi", "rest api", "restful api"] },
  { label: "SQL Server", aliases: ["sql server", "mssql", "t-sql", "tsql"] },
  { label: "Azure", aliases: ["azure", "microsoft azure"] },
  { label: "Angular", aliases: ["angular", "angularjs"] },
  { label: "React", aliases: ["react", "reactjs", "react.js"] },
  { label: "Java", aliases: ["java ", "java,", "java.", "java/", "java\n"] },
  { label: "Full Stack", aliases: ["full stack", "full-stack", "fullstack"] },
  { label: "Backend", aliases: ["backend", "back-end", "back end"] },
  { label: "Software Engineer", aliases: ["software engineer"] },
  { label: "Software Developer", aliases: ["software developer"] },
  { label: "Application Developer", aliases: ["application developer", "applications developer"] },
];

/** Default chips shown above the jobs list. */
export const DEFAULT_CHIP_KEYWORDS = [
  ".NET", "C#", "SQL Server", "Azure", "React", "Angular", "Java", "Full Stack", "Backend",
];

/**
 * Return the canonical labels that appear anywhere in title / description /
 * requirements / qualifications / department text. Case-insensitive.
 */
export function matchKeywords(parts: {
  title?: string | null;
  description?: string | null;
  requirements?: string | null;
  qualifications?: string | null;
  department?: string | null;
}): string[] {
  const hay = [
    parts.title, parts.description, parts.requirements,
    parts.qualifications, parts.department,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  if (!hay) return [];
  const matched = new Set<string>();
  for (const k of JOB_KEYWORDS) {
    if (k.aliases.some((a) => hay.includes(a))) matched.add(k.label);
  }
  return Array.from(matched);
}

export function hasAnyKeyword(parts: Parameters<typeof matchKeywords>[0]): boolean {
  return matchKeywords(parts).length > 0;
}