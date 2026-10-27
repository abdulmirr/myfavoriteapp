import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { confirmEmail, sendEmails } from "@/lib/newsletter";

/**
 * Visitors subscribe to the daily picks here (double opt-in: the confirmation
 * link arrives by email). Members subscribe their account email in one click
 * through the newsletter_set_me RPC instead. The answer is always "check your
 * inbox", so this can't be used to learn who's subscribed.
 */

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 2000) recent.clear();
  return hits.length > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many tries — give it a few minutes." }, { status: 429 });
  }
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const email = String(body.email ?? "").trim().slice(0, 200);

  const { data, error } = await supabaseServer().rpc("newsletter_subscribe", {
    p_key: process.env.NEWSLETTER_KEY ?? "",
    p_email: email,
  });
  if (error) {
    console.error("newsletter subscribe failed:", error.message);
    return NextResponse.json({ error: "Couldn't subscribe — try again." }, { status: 500 });
  }
  const r = data as { status: string; send?: boolean; token?: string };
  if (r.status === "invalid") {
    return NextResponse.json({ error: "That email doesn’t look right." }, { status: 400 });
  }
  if (r.send && r.token && !(await sendEmails([email], [confirmEmail(r.token)]))) {
    return NextResponse.json({ error: "Couldn't send the confirmation — try again." }, { status: 502 });
  }
  return NextResponse.json({ status: "pending" });
}
