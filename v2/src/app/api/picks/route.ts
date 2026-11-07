import { NextRequest, NextResponse, after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyPick, Item, MediaType, RecCategoryKey, RecCounts } from "@/lib/types";
import { requireUser, withinLimit } from "@/lib/api-guard";
import type { Signal } from "@/lib/picks";
import { PASS_WINDOW_MS, choosePicks, ownedSet, tasteGate, visiblePicks, type OwnedRow } from "@/lib/daily-picks";

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

/** Everything already theirs (favorites and saves), as keys a pick is checked against. */
async function ownedKeys(db: SupabaseClient, profileId: string): Promise<Set<string>> {
  const [{ data: favs }, { data: saves }] = await Promise.all([
    db.from("items").select("media_type, title, canonical_id").eq("profile_id", profileId).limit(5000),
    db.from("list_items").select("media_type, title, canonical_id").eq("profile_id", profileId).limit(5000),
  ]);
  return ownedSet([...(favs ?? []), ...(saves ?? [])] as OwnedRow[]);
}

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
    const picks = await choosePicks(
      {
        items: (items ?? []) as Item[],
        tasteNote: priv?.taste_note?.trim() ?? "",
        dismissed: (dismissed ?? []) as Signal[],
        saved: (saved ?? []) as Signal[],
        recent: ((recent ?? []) as { items: DailyPick[] }[]).flatMap((r) => r.items ?? []),
        owned: keys,
      },
      profileId,
      day,
      { eligible, counts }
    );
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
  const { counts, eligible } = tasteGate(((typeRows ?? []) as { media_type: MediaType }[]).map((r) => r.media_type));
  if (!eligible.length) return NextResponse.json({ gated: true, counts, picks: [] });

  const day = localDay(req);
  const ctx: Ctx = { db, profileId: profile.id, eligible, counts };

  // a pick passed on today vanishes on reload (the stored set stays intact)
  const { data: passed } = await db
    .from("rec_dismissals")
    .select("media_type, title")
    .eq("profile_id", profile.id)
    .gte("created_at", new Date(Date.now() - PASS_WINDOW_MS).toISOString());
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
      picks: visiblePicks(picks, (passed ?? []) as Signal[], keys),
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
