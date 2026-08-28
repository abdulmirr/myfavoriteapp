import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  REC_CATEGORIES,
  REC_MIN_PER_CATEGORY,
  type Item,
  type MediaType,
  type RecCategoryKey,
  type RecCounts,
  type Recommendation,
} from "@/lib/types";
import { tmdb, books, music, podcasts, wikipedia } from "@/lib/search-sources";
import { requireUser, withinLimit, safeFetch } from "@/lib/api-guard";

// Claude call + artwork enrichment can take a while on the first request of
// the day; every later request is a cached DB read.
export const maxDuration = 120;

// Sonnet 5: near-Opus quality on taste-matching at a fraction of the cost.
const MODEL = "claude-sonnet-5";

const REC_SCHEMA = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          media_type: {
            type: "string",
            enum: ["book", "movie", "tv", "music", "podcast", "article", "other"],
          },
          title: { type: "string" },
          creator: {
            type: "string",
            description: "Author / director / artist / host",
          },
          year: { type: "string" },
          url: {
            type: "string",
            description:
              "Articles/essays only: the canonical URL of the piece if you know it " +
              "with high confidence (the publication's own page). Empty string otherwise.",
          },
          reason: {
            type: "string",
            description:
              "1-2 sentences connecting this pick to specific items in their library",
          },
        },
        required: ["media_type", "title", "creator", "year", "url", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["recommendations"],
  additionalProperties: false,
} as const;

/**
 * Load an article URL and pull its share-card image (og:image / twitter:image).
 * `usable: false` only for confirmed-dead URLs (404/410, DNS failure, timeout).
 * A 403/401/429 means the site blocks server-side fetches — the link still
 * works in a browser, so keep it; we just can't read its preview image.
 * An absent image beats an irrelevant one, so there is no image fallback.
 */
async function articlePreview(url: string): Promise<{ usable: boolean; image: string | null }> {
  try {
    // model-generated URL — same private-address vetting as caller-supplied ones
    const res = await safeFetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        // some publications block the default fetch UA
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
    });
    if (res.status === 404 || res.status === 410) return { usable: false, image: null };
    if (!res.ok) return { usable: true, image: null }; // bot-blocked, not dead
    const html = (await res.text()).slice(0, 200_000);
    const match =
      html.match(
        /<meta[^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/i
      ) ??
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image(?::url)?|twitter:image)["']/i
      );
    const image = match
      ? new URL(match[1].replace(/&amp;/g, "&"), res.url).toString()
      : null;
    return { usable: true, image };
  } catch {
    return { usable: false, image: null };
  }
}

/**
 * Today in the requester's timezone — the cache key for daily recs, so the
 * set rolls over at THEIR midnight, not UTC's (which lands mid-evening in the
 * Americas and read as a random mid-day refresh). Stored in the `week_start`
 * column, whose name predates the daily cadence; it's just a date key.
 * The offset is `Date.getTimezoneOffset()` minutes sent by the client
 * (positive west of UTC); absent or garbage falls back to UTC.
 */
function dayKey(req: NextRequest): string {
  const raw = parseInt(req.headers.get("x-tz-offset") ?? "", 10);
  const offset = Number.isFinite(raw) ? Math.max(-840, Math.min(840, raw)) : 0;
  return new Date(Date.now() - offset * 60_000).toISOString().slice(0, 10);
}

/** the per-category ask, spliced into the prompt only when that category is unlocked */
const CATEGORY_ASK: Record<RecCategoryKey, string> = {
  music: "exactly 3 music (albums)",
  books: "exactly 3 books",
  filmtv: "exactly 3 films or shows (media_type movie or tv)",
  reading:
    "exactly 3 articles/essays/blog posts (media_type article — real, well-known " +
    "pieces that are freely readable online; set creator to the author, and set " +
    "url to the piece's canonical page — you should be confident the URL is real; " +
    "prefer pieces whose URL you know over more obscure ones)",
};

/** what a "not for me" tap stores — enough to name the pick back to the model */
interface Dismissal {
  media_type: string;
  title: string;
  creator: string;
}

