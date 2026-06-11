# Contributing

Thanks for your interest in improving AI Job Hunter!

## Getting started

1. Fork and clone the repo.
2. `bun install`
3. `cp .env.example .env` and fill in keys (see README).
4. `bun run dev`

## Workflow

1. Create a branch: `git checkout -b feat/short-description`
2. Make focused commits — one logical change per commit.
3. Run checks locally:
   ```bash
   bun run lint
   bun run build
   ```
4. Open a pull request describing **what** changed and **why**. Link related issues.

## Code style

- TypeScript strict mode — no `any` unless justified.
- Use **semantic design tokens** from `src/styles.css`; never hard-code Tailwind colors.
- Server logic: `createServerFn` (app-internal) under `src/lib/api/*.functions.ts`. Public HTTP endpoints (webhooks, cron) under `src/routes/api/public/*`.
- Never import `client.server.ts` at module scope from a route or `*.functions.ts` file — load it inside the handler.
- Never commit secrets. Use `.env` locally and platform secret storage in production.

## Database changes

Add a new timestamped file under `supabase/migrations/`. Every new public-schema table needs:

1. `CREATE TABLE`
2. `GRANT` statements for `authenticated` / `service_role` (and `anon` only if intentionally public)
3. `ENABLE ROW LEVEL SECURITY`
4. `CREATE POLICY` per access pattern

## Reporting bugs

Open an issue with reproduction steps, expected vs actual behavior, and any console / scrape-log output. For AI-related bugs, mention whether you saw a credits/rate-limit error.

## Code of Conduct

Be kind. Assume good intent. No harassment.