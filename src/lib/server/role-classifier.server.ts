// Role classification + filter keyword lists used by both the scraper
// and the jobs listing UI. Keep these in one place so server-side
// filtering and client toggles stay in sync.

export const ACCEPT_TITLES = [
  "software engineer",
  "software developer",
  "full stack developer",
  "full-stack developer",
  "fullstack developer",
  ".net developer",
  "c# developer",
  "backend developer",
  "back-end developer",
  "web developer",
  "application developer",
  "azure developer",
  "java developer",
  "api developer",
];

export const REJECT_TITLES = [
  "internship",
  "intern",
  "summer program",
  "graduate program",
  "new grad",
  "trader",
  "sales",
  "recruiter",
  "recruiting",
  "marketing",
  "finance",
  "nursing",
  "nurse",
  "medical assistant",
  "coordinator",
];

// Software-y signals used when an explicit ACCEPT_TITLE is not present.
export const SOFTWARE_HINTS = [
  "software", "developer", "engineer", "backend", "back-end", "back end",
  "full stack", "full-stack", "fullstack", ".net", "c#", "asp.net",
  "java", "azure", "sql server", "api", "web ",
];

export type RoleClass = "software" | "rejected" | "other";

export function classifyRole(title?: string | null, description?: string | null): RoleClass {
  const t = (title ?? "").toLowerCase();
  const d = (description ?? "").toLowerCase();
  // Hard reject — title-based, to avoid catching "no sales experience required" etc. in descriptions.
  if (REJECT_TITLES.some((k) => t.includes(k))) return "rejected";
  if (ACCEPT_TITLES.some((k) => t.includes(k))) return "software";
  // Title is ambiguous: look for software signals in title OR description.
  const hay = `${t}\n${d}`;
  if (SOFTWARE_HINTS.some((k) => hay.includes(k))) return "software";
  return "other";
}

// Cap rules applied AFTER the AI returns its scores so that adversarial
// or naive outputs cannot push irrelevant jobs to 99-100.
export function applyScoreCaps(
  overall: number,
  opts: { roleClass: RoleClass; matchedSkillsCount: number; missingSkillsCount: number },
): { overall: number; caps: string[] } {
  const caps: string[] = [];
  let final = overall;
  if (opts.roleClass !== "software") {
    final = Math.min(final, 30);
    caps.push("non-software role capped at 30");
  }
  // "Key technical requirements missing": no matched skills OR more missing than matched.
  if (
    opts.roleClass === "software" &&
    (opts.matchedSkillsCount === 0 || opts.missingSkillsCount > opts.matchedSkillsCount * 2)
  ) {
    final = Math.min(final, 50);
    caps.push("key technical requirements missing — capped at 50");
  }
  return { overall: Math.round(final * 100) / 100, caps };
}