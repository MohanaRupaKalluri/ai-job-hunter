import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/scrape")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || !apikey || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { runScrapeAllUsers } = await import(
            "@/lib/server/scrape-pipeline.server"
          );
          const report = await runScrapeAllUsers();
          return Response.json({ ok: true, ...report });
        } catch (e) {
          return Response.json(
            { ok: false, error: (e as Error).message },
            { status: 500 },
          );
        }
      },
    },
  },
});