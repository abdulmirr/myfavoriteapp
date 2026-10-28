import { NextRequest, NextResponse } from "next/server";
import { getCommunityPicks } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase";
import { issueEmail, sendEmails } from "@/lib/newsletter";

/**
 * The daily send (Vercel Cron, production only — see vercel.json): today's
 * five community picks, the same set Home shows signed-out, to every active
 * subscriber. The day is claimed first, so a doubled cron fire is a no-op;
 * a lost send beats a double one. `?to=<email>` sends one preview copy to
 * that address without claiming the day, `?html` returns the issue as a page.
 * All of it needs the cron secret.
 */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const key = process.env.NEWSLETTER_KEY ?? "";
  const day = new Date().toISOString().slice(0, 10);
  const picks = (await getCommunityPicks(day)).slice(0, 5);
  if (!picks.length) return NextResponse.json({ sent: 0, reason: "no picks today" });

  if (req.nextUrl.searchParams.has("html")) {
    return new NextResponse(issueEmail(day, picks, "preview").html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  const preview = req.nextUrl.searchParams.get("to");
  if (preview) {
    const ok = await sendEmails([preview], [issueEmail(day, picks, "preview")]);
    return NextResponse.json({ preview, ok });
  }

  const db = supabaseServer();
  const { data: claimed, error } = await db.rpc("newsletter_claim", { p_key: key, p_day: day });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!claimed) return NextResponse.json({ sent: 0, reason: "already sent today" });

  const { data: recipients } = await db.rpc("newsletter_recipients", { p_key: key });
  const list = (recipients ?? []) as { email: string; token: string }[];
  let sent = 0;
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    if (await sendEmails(chunk.map((r) => r.email), chunk.map((r) => issueEmail(day, picks, r.token)))) {
      sent += chunk.length;
    }
    // Resend's default limit is 2 requests a second
    if (i + 100 < list.length) await new Promise((r) => setTimeout(r, 600));
  }
  await db.rpc("newsletter_finish", {
    p_key: key,
    p_day: day,
    p_picks: picks.map((p) => ({ id: p.item.id, title: p.item.title, by: p.by.username })),
    p_recipients: sent,
  });
  return NextResponse.json({ sent, of: list.length });
}
