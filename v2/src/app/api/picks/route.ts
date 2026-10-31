import { NextRequest, NextResponse, after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  REC_CATEGORIES,
  REC_MIN_PER_CATEGORY,
  type DailyPick,
  type Item,
  type MediaType,
  type RecCategoryKey,
  type RecCounts,
} from "@/lib/types";
import { requireUser, withinLimit } from "@/lib/api-guard";
import { generatePicks, pickSlots, selectPicks, type Signal } from "@/lib/picks";

/**
 * Today's picks (v2's For You): five, all chosen from the person's own
 * favorites and saves (lib/picks.ts) — one per unlocked category (an album,
 * a book, a film or show, a read/listen), the rest where their favorites
 * lean — each with a one-line hook (the card's note tab) and a reason that
 * names the person's own favorites (the yellow highlight). Generated once
 * per person per local day and cached in daily_picks; right after today's
 * set is served, tomorrow's is generated in the background so the morning
 * load is instant.
 */
export const maxDuration = 120;

/** "The Godfather", "Godfather (1972)", "godfather" — one comparable spelling */
function normTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}
/** films and shows share a shelf, as do links, videos and the rest */
const FAMILY: Record<string, string> = {
  movie: "screen",
  tv: "screen",
  music: "music",
  book: "book",
  podcast: "podcast",
  article: "web",
  video: "web",
  other: "web",
  photo: "photo",
};
const ownKey = (type: string, title: string) => `${FAMILY[type] ?? type}|${normTitle(title)}`;

/**
 * Everything already theirs — every favorite and every save — as keys a pick
 * is checked against. A pick for something you own defeats the point.
 */
async function ownedKeys(db: SupabaseClient, profileId: string): Promise<Set<string>> {
  const [{ data: favs }, { data: saves }] = await Promise.all([
    db.from("items").select("media_type, title, canonical_id").eq("profile_id", profileId).limit(5000),
    db.from("list_items").select("media_type, title, canonical_id").eq("profile_id", profileId).limit(5000),
  ]);
  const keys = new Set<string>();
  for (const r of [...(favs ?? []), ...(saves ?? [])] as { media_type: string; title: string; canonical_id: string | null }[]) {
    keys.add(ownKey(r.media_type, r.title));
    if (r.canonical_id) keys.add(r.canonical_id);
  }
  return keys;
}

const owned = (p: Pick<DailyPick, "media_type" | "title" | "canonical_id">, keys: Set<string>) =>
  (!!p.canonical_id && keys.has(p.canonical_id)) || keys.has(ownKey(p.media_type, p.title));

/** Today in the requester's timezone (client sends getTimezoneOffset minutes). */
function localDay(req: NextRequest, plusDays = 0): string {
  const raw = parseInt(req.headers.get("x-tz-offset") ?? "", 10);
  const offset = Number.isFinite(raw) ? Math.max(-840, Math.min(840, raw)) : 0;
  return new Date(Date.now() - offset * 60_000 + plusDays * 864e5).toISOString().slice(0, 10);
}

type Ctx = {
  db: SupabaseClient;
  profileId: string;
  eligible: RecCategoryKey[];
  counts: RecCounts;
};

