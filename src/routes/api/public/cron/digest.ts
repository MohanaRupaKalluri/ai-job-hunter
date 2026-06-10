import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || !apikey || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!process.env.RESEND_API_KEY || !process.env.LOVABLE_API_KEY) {
          return Response.json({
            ok: false,
            skipped: true,
            reason: "Resend is not connected. Connect Resend in Settings to enable the daily digest.",
          });
        }
        try {
          const { sendDailyDigests } = await import("@/lib/server/digest-pipeline.server");
          const report = await sendDailyDigests();
          return Response.json({ ok: true, ...report });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});