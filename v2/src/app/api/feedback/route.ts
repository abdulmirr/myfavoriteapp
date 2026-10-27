import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { userClient } from "@/lib/api-guard";
import { REPORT_EMAIL } from "@/lib/social";

/**
 * The "Message Favorite" bubble. Stores the note (feedback table, insert-only)
 * and emails it to the founder's inbox via Resend. Signed-in senders are
 * identified from their token; visitors may leave an email to be answered.
 */

const TOPICS = new Set(["bug", "idea", "submission", "other"]);
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

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many messages — try again in a few minutes." }, { status: 429 });
  }

  let body: { topic?: string; message?: string; email?: string; page?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const topic = TOPICS.has(body.topic ?? "") ? body.topic! : "other";
  const message = (body.message ?? "").trim().slice(0, 2000);
  const email = (body.email ?? "").trim().slice(0, 200) || null;
  const page = (body.page ?? "").slice(0, 300) || null;
  if (!message) return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  }

  // who's writing (optional)
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  let profile: { id: string; username: string } | null = null;
  let userEmail: string | null = null;
  let db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  if (token) {
    const udb = userClient(token);
    const { data } = await udb.auth.getUser(token);
    if (data.user) {
      db = udb;
      userEmail = data.user.email ?? null;
      const { data: p } = await udb
        .from("profiles")
        .select("id, username")
        .eq("user_id", data.user.id)
        .maybeSingle();
      profile = (p as { id: string; username: string } | null) ?? null;
    }
  }

  const { error } = await db.from("feedback").insert({
    profile_id: profile?.id ?? null,
    email: email ?? userEmail,
    topic,
    message,
    page,
  });
  if (error) console.error("feedback insert failed:", error.message);

  const key = process.env.RESEND_API_KEY;
  if (key) {
    const from = process.env.EMAIL_FROM || "Favorite <hello@myfavoriteapp.com>";
    const replyTo = email ?? userEmail ?? undefined;
    const who = profile ? `@${profile.username}` : "a visitor";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [REPORT_EMAIL],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: `Favorite ${topic}: ${message.slice(0, 60).replace(/\s+/g, " ")}`,
        html: `<p style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${esc(message)}</p>
<p style="font-family:system-ui,sans-serif;font-size:13px;color:#6b7280">From ${esc(who)}${replyTo ? ` · ${esc(replyTo)}` : ""}${page ? ` · ${esc(page)}` : ""}</p>`,
      }),
    }).catch(() => null);
    if (!res?.ok) console.error("feedback email failed:", res?.status);
  }

  if (error && !key) return NextResponse.json({ error: "Couldn't send — try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