/** Claim the (profile, day) row, generate, store. Returns null if someone else holds the claim. */
async function claimAndGenerate({ db, profileId, eligible, counts }: Ctx, day: string): Promise<DailyPick[] | null> {
  const { error: claimErr } = await db.from("daily_picks").insert({ profile_id: profileId, day, items: [] });
  if (claimErr) return null; // already claimed (or generated)

  try {
    if (!(await withinLimit(db, "picks", 6))) throw new Error("budget");
    const weekAgo = new Date(Date.parse(day) - 7 * 864e5).toISOString().slice(0, 10);
    const [{ data: items }, { data: priv }, { data: dismissed }, { data: saved }, { data: recent }, keys] = await Promise.all([
      db.from("items").select("*").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(1000),
      db.from("profile_private").select("taste_note").eq("profile_id", profileId).maybeSingle<{ taste_note: string }>(),
      db
        .from("rec_dismissals")
        .select("media_type, title, creator")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(40),
      db
        .from("list_items")
        .select("media_type, title, creator")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(200),
      db.from("daily_picks").select("items").eq("profile_id", profileId).gte("day", weekAgo).neq("day", day),
      ownedKeys(db, profileId),
    ]);
    // the newest 150 in full (notes and all); the rest as a do-not-suggest list
    const all = (items ?? []) as Item[];
    const slots = pickSlots(eligible, counts, `${profileId}:${day}`);
    const thisWeek = ((recent ?? []) as { items: DailyPick[] }[]).flatMap((r) => r.items ?? []);
    const generated = await generatePicks(all.slice(0, 150), priv?.taste_note?.trim() ?? "", slots, {
      dismissed: (dismissed ?? []) as Signal[],
      saved: (saved ?? []) as Signal[],
      recent: thisWeek,
      older: all.slice(150),
    });
    if (!generated.length) throw new Error("empty");
    // never what they already have, whatever the model says (an all-owned set is
    // kept so the claim completes; responses filter it)
    const fresh = generated.filter((p) => !owned(p, keys));
    const picks = selectPicks(fresh.length ? fresh : generated, slots, thisWeek);
    await db.from("daily_picks").update({ items: picks }).eq("profile_id", profileId).eq("day", day);
    // keep two weeks of history (repeat-avoidance + a future "past picks" view)
    const cutoff = new Date(Date.parse(day) - 14 * 864e5).toISOString().slice(0, 10);
    await db.from("daily_picks").delete().eq("profile_id", profileId).lt("day", cutoff);
    return picks;
  } catch (e) {
    // free the claim so a later request can try again
    await db.from("daily_picks").delete().eq("profile_id", profileId).eq("day", day).eq("items", "[]");
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { db } = auth;

  const { data: profile } = await db.from("profiles").select("id").eq("user_id", auth.userId).maybeSingle<{ id: string }>();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 404 });

  // taste gate: under REC_MIN_PER_CATEGORY saves in a category the model is guessing
  const { data: typeRows } = await db.from("items").select("media_type").eq("profile_id", profile.id);
  const saved = (typeRows ?? []) as { media_type: MediaType }[];
  const counts = Object.fromEntries(
    REC_CATEGORIES.map((c) => [c.key, saved.filter((r) => c.types.includes(r.media_type)).length])
  ) as RecCounts;
  const eligible = REC_CATEGORIES.filter((c) => counts[c.key] >= REC_MIN_PER_CATEGORY).map((c) => c.key);
  if (!eligible.length) return NextResponse.json({ gated: true, counts, picks: [] });

  const day = localDay(req);
  const ctx: Ctx = { db, profileId: profile.id, eligible, counts };

  // a pick passed on today vanishes on reload (the stored set stays intact)
  const { data: passed } = await db
    .from("rec_dismissals")
    .select("media_type, title")
    .eq("profile_id", profile.id)
    .gte("created_at", new Date(Date.now() - 2 * 864e5).toISOString());
  const passedKeys = new Set(((passed ?? []) as Signal[]).map((d) => `${d.media_type}|${d.title.toLowerCase()}`));
  const respond = async (picks: DailyPick[]) => {
    // checked against the library as it is now: favorited or saved since the set
    // was chosen (on this device or any other) and it's no longer a pick
    const keys = await ownedKeys(db, profile.id);
    // tomorrow's set brews after the response — mornings open instantly
    after(async () => {
      const tomorrow = localDay(req, 1);
      const { data: exists } = await db
        .from("daily_picks")
        .select("day")
        .eq("profile_id", profile.id)
        .eq("day", tomorrow)
        .maybeSingle();
      if (exists) return;
      try {
        await claimAndGenerate(ctx, tomorrow);
      } catch (e) {
        console.error("tomorrow's picks failed:", e instanceof Error ? e.message : e);
      }
    });
    return NextResponse.json({
      day,
      counts,
      picks: picks.filter((p) => !passedKeys.has(`${p.media_type}|${p.title.toLowerCase()}`) && !owned(p, keys)),
    });
  };

  const { data: row } = await db
    .from("daily_picks")
    .select("items, created_at")
    .eq("profile_id", profile.id)
    .eq("day", day)
    .maybeSingle<{ items: DailyPick[]; created_at: string }>();
  if (row?.items?.length) return respond(row.items);

  // an empty row older than 3 minutes is a claim whose generator died — clear it
  if (row && Date.now() - Date.parse(row.created_at) > 3 * 60_000) {
    await db.from("daily_picks").delete().eq("profile_id", profile.id).eq("day", day).eq("items", "[]");
  }

  try {
    const picks = await claimAndGenerate(ctx, day);
    if (picks) return respond(picks);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("picks failed:", msg);
    if (msg === "budget") return NextResponse.json({ error: "daily limit reached" }, { status: 429 });
    return NextResponse.json({ error: "generation failed" }, { status: 502 });
  }

  // someone else is generating today's set — wait briefly for it
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const { data: again } = await db
      .from("daily_picks")
      .select("items")
      .eq("profile_id", profile.id)
      .eq("day", day)
      .maybeSingle<{ items: DailyPick[] }>();
    if (again?.items?.length) return respond(again.items);
  }
  return NextResponse.json({ pending: true }, { status: 202 });
}
