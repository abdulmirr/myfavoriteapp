import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { emailPage } from "@/lib/newsletter";

/**
 * One-click unsubscribe target for email footers. The link carries a signed
 * token (hmac of profile + kind, minted in Postgres), so it works signed-out
 * and can't be forged to unsubscribe anyone else — `email_unsub` verifies it.
 */

// the same small page every email link lands on
const page = emailPage;

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
