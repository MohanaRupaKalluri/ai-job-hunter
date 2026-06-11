// Lightweight location parser shared by scraper + UI. Heuristic only — we
// extract city / state / country / remote-hybrid-onsite from the free-form
// "location" string most ATS providers expose.

export type ParsedLocation = {
  city: string | null;
  state: string | null;
  country: string | null;
  work_mode: "remote" | "hybrid" | "onsite" | "unknown";
  raw: string | null;
};

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};
const STATE_NAMES = new Set(Object.values(US_STATES).map((s) => s.toLowerCase()));
const STATE_ABBR = new Set(Object.keys(US_STATES));

const NON_US_HINTS: Array<{ re: RegExp; country: string }> = [
  { re: /\b(india|bengaluru|bangalore|hyderabad|chennai|mumbai|pune|noida|gurgaon|gurugram|delhi|kolkata)\b/i, country: "India" },
  { re: /\b(uk|united kingdom|england|london|manchester|edinburgh|scotland|wales|ireland|dublin)\b/i, country: "United Kingdom" },
  { re: /\b(canada|toronto|vancouver|montreal|ottawa|calgary)\b/i, country: "Canada" },
  { re: /\b(germany|berlin|munich|frankfurt|hamburg)\b/i, country: "Germany" },
  { re: /\b(france|paris|lyon)\b/i, country: "France" },
  { re: /\b(spain|madrid|barcelona)\b/i, country: "Spain" },
  { re: /\b(australia|sydney|melbourne|brisbane)\b/i, country: "Australia" },
  { re: /\b(brazil|brasil|sao paulo|são paulo|rio de janeiro)\b/i, country: "Brazil" },
  { re: /\b(mexico|méxico|mexico city|guadalajara)\b/i, country: "Mexico" },
  { re: /\b(philippines|manila|cebu)\b/i, country: "Philippines" },
  { re: /\b(singapore)\b/i, country: "Singapore" },
  { re: /\b(japan|tokyo|osaka)\b/i, country: "Japan" },
  { re: /\b(china|shanghai|beijing|shenzhen)\b/i, country: "China" },
  { re: /\b(poland|warsaw|kraków|krakow)\b/i, country: "Poland" },
  { re: /\b(netherlands|nederlands|nederland|amsterdam|rotterdam|the hague|den haag|utrecht|eindhoven)\b/i, country: "Netherlands" },
  { re: /\b(israel|tel aviv)\b/i, country: "Israel" },
  { re: /\b(emea|apac|latam)\b/i, country: "International" },
];

function detectMode(s: string): ParsedLocation["work_mode"] {
  const t = s.toLowerCase();
  if (/\bremote\b|\bwfh\b|work from home|virtual\b/.test(t)) return "remote";
  if (/\bhybrid\b/.test(t)) return "hybrid";
  if (/\bon[- ]?site\b|\bin[- ]?office\b/.test(t)) return "onsite";
  return "unknown";
}

export function parseLocation(input?: string | null): ParsedLocation {
  const raw = (input ?? "").trim();
  if (!raw) return { city: null, state: null, country: null, work_mode: "unknown", raw: null };
  const work_mode = detectMode(raw);

  // Strip parentheticals like "(Remote)" before parsing geography.
  const cleaned = raw.replace(/\(([^)]+)\)/g, " ").replace(/\s+/g, " ").trim();

  // Non-US hint wins outright.
  for (const h of NON_US_HINTS) {
    if (h.re.test(cleaned)) {
      return { city: null, state: null, country: h.country, work_mode, raw };
    }
  }

  // Split on ; / , or /
  const parts = cleaned.split(/[,/;|]/).map((p) => p.trim()).filter(Boolean);
  let city: string | null = null;
  let state: string | null = null;
  let country: string | null = null;

  for (const p of parts) {
    const upper = p.toUpperCase();
    if (STATE_ABBR.has(upper)) { state = US_STATES[upper]; country = country ?? "United States"; continue; }
    if (STATE_NAMES.has(p.toLowerCase())) { state = p; country = country ?? "United States"; continue; }
    if (/\b(usa|u\.s\.a\.|u\.s\.|united states|america)\b/i.test(p)) { country = "United States"; continue; }
    if (!city && p && !/^remote$|^hybrid$|^onsite$|^on[- ]?site$/i.test(p)) city = p;
  }

  // Pure "Remote" with no geo info → unknown country.
  if (!city && !state && !country && work_mode === "remote") {
    return { city: null, state: null, country: null, work_mode, raw };
  }

  return { city, state, country, work_mode, raw };
}

export function isUSLocation(loc: { country?: string | null }): boolean {
  return (loc.country ?? "").toLowerCase() === "united states";
}

export function isIndiaLocation(loc: { country?: string | null }): boolean {
  return (loc.country ?? "").toLowerCase() === "india";
}

/**
 * Render a job's structured location for display in cards/lists.
 * Example outputs:
 *   "Remote • United States"
 *   "Hybrid • Columbus, Ohio, United States"
 *   "Onsite • Dallas, Texas, United States"
 *   "Location unavailable"
 */
export function formatJobLocation(j: {
  work_mode?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  location?: string | null;
  raw_location?: string | null;
}): string {
  const modeRaw = (j.work_mode ?? "").toLowerCase();
  const mode =
    modeRaw === "remote" ? "Remote" :
    modeRaw === "hybrid" ? "Hybrid" :
    modeRaw === "onsite" ? "Onsite" : null;
  const geo = [j.city, j.state, j.country].filter(Boolean).join(", ");
  if (mode && geo) return `${mode} • ${geo}`;
  if (mode) return `${mode} • ${j.country ?? "Location unavailable"}`;
  if (geo) return geo;
  const raw = (j.location ?? j.raw_location ?? "").trim();
  if (raw) return raw;
  return "Location unavailable";
}