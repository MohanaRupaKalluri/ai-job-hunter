# AI Job Hunter

Automated, AI-powered job search assistant. Discover roles from company career sites, score them against your resume, generate tailored resumes and cover letters, and track every application — all from one dashboard.

Built on **TanStack Start** (React 19 + Vite 7), **Lovable Cloud** (Supabase), and the **Lovable AI Gateway**.

---

## Features

- **Resume intake** — upload PDF/DOCX, AI-parsed into structured skills, experience, education.
- **Company tracking** — import companies, auto-detect career pages, enable/disable per-company tracking.
- **Job discovery** — crawls career sites (Greenhouse, Lever, Workday, Ashby, SmartRecruiters, generic) up to 2 levels deep, with full discovery diagnostics.
- **Job extraction** — visits each detail page and pulls title, location, department, description, requirements, apply URL.
- **AI match scoring** — relevance scoring against your profile, with matched/missing skills and rationale. Caps internships and unrelated roles.
- **Tailored documents** — one-click ATS-friendly resume + cover letter per job, cached to avoid re-spending credits.
- **Application tracker** — Kanban-style status board, audit logs, analytics.
- **Daily digest email** — top new matches delivered via Resend.
- **Diagnostics built-in** — discovery test, test scrape (5 jobs), scrape logs with per-company skip reasons, credit-aware AI error messages.

## Architecture

```
 Browser (React 19 + TanStack Router)
    │
    ├── TanStack Server Functions  ── createServerFn (app-internal RPC)
    │      └── Lovable AI Gateway (Gemini) — match / resume / cover letter
    │      └── Firecrawl — discovery + extraction
    │      └── Supabase (RLS, user-scoped)
    │
    └── Public API routes (/api/public/*) — cron: scrape, digest
           └── Supabase service role (server-only)
```

- **Frontend:** React 19, TanStack Router/Query, Tailwind v4, shadcn/ui.
- **Backend:** TanStack Start server functions on Cloudflare Workers (nodejs_compat).
- **Database/Auth:** Supabase (Postgres + RLS + Auth). Roles in a separate `user_roles` table, checked via `has_role()` security-definer function.
- **AI:** Lovable AI Gateway (`google/gemini-3-flash-preview`). Centralized 402/429 handling with friendly credit-exhausted messages.
- **Scraping:** Firecrawl for crawl + extract; provider-aware adapters under `src/lib/server/job-providers.server.ts`.
- **Email:** Resend via the daily-digest cron route.

## Setup

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- A Supabase project (or use Lovable Cloud, which provisions one)
- API keys: `LOVABLE_API_KEY`, `FIRECRAWL_API_KEY`, optionally `RESEND_API_KEY`

### Install

```bash
git clone https://github.com/YOUR_ORG/ai-job-hunter.git
cd ai-job-hunter
bun install
cp .env.example .env
# fill in the values in .env
```

### Database

Apply migrations to your Supabase project:

```bash
# using the Supabase CLI
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### Run

```bash
bun run dev      # http://localhost:8080
bun run build    # production build
bun run preview  # preview the build
```

## Deployment

### Lovable (one click)

Open the project in Lovable and click **Publish**. Cloud provisions Supabase, secrets, and the Cloudflare Worker automatically.

### Self-host on Cloudflare Workers

1. `bun run build` — produces a Worker bundle under `.output/`.
2. Deploy with `wrangler deploy` (or your CI).
3. Set every variable from `.env.example` as a Worker secret.
4. Point a cron trigger at `POST /api/public/cron/scrape` and `POST /api/public/cron/digest` (every 12 h recommended). Both require the `apikey` header equal to `SUPABASE_PUBLISHABLE_KEY`.

### Other platforms

The app is a standard TanStack Start project and runs on any host that supports Node 20+ or Cloudflare Workers (Vercel, Netlify edge, Fly.io, etc.). See [TanStack Start deployment docs](https://tanstack.com/start).

## Screenshots

> Drop PNGs in `docs/screenshots/` and reference them here.

| | |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Jobs](docs/screenshots/jobs.png) |
| ![Job detail + match](docs/screenshots/job-detail.png) | ![Companies](docs/screenshots/companies.png) |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)