import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY = "https://connector-gateway.lovable.dev/resend";

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch(`${GATEWAY}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": process.env.RESEND_API_KEY!,
    },
    body: JSON.stringify({
      from: "AI Job Hunter <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function sendDailyDigests() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: profiles } = await (supabaseAdmin
    .from("profiles") as any)
    .select("id, email, full_name, daily_digest_enabled")
    .eq("daily_digest_enabled", true);

  let sent = 0;
  const errors: string[] = [];
  for (const p of profiles ?? []) {
    if (!p.email) continue;
    const { data: matches } = await supabaseAdmin
      .from("job_matches")
      .select("overall_score, category, rationale, jobs!inner(id, title, company_name, location, apply_url, discovered_at)")
      .eq("user_id", p.id)
      .gte("created_at", since)
      .order("overall_score", { ascending: false })
      .limit(20);
    if (!matches?.length) continue;
    const rows = matches
      .map((m: any) => {
        const j = m.jobs;
        return `<tr><td style="padding:8px 0;border-bottom:1px solid #eee"><a href="${j.apply_url}" style="color:#2563eb;text-decoration:none;font-weight:600">${j.title}</a><div style="font-size:12px;color:#666">${j.company_name}${j.location ? " · " + j.location : ""} · Score ${m.overall_score} (${m.category})</div></td></tr>`;
      })
      .join("");
    const html = `<div style="font-family:system-ui,sans-serif;max-width:600px"><h2 style="margin:0 0 12px">Your top job matches</h2><p style="color:#666;font-size:14px;margin:0 0 16px">${matches.length} new matches in the last 24h. Open each link to review and apply yourself — we never auto-submit.</p><table style="width:100%;border-collapse:collapse">${rows}</table></div>`;
    try {
      await sendEmail(p.email, `${matches.length} new job matches`, html);
      sent++;
    } catch (e) {
      errors.push(`${p.email}: ${(e as Error).message}`);
    }
  }
  return { sent, errors };
}