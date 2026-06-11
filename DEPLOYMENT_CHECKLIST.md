# Production Deployment Checklist

## Secrets & environment

- [ ] No secrets committed to git (`git log -p -- .env` is empty).
- [ ] `.env` is in `.gitignore`; only `.env.example` is tracked.
- [ ] All variables from `.env.example` are set as platform secrets (Worker secrets / Vercel env / etc.).
- [ ] `LOVABLE_API_KEY` has sufficient AI credit balance.
- [ ] `FIRECRAWL_API_KEY` quota matches expected scrape volume.
- [ ] `RESEND_API_KEY` set **and** sending domain verified (if digest enabled).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is server-only and never referenced from `src/` client code.

## Supabase

- [ ] All migrations applied to the production project (`supabase db push`).
- [ ] RLS enabled on every `public` table; `GRANT`s present for `authenticated` and `service_role`.
- [ ] Auth providers configured (email + Google).
- [ ] Email confirmation flow tested end-to-end.
- [ ] `user_roles` table populated for any admin users.

## Build & smoke test

- [ ] Fresh clone + `bun install` + `bun run build` succeeds with no warnings.
- [ ] `bun run preview` boots and `/auth` renders.
- [ ] Sign up → upload resume → import a company → run **Discovery Test** → run **Test Scrape** → open a job → generate resume + cover letter.
- [ ] All AI buttons either return a result or show the friendly credits/rate-limit message (never raw "Payment Required").

## Cron triggers

- [ ] `POST /api/public/cron/scrape` scheduled (recommended every 12 h). `apikey` header set to publishable key.
- [ ] `POST /api/public/cron/digest` scheduled daily (e.g. 07:00 user TZ).
- [ ] Both endpoints return `{ok: true}` on manual invocation.

## Observability

- [ ] Worker logs visible in your platform dashboard.
- [ ] Latest scrape run visible in **Jobs → Scrape Logs**.
- [ ] Audit Logs page lists recent user actions.

## Security

- [ ] Run `bun audit` (or `npm audit`) — no high/critical unaddressed.
- [ ] Supabase linter (`supabase db lint`) clean.
- [ ] No anonymous sign-ups; no auto-confirm in production unless intentional.
- [ ] All `/api/public/*` routes verify caller (signature or `apikey`).

## Domain & SEO

- [ ] Custom domain attached and SSL active.
- [ ] Root `head()` has unique title + meta description.
- [ ] Favicon and OG image set.
- [ ] `robots.txt` and `sitemap.xml` if marketing pages are public.

## Post-deploy

- [ ] Create one end-to-end production test account and run the full flow.
- [ ] Document rollback steps (previous release commit + migration revert plan).
- [ ] Snapshot the production database before the next migration.