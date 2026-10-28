import { NextRequest, NextResponse, after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
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
import { tmdb, books, music, podcasts, wikipedia } from "@/lib/search-sources";
import { requireUser, withinLimit, safeFetch } from "@/lib/api-guard";

/**
 * Today's picks (v2's For You): ONE pick per unlocked category — an album,
 * a book, a film or show, a read/listen — each with a one-line hook (the
 * card's note tab) and a reason that names the person's own favorites (the
 * yellow highlight). Generated once per person per local day and cached in
 * daily_picks; right after today's set is served, tomorrow's is generated in
 * the background so the morning load is instant.
 */
export const maxDuration = 120;

// Sonnet 5.5: under half Opus 5.5's cost per set (input-heavy prompts). On a
// real 150-favorite library, effort "low" cost the same as "medium" but picked
// the obvious next thing, so medium stays.
const MODEL = "claude-sonnet-5-5";

const SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          media_type: { type: "string", enum: ["book", "movie", "tv", "music", "podcast", "article"] },
          title: { type: "string" },
          creator: { type: "string", description: "Author / director / artist / host" },
          year: { type: "string" },
          url: {
            type: "string",
            description:
              "Articles/essays only: the canonical URL of the piece if you know it with high confidence. Empty string otherwise.",
          },
          hook: {
            type: "string",
            description:
              "One line, at most 70 characters, like a friend texting why it's worth their time. No spoilers, no hype words, no title.",
          },
          reason: {
            type: "string",
            description: "1-2 sentences connecting this pick to specific things they've favorited, by name.",
          },
        },
        required: ["media_type", "title", "creator", "year", "url", "hook", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["picks"],
  additionalProperties: false,
} as const;

const ASK: Record<RecCategoryKey, string> = {
  music: "one album (media_type music)",
  books: "one book",
  filmtv: "one film or TV show (media_type movie or tv)",
  reading:
    "one thing to read or listen to: a real, well-known essay or article that is freely readable online " +
    "(media_type article, creator = author, url = its canonical page, only if you're confident it's real) " +
    "or a podcast (media_type podcast)",
};

type Signal = { media_type: string; title: string; creator: string };

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

/** Load an article and pull its share image; `usable:false` only for confirmed-dead URLs. */
async function articlePreview(url: string): Promise<{ usable: boolean; image: string | null }> {
  try {
    const res = await safeFetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
    });
    if (res.status === 404 || res.status === 410) return { usable: false, image: null };
    if (!res.ok) return { usable: true, image: null }; // bot-blocked, not dead
    const html = (await res.text()).slice(0, 200_000);
    const m =
      html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image(?::url)?|twitter:image)["']/i);
    return { usable: true, image: m ? new URL(m[1].replace(/&amp;/g, "&"), res.url).toString() : null };
  } catch {
    return { usable: false, image: null };
  }
}

/** Today in the requester's timezone (client sends getTimezoneOffset minutes). */
function localDay(req: NextRequest, plusDays = 0): string {
  const raw = parseInt(req.headers.get("x-tz-offset") ?? "", 10);
  const offset = Number.isFinite(raw) ? Math.max(-840, Math.min(840, raw)) : 0;
  return new Date(Date.now() - offset * 60_000 + plusDays * 864e5).toISOString().slice(0, 10);
}

const list = (rows: Signal[]) =>
  rows
    .map((d) => `- [${d.media_type}] ${d.title.slice(0, 200)}${d.creator ? ` by ${d.creator.slice(0, 100)}` : ""}`)
    .join("\n");

async function generate(
  items: Item[],
  tasteNote: string,
  eligible: RecCategoryKey[],
  avoid: { dismissed: Signal[]; saved: Signal[]; recent: Signal[]; older: Signal[] }
): Promise<DailyPick[]> {
  const library = items
    .map((i) => {
      const year = i.metadata?.year ? ` (${i.metadata.year})` : "";
      const why = i.description ? ` — "${i.description.slice(0, 500)}"` : "";
      return `- [${i.media_type}] ${i.title}${i.creator ? ` by ${i.creator}` : ""}${year}${why}`;
    })
    .join("\n");

  const prompt =
    `Here is everything I've favorited (my notes in quotes):\n\n${library}\n\n` +
    (avoid.older.length
      ? `Also in my favorites, from longer ago (never suggest these either):\n${list(avoid.older)}\n\n`
      : "") +
    (tasteNote ? `A standing note from me about what to pick: ${tasteNote}\n\n` : "") +
    (avoid.dismissed.length
      ? `I passed on these recent suggestions — never suggest them again, and read them as taste signal:\n${list(avoid.dismissed)}\n\n`
      : "") +
    (avoid.saved.length
      ? `Already saved to check out later (don't suggest these; they show what I'm curious about right now):\n${list(avoid.saved)}\n\n`
      : "") +
    (avoid.recent.length ? `Already suggested to me this week (don't repeat):\n${list(avoid.recent)}\n\n` : "") +
    `Pick exactly ${eligible.length} thing${eligible.length === 1 ? "" : "s"} for me today: ` +
    eligible.map((k) => ASK[k]).join("; ") +
    ". One per category, nothing else. For each: a one-line hook and a short reason that names specific things I've favorited.";

  const anthropic = new Anthropic();
  // `fallbacks: "default"` (beta) re-runs a classifier decline on Anthropic's
  // recommended model server-side; the installed SDK only types the older
  // array form, so the request is typed by hand here.
  const params = {
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system:
      "You are the taste engine behind Favorite, where people keep the books, films, music and writing they love. " +
      "You study someone's favorites and choose what they should try next. Your picks are specific and a little " +
      "off the beaten path — never generic crowd-pleasers unless they truly fit. Never suggest anything already in " +
      "their favorites. Write like a friend with great taste: plain words, no hype, no spoilers.",
    messages: [{ role: "user", content: prompt }],
  } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming;
  const response = await anthropic.beta.messages.create(params);
  if (response.stop_reason === "refusal") throw new Error("model declined");
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
  console.log("picks usage:", JSON.stringify(response.usage));
  const parsed = JSON.parse(text) as {
    picks: (Omit<DailyPick, "image_url" | "view_url" | "canonical_id"> & { url: string })[];
  };

  const wanted = new Set(REC_CATEGORIES.filter((c) => eligible.includes(c.key)).flatMap((c) => c.types));
  const picks = parsed.picks.filter((p) => wanted.has(p.media_type as MediaType)).slice(0, eligible.length);

  // artwork + a link from the same sources the add-search uses, so cards look native
  return Promise.all(
    picks.map(async (p) => {
      let image_url: string | null = null;
      let view_url: string | null = null;
      let canonical_id: string | null = null;
      try {
        const q = `${p.title} ${p.creator}`.trim();
        const type = p.media_type as MediaType;
        if (type === "article") {
          if (/^https?:\/\//i.test(p.url)) {
            const page = await articlePreview(p.url);
            if (page.usable) {
              view_url = p.url;
              image_url = page.image;
            }
          }
          if (!view_url) view_url = (await wikipedia(q))[0]?.view_url ?? null;
        } else {
          const hits =
            type === "movie" || type === "tv"
              ? await tmdb(type, p.title)
              : type === "book"
                ? await books(q)
                : type === "music"
                  ? await music(q)
                  : await podcasts(q);
          if (hits[0]) {
            image_url = hits[0].image_url;
            view_url = hits[0].view_url;
            canonical_id = hits[0].canonical_id;
          }
        }
      } catch {
        /* artwork is best-effort; the card renders a title card without it */
      }
      const { url: _url, ...core } = p;
      return {
        ...core,
        hook: core.hook.trim().slice(0, 90),
        image_url,
        view_url,
        canonical_id,
      } as DailyPick;
    })
  );
}

type Ctx = {
  db: SupabaseClient;
  profileId: string;
  eligible: RecCategoryKey[];
};

/** Claim the (profile, day) row, generate, store. Returns null if someone else holds the claim. */
async function claimAndGenerate({ db, profileId, eligible }: Ctx, day: string): Promise<DailyPick[] | null> {
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
        .limit(30),
      db.from("daily_picks").select("items").eq("profile_id", profileId).gte("day", weekAgo).neq("day", day),
      ownedKeys(db, profileId),
    ]);
    // the newest 150 in full (notes and all); the rest as a do-not-suggest list
    const all = (items ?? []) as Item[];
    const generated = await generate(all.slice(0, 150), priv?.taste_note?.trim() ?? "", eligible, {
      dismissed: (dismissed ?? []) as Signal[],
      saved: (saved ?? []) as Signal[],
      recent: ((recent ?? []) as { items: DailyPick[] }[]).flatMap((r) => r.items ?? []),
      older: all.slice(150),
    });
    if (!generated.length) throw new Error("empty");
    // never what they already have, whatever the model says (an all-owned set is
    // kept so the claim completes; responses filter it, and Home tops up)
    const fresh = generated.filter((p) => !owned(p, keys));
    const picks = fresh.length ? fresh : generated;
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
  const ctx: Ctx = { db, profileId: profile.id, eligible };

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
