import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

/**
 * One-click unsubscribe target for email footers. The link carries a signed
 * token (hmac of profile + kind, minted in Postgres), so it works signed-out
 * and can't be forged to unsubscribe anyone else — `email_unsub` verifies it.
 */

// visually continuous with the emails that link here (same shell: star mark,
// system sans, quiet footer) — this page is part of the email, not the app
const page = (title: string, note: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Favorites</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="text-align:center;font-size:15px;line-height:1.65;padding:24px;max-width:420px">
<img src="/favicon.svg" width="28" height="28" alt="Favorites" style="margin:0 auto 20px;display:block">
<p style="margin:0 0 6px;font-size:17px;font-weight:600">${title}</p>
<p style="margin:0;color:#71717a">${note}</p>
<p style="margin:28px 0 0;font-size:12px"><a href="https://myfavoriteapp.com" style="color:#a1a1aa">myfavoriteapp.com</a></p>
</div></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p") ?? "";
  const k = req.nextUrl.searchParams.get("k") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(p) || !t) {
    return page("That link didn’t work.", "It may be incomplete — try the link in your email again.");
  }
  const { data: ok } = await supabaseServer().rpc("email_unsub", {
    p_profile: p,
    p_kind: k,
    p_token: t,
  });
  return ok
    ? page(
        "You’re unsubscribed.",
        k === "digest"
          ? "No more weekly digests. You can turn them back on in Settings anytime."
          : "No more activity emails. You can turn them back on in Settings anytime."
      )
    : page("That link didn’t work.", "It may be old or already used — you can also manage emails in Settings.");
}
