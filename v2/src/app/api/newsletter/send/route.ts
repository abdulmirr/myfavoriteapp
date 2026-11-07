import { NextRequest, NextResponse } from "next/server";
import { getCommunityPicks, type CommunityPick } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase";
import type { DailyPick, Item } from "@/lib/types";
import type { Signal } from "@/lib/picks";
import { choosePicks, ownedSet, owned, tasteGate, visiblePicks, type OwnedRow } from "@/lib/daily-picks";
import { communityIssuePick, dailyIssuePick, issueEmail, sendEmails, type Email, type Issue } from "@/lib/newsletter";

/**
 * The daily send (Vercel Cron, production only — see vercel.json): every
 * subscriber gets the five picks Home shows them today. A member's are their
 * own daily_picks set — the very row Home reads, chosen here first if they
 * haven't opened Home since yesterday — minus what Home hides (passed on,
 * or favorited or saved since). A member with too few favorites gets
 * Home's starter five; an address with no account, the community's five.
 *
 * The day is claimed first, so a doubled cron fire is a no-op; a lost send
 * beats a double one. `?to=<email>` sends one preview copy of that
 * address's issue without claiming the day; `?html=<email>` returns it as a
 * page (bare `?html`: the community issue). All of it needs the cron secret.
 */
export const maxDuration = 300;

type Reader = { email: string; token: string; profile_id: string | null; display_name: string | null; username: string | null };

type TasteRow = {
  today: { items: DailyPick[]; created_at: string } | null;
  items: Item[];
  taste_note: string;
  dismissed: Signal[];
  passed: Signal[];
  saved: Signal[];
  owned: OwnedRow[];
  recent: DailyPick[];
};

const TOTAL = 5;
const key = () => process.env.NEWSLETTER_KEY ?? "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readTaste(profileId: string, day: string): Promise<TasteRow> {
  const { data, error } = await supabaseServer().rpc("newsletter_taste", { p_key: key(), p_profile: profileId, p_day: day });
  if (error) throw new Error(error.message);
  return data as TasteRow;
}

/**
 * Today's stored set for a member, chosen now if Home hasn't yet — claimed
 * and stored like /api/picks does, so Home and the email can only ever
 * have one set between them.
 */
async function todaysSet(profileId: string, day: string, t: TasteRow, gate: ReturnType<typeof tasteGate>): Promise<DailyPick[]> {
  if (t.today?.items?.length) return t.today.items;
  const db = supabaseServer();
  const args = { p_key: key(), p_profile: profileId, p_day: day };
  const { data: claimed, error } = await db.rpc("newsletter_picks_claim", args);
  if (error) throw new Error(error.message);
  if (claimed) {
    const taste = {
      items: t.items,
      tasteNote: t.taste_note.trim(),
      dismissed: t.dismissed,
      saved: t.saved,
      recent: t.recent,
      owned: ownedSet(t.owned),
    };
    try {
      // one more go if the model trips — a failure here is a missed morning
      const picks = await choosePicks(taste, profileId, day, gate).catch(() => choosePicks(taste, profileId, day, gate));
      await db.rpc("newsletter_picks_store", { ...args, p_items: picks });
      return picks;
    } catch (e) {
      await db.rpc("newsletter_picks_store", { ...args, p_items: [] });
      throw e;
    }
  }
  // Home is choosing it right now — that's the set to send
  for (let i = 0; i < 25; i++) {
    await sleep(4000);
    const again = await readTaste(profileId, day);
    if (again.today?.items?.length) return again.today.items;
  }
  throw new Error("set never landed");
}

/** What Home shows this reader today, as an issue — null when there's nothing left to show. */
async function issueFor(r: Reader, day: string, community: CommunityPick[]): Promise<Issue | null> {
  const name = r.display_name?.trim().split(/\s+/)[0] || r.username || "friend";
  if (!r.profile_id) {
    return { day, kind: "community", name, picks: community.slice(0, TOTAL).map(communityIssuePick) };
  }
  const t = await readTaste(r.profile_id, day);
  const keys = ownedSet(t.owned);
  const gate = tasteGate(t.items.map((i) => i.media_type));
  if (!gate.eligible.length) {
    // too few favorites to read yet: the community's five, minus what's theirs
    const starter = community
      .filter((c) => !owned({ media_type: c.item.media_type, title: c.item.title, canonical_id: c.item.canonical_id }, keys))
      .slice(0, TOTAL);
    return starter.length ? { day, kind: "starter", name, picks: starter.map(communityIssuePick) } : null;
  }
  const picks = visiblePicks(await todaysSet(r.profile_id, day, t, gate), t.passed, keys);
  return picks.length ? { day, kind: "own", name, picks: picks.map(dailyIssuePick) } : null;
}

/** run `fn` over `items`, `n` at a time, in order */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const day = new Date().toISOString().slice(0, 10);
  const community = await getCommunityPicks(day);
  const db = supabaseServer();
  const { data: audience, error: audienceErr } = await db.rpc("newsletter_audience", { p_key: key() });
  if (audienceErr) return NextResponse.json({ error: audienceErr.message }, { status: 500 });
  const readers = (audience ?? []) as Reader[];

  // previews: one address's issue (a stranger's address gets the community's)
  const params = req.nextUrl.searchParams;
  const preview = params.get("to") ?? params.get("html");
  if (preview !== null) {
    const r = readers.find((x) => x.email.toLowerCase() === preview.trim().toLowerCase()) ?? {
      email: preview,
      token: "preview",
      profile_id: null,
      display_name: null,
      username: null,
    };
    const issue = await issueFor(r, day, community);
    if (!issue) return NextResponse.json({ sent: 0, reason: "nothing to show today" });
    const email = await issueEmail(issue, "preview");
    if (params.has("html")) {
      return new NextResponse(email.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return NextResponse.json({ preview, kind: issue.kind, ok: await sendEmails([preview], [email]) });
  }

  const { data: claimed, error } = await db.rpc("newsletter_claim", { p_key: key(), p_day: day });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!claimed) return NextResponse.json({ sent: 0, reason: "already sent today" });

  // members whose set isn't chosen yet take a model call each — a few at a time
  const issues = await pool(readers, 4, (r) =>
    issueFor(r, day, community).catch((e) => {
      console.error("newsletter issue failed:", r.profile_id ?? "visitor", e instanceof Error ? e.message : e);
      return null;
    })
  );
  const ready: { reader: Reader; issue: Issue; email: Email }[] = [];
  for (let i = 0; i < readers.length; i++) {
    const issue = issues[i];
    if (issue) ready.push({ reader: readers[i], issue, email: await issueEmail(issue, readers[i].token) });
  }

  let sent = 0;
  for (let i = 0; i < ready.length; i += 100) {
    const chunk = ready.slice(i, i + 100);
    if (await sendEmails(chunk.map((x) => x.reader.email), chunk.map((x) => x.email))) sent += chunk.length;
    // Resend's default limit is 2 requests a second
    if (i + 100 < ready.length) await sleep(600);
  }
  await db.rpc("newsletter_finish", {
    p_key: key(),
    p_day: day,
    // what went to whom (by profile; addresses stay out of the log)
    p_picks: ready.map(({ reader, issue }) => ({
      profile: reader.profile_id,
      kind: issue.kind,
      titles: issue.picks.map((p) => p.title),
    })),
    p_recipients: sent,
  });
  return NextResponse.json({ sent, of: readers.length, skipped: readers.length - ready.length });
}
