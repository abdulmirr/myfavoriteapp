import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { Item, MediaType, Recommendation } from "@/lib/types";
import { tmdb, books, music, podcasts, wikipedia } from "@/lib/search-sources";
import { requireUser, withinLimit, safeFetch } from "@/lib/api-guard";

// Claude call + artwork enrichment can take a while on the first request of
// the week; every later request is a cached DB read.
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

/** Monday of the current week (UTC) — the cache key for weekly recs. */
function weekStart(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
}

async function generate(items: Item[], tasteNote: string): Promise<Recommendation[]> {
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
      "You are the taste engine behind Favorites, a personal media library. " +
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
          "Recommend exactly 12 things for me this week: exactly 3 music (albums), " +
          "exactly 3 books, exactly 3 films or shows (media_type movie or tv), and " +
          "exactly 3 articles/essays/blog posts (media_type article — real, well-known " +
          "pieces that are freely readable online; set creator to the author, and set " +
          "url to the piece's canonical page — you should be confident the URL is real; " +
          "prefer pieces whose URL you know over more obscure ones). For each, explain " +
          "in 1-2 sentences why it fits my taste, referencing specific things I've saved.",
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("model refused");
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  console.log("recs usage:", JSON.stringify(response.usage));
  const parsed = JSON.parse(text) as {
    recommendations: (Omit<Recommendation, "image_url" | "view_url"> & { url: string })[];
  };

  // enrich each pick with artwork + a link from the same sources the
  // library's add-search uses, so the grid looks native
  return Promise.all(
    parsed.recommendations.map(async (rec) => {
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

  const { data: priv } = await db
    .from("profile_private")
    .select("taste_note")
    .eq("profile_id", profile.id)
    .maybeSingle<{ taste_note: string }>();

  const week = weekStart();

  // claim-row pattern: the week's row is inserted empty before the model call,
  // so N parallel first loads spend exactly one Anthropic call.
  const { data: cached } = await db
    .from("recommendations")
    .select("items, created_at")
    .eq("profile_id", profile.id)
    .eq("week_start", week)
    .maybeSingle<{ items: Recommendation[]; created_at: string }>();
  if (cached?.items?.length) return NextResponse.json({ week, recommendations: cached.items });

  let claimed = false;
  if (!cached) {
    const { error: claimErr } = await db
      .from("recommendations")
      .insert({ profile_id: profile.id, week_start: week, items: [] });
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
      .eq("week_start", week)
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
        .eq("week_start", week)
        .maybeSingle<{ items: Recommendation[] }>();
      if (row?.items?.length) return NextResponse.json({ week, recommendations: row.items });
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
    // release the claim — an empty library shouldn't hold the week's slot
    await db.from("recommendations").delete()
      .eq("profile_id", profile.id).eq("week_start", week);
    return NextResponse.json({ week, recommendations: [], empty: true });
  }

  // budget caps Anthropic spend — charge only the request that actually
  // generates (waiters and re-polls already returned above), so a slow first
  // load can't burn the whole daily quota on retries
  if (!(await withinLimit(db, "recs", 20))) {
    await db.from("recommendations").delete()
      .eq("profile_id", profile.id).eq("week_start", week);
    return NextResponse.json({ error: "daily limit reached" }, { status: 429 });
  }

  try {
    const recommendations = await generate(items as Item[], priv?.taste_note?.trim() ?? "");

    const { error: saveErr } = await db
      .from("recommendations")
      .update({ items: recommendations })
      .eq("profile_id", profile.id)
      .eq("week_start", week);
    if (saveErr) console.error("recommendation cache write failed:", saveErr.message);

    return NextResponse.json({ week, recommendations });
  } catch (e) {
    console.error("recommendation generation failed:", e);
    // free the claim so a retry can generate — but only while it's still
    // empty, so a concurrent generator's finished results are never wiped
    const { data: row } = await db
      .from("recommendations")
      .select("items")
      .eq("profile_id", profile.id)
      .eq("week_start", week)
      .maybeSingle<{ items: Recommendation[] }>();
    if (!row?.items?.length) {
      await db.from("recommendations").delete()
        .eq("profile_id", profile.id).eq("week_start", week);
    }
    return NextResponse.json({ error: "generation failed" }, { status: 502 });
  }
}