async function generate(
  items: Item[],
  tasteNote: string,
  eligible: RecCategoryKey[],
  dismissed: Dismissal[],
  radar: Dismissal[]
): Promise<Recommendation[]> {
  const library = items
    .map((i) => {
      const year = i.metadata?.year ? ` (${i.metadata.year})` : "";
      // the user's own note is the strongest taste signal — send it nearly
      // whole; the cap only guards against pasted-in essays blowing up tokens
      const desc = i.description ? ` — ${i.description.slice(0, 600)}` : "";
      return `- [${i.media_type}] ${i.title}${i.creator ? ` by ${i.creator}` : ""}${year}${desc}`;
    })
    .join("\n");

  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: REC_SCHEMA } },
    system:
      "You are the taste engine behind Favorite, a personal media library. " +
      "You study what someone has saved and recommend what they should try next. " +
      "Your picks are specific, slightly off the beaten path, and never generic crowd-pleasers " +
      "unless they genuinely fit. Never recommend anything already in the library.",
    messages: [
      {
        role: "user",
        content:
          `Here is everything in my library:\n\n${library}\n\n` +
          (tasteNote
            ? `A standing note from me about what to pick: ${tasteNote}\n\n`
            : "") +
          (dismissed.length
            ? `I passed on these recent suggestions — never recommend them again, and read them as taste signal too:\n${dismissed
                .map(
                  (d) =>
                    `- [${d.media_type}] ${d.title.slice(0, 200)}${d.creator ? ` by ${d.creator.slice(0, 100)}` : ""}`
                )
                .join("\n")}\n\n`
            : "") +
          (radar.length
            ? `Already on my saved-for-later list — I know about these, so don't recommend them, but they're a live signal of what I'm curious about right now (never call this list a "radar" in your reasons):\n${radar
                .map(
                  (d) =>
                    `- [${d.media_type}] ${d.title.slice(0, 200)}${d.creator ? ` by ${d.creator.slice(0, 100)}` : ""}`
                )
                .join("\n")}\n\n`
            : "") +
          `Recommend exactly ${eligible.length * 3} things for me today: ` +
          eligible.map((key) => CATEGORY_ASK[key]).join("; ") +
          ". Stick to those categories only — I haven't saved enough elsewhere for " +
          "you to read my taste there. For each, explain in 1-2 sentences why it " +
          "fits my taste, referencing specific things I've saved.",
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("model refused");
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  console.log("recs usage:", JSON.stringify(response.usage));
  const parsed = JSON.parse(text) as {
    recommendations: (Omit<Recommendation, "image_url" | "view_url"> & { url: string })[];
  };

  // the prompt scopes the ask to unlocked categories; drop any stray pick the
  // model returns outside them rather than surface a low-signal guess
  const wanted = new Set(
    REC_CATEGORIES.filter((c) => eligible.includes(c.key)).flatMap((c) => c.types)
  );
  const picks = parsed.recommendations.filter((r) => wanted.has(r.media_type as MediaType));

  // enrich each pick with artwork + a link from the same sources the
  // library's add-search uses, so the grid looks native
  return Promise.all(
    picks.map(async (rec) => {
      let image_url: string | null = null;
      let view_url: string | null = null;
      try {
        const q = `${rec.title} ${rec.creator}`.trim();
        const type = rec.media_type as MediaType;
        if (type === "article" || type === "other") {
          // the piece's own share-card image, or none — never a lookalike.
          // model-provided URL first; Wikipedia only as a link fallback.
          if (/^https?:\/\//i.test(rec.url)) {
            const page = await articlePreview(rec.url);
            if (page.usable) {
              view_url = rec.url;
              image_url = page.image;
            }
          }
          if (!view_url) {
            const wiki = (await wikipedia(q))[0];
            if (wiki) view_url = wiki.view_url;
          }
        } else {
          const results =
            type === "movie" || type === "tv"
              ? await tmdb(type, rec.title)
              : type === "book"
                ? await books(q)
                : type === "music"
                  ? await music(q)
                  : type === "podcast"
                    ? await podcasts(q)
                    : [];
          if (results[0]) {
            image_url = results[0].image_url;
            view_url = results[0].view_url;
          }
        }
      } catch {
        // artwork is best-effort; the card renders fine without it
      }
      const { url: _url, ...core } = rec;
      return { ...core, image_url, view_url };
    })
  );
}

/** A claim row this old with no items means its owner request died — take over. */
const STALE_CLAIM_MS = 3 * 60 * 1000;

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { db } = auth;

  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .eq("user_id", auth.userId)
    .maybeSingle<{ id: string }>();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 404 });

  // taste gate: with no category at REC_MIN_PER_CATEGORY the model would be
  // guessing — tell the UI to ask for more saves instead of spending a
  // generation on thin data
  const { data: typeRows } = await db
    .from("items")
    .select("media_type")
    .eq("profile_id", profile.id);
  const saved = (typeRows ?? []) as { media_type: MediaType }[];
  const counts = Object.fromEntries(
    REC_CATEGORIES.map((c) => [c.key, saved.filter((r) => c.types.includes(r.media_type)).length])
  ) as RecCounts;
  const eligible = REC_CATEGORIES.filter((c) => counts[c.key] >= REC_MIN_PER_CATEGORY);
  if (!eligible.length) {
    return NextResponse.json({ gated: true, total: saved.length, counts, recommendations: [] });
  }

  const [{ data: priv }, { data: dismissedRows }, { data: radarRows }] = await Promise.all([
    db
      .from("profile_private")
      .select("taste_note")
      .eq("profile_id", profile.id)
      .maybeSingle<{ taste_note: string }>(),
    db
      .from("rec_dismissals")
      .select("media_type, title, creator")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(40),
    db
      .from("radar_items")
      .select("media_type, title, creator")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const dismissed = (dismissedRows ?? []) as Dismissal[];
  const radar = (radarRows ?? []) as Dismissal[];
  // a pick dismissed (or put on the radar) after today's set was cached still
  // vanishes on reload — the cache row is left intact, only the response filtered
  const dismissedKeys = new Set(
    [...dismissed, ...radar].map((d) => `${d.media_type}|${d.title.toLowerCase()}`)
  );
  const notDismissed = (recs: Recommendation[]) =>
    recs.filter((r) => !dismissedKeys.has(`${r.media_type}|${r.title.toLowerCase()}`));

  const day = dayKey(req);
  const total = saved.length;

  // every success response goes through here so the dismissed-filter and the
  // shape (counts/total, allDismissed when the user passed on the whole set)
  // can't drift between the cached, waiter, restored, and fresh paths
  const respond = (recs: Recommendation[]) => {
    const filtered = notDismissed(recs);
    return NextResponse.json({
      day,
      recommendations: filtered,
      counts,
      total,
      ...(recs.length && !filtered.length ? { allDismissed: true } : {}),
    });
  };

  // claim-row pattern: the day's row is inserted empty before the model call,
  // so N parallel first loads spend exactly one Anthropic call. A populated
  // row is the day's set, full stop — the ONLY thing that refreshes For You
  // is the day key rolling over at the requester's midnight. (A category
  // unlocked mid-day gets its picks tomorrow; the UI says so.)
  const { data: cached } = await db
    .from("recommendations")
    .select("items, created_at")
    .eq("profile_id", profile.id)
    .eq("week_start", day)
    .maybeSingle<{ items: Recommendation[]; created_at: string }>();
  if (cached?.items?.length) return respond(cached.items);

  let claimed = false;
  if (!cached) {
    const { error: claimErr } = await db
      .from("recommendations")
      .insert({ profile_id: profile.id, week_start: day, items: [] });
    claimed = !claimErr; // unique violation → someone else is generating
  } else if (Date.now() - new Date(cached.created_at).getTime() > STALE_CLAIM_MS) {
    // the original claimer died mid-generation — take over atomically, so N
    // concurrent requests can't all decide the claim is theirs (that would
    // mean N parallel Anthropic calls): only the update that actually moves
    // created_at past the cutoff wins
    const { data: reclaimed } = await db
      .from("recommendations")
      .update({ created_at: new Date().toISOString() })
      .eq("profile_id", profile.id)
      .eq("week_start", day)
      .lt("created_at", new Date(Date.now() - STALE_CLAIM_MS).toISOString())
      .select("week_start");
    claimed = !!reclaimed?.length;
  }

  if (!claimed) {
    // another request is generating — wait for its row to fill
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const { data: row } = await db
        .from("recommendations")
        .select("items")
        .eq("profile_id", profile.id)
        .eq("week_start", day)
        .maybeSingle<{ items: Recommendation[] }>();
      if (row?.items?.length) return respond(row.items);
    }
    return NextResponse.json({ pending: true }, { status: 202 });
  }

  const { data: items } = await db
    .from("items")
    .select("*")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(120);
  if (!items?.length) {
    // release the claim — an empty library shouldn't hold the day's slot
    await db.from("recommendations").delete()
      .eq("profile_id", profile.id).eq("week_start", day);
    return NextResponse.json({ day, recommendations: [], empty: true });
  }

  // budget caps Anthropic spend — charge only the request that actually
  // generates (waiters and re-polls already returned above), so a slow first
  // load can't burn the whole daily quota on retries
  if (!(await withinLimit(db, "recs", 20))) {
    await db.from("recommendations").delete()
      .eq("profile_id", profile.id).eq("week_start", day);
    return NextResponse.json({ error: "daily limit reached" }, { status: 429 });
  }

  try {
    const recommendations = await generate(
      items as Item[],
      priv?.taste_note?.trim() ?? "",
      eligible.map((c) => c.key),
      dismissed,
      radar
    );

    const { error: saveErr } = await db
      .from("recommendations")
      .update({ items: recommendations })
      .eq("profile_id", profile.id)
      .eq("week_start", day);
    if (saveErr) console.error("recommendation cache write failed:", saveErr.message);

    // keep a week of picks history (recent-past sets may become a revisitable
    // surface); anything older is dead weight
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    await db.from("recommendations").delete()
      .eq("profile_id", profile.id).lt("week_start", weekAgo);

    return respond(recommendations);
  } catch (e) {
    console.error("recommendation generation failed:", e);
    // free the claim so a retry can generate — but only while it's still
    // empty, so a concurrent generator's finished results are never wiped
    const { data: row } = await db
      .from("recommendations")
      .select("items")
      .eq("profile_id", profile.id)
      .eq("week_start", day)
      .maybeSingle<{ items: Recommendation[] }>();
    if (!row?.items?.length) {
      await db.from("recommendations").delete()
        .eq("profile_id", profile.id).eq("week_start", day);
    }
    return NextResponse.json({ error: "generation failed" }, { status: 502 });
  }
}
