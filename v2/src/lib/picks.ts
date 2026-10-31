import Anthropic from "@anthropic-ai/sdk";
import { REC_CATEGORIES, type DailyPick, type Item, type MediaType, type RecCategoryKey, type RecCounts } from "./types";
import { tmdb, books, music, podcasts, wikipedia } from "./search-sources";
import { safeFetch } from "./api-guard";
import { hashRange } from "./rand";

/**
 * The taste engine behind Home's daily picks: five things a day, every one
 * chosen from the person's own favorites and saves — one per category
 * they've unlocked, the rest where their favorites lean. /api/picks owns
 * the claiming and storing; this file only chooses.
 */

/** five a day, all of them from their own taste (never topped up with anyone else's) */
export const PICKS_PER_DAY = 5;
/** asked for on top, so a pick that's owned, repeats a creator or was abandoned has a stand-in */
const SPARES = 2;

// Sonnet 5.5: under half Opus 5.5's cost per set (input-heavy prompts). On a
// real 150-favorite library, effort "low" picked the obvious next thing, and
// "medium" skipped thinking altogether and wrote picks as it went — second
// guesses inside titles ("Enemy of the State? No: …"), blanked and
// "placeholder" entries, one set of seven came back with one usable pick.
// "high" thinks first (~1.6k tokens): every candidate clean, ~4¢ a set
// against medium's ~2.4¢ (2026-10-31).
const MODEL = "claude-sonnet-5-5";
const EFFORT = "high";

const SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          media_type: { type: "string", enum: ["book", "movie", "tv", "music", "podcast", "article"] },
          title: {
            type: "string",
            description: "The work's exact official title and nothing else — no notes, alternatives or second thoughts.",
          },
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

const ASK: Record<RecCategoryKey, (n: number) => string> = {
  music: (n) => `${n === 1 ? "one album" : `${n} albums`} (media_type music)`,
  books: (n) => (n === 1 ? "one book" : `${n} books`),
  filmtv: (n) => `${n === 1 ? "one film or TV show" : `${n} films or TV shows`} (media_type movie or tv)`,
  reading: (n) =>
    `${n === 1 ? "one thing" : `${n} things`} to read or listen to: a real, well-known essay or article that is freely ` +
    "readable online (media_type article, creator = author, url = its canonical page, only if you're confident it's real) " +
    "or a podcast (media_type podcast)",
};

export type Signal = { media_type: string; title: string; creator: string };

/**
 * How today's five split across the categories they've unlocked: one each,
 * then every spare slot drawn by how much of each they've favorited (seeded
 * by the day, so which category gets the extra moves from day to day).
 */
export function pickSlots(eligible: RecCategoryKey[], counts: RecCounts, seed: string): Partial<Record<RecCategoryKey, number>> {
  const slots: Partial<Record<RecCategoryKey, number>> = Object.fromEntries(eligible.map((k) => [k, 1]));
  const total = eligible.reduce((s, k) => s + counts[k], 0);
  for (let i = eligible.length; i < PICKS_PER_DAY; i++) {
    let r = ((hashRange(`${seed}:${i}`) + 1) / 2) * total;
    const k = eligible.find((c) => (r -= counts[c]) < 0) ?? eligible[0];
    slots[k] = (slots[k] ?? 0) + 1;
  }
  return slots;
}

/**
 * "Enemy of the State? No: Heaven Knows What", "Is There …? / Hmm — replaced:
 * Founder Mode" — a title the model second-guessed keeps its final answer
 */
const cleanTitle = (t: string) =>
  t.replace(/^.*(?:\?\s*No\b|\breplaced\b)\s*[:—–,-]?\s*/i, "").trim() || t.trim();

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

const list = (rows: Signal[]) =>
  rows
    .map((d) => `- [${d.media_type}] ${d.title.slice(0, 200)}${d.creator ? ` by ${d.creator.slice(0, 100)}` : ""}`)
    .join("\n");

const category = (type: string) => REC_CATEGORIES.find((c) => c.types.includes(type as MediaType))?.key;
const who = (creator: string) => creator.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Today's set from the model's candidates (best first, spares last): each
 * category's slots filled in order, one pick per creator, none by a creator
 * already suggested this week — and if the spares can't cover a category,
 * any other candidate left of a kind they've unlocked.
 */
export function selectPicks(
  candidates: DailyPick[],
  slots: Partial<Record<RecCategoryKey, number>>,
  recent: Signal[]
): DailyPick[] {
  const total = Object.values(slots).reduce((s, n) => s + (n ?? 0), 0);
  const thisWeek = new Set(recent.map((r) => who(r.creator)).filter(Boolean));
  const left = { ...slots };
  const chosen: DailyPick[] = [];
  const used = new Set<string>();
  const take = (p: DailyPick) => {
    chosen.push(p);
    if (who(p.creator)) used.add(who(p.creator));
  };
  for (const p of candidates) {
    const k = category(p.media_type);
    const c = who(p.creator);
    if (!k || !left[k] || (c && (used.has(c) || thisWeek.has(c)))) continue;
    left[k]!--;
    take(p);
  }
  for (const p of candidates) {
    if (chosen.length >= total) break;
    const k = category(p.media_type);
    if (chosen.includes(p) || !k || !slots[k] || used.has(who(p.creator))) continue;
    take(p);
  }
  // album, book, film, read — the order Home has always shown them in
  const rank = (p: DailyPick) => REC_CATEGORIES.findIndex((c) => c.key === category(p.media_type));
  return chosen.sort((a, b) => rank(a) - rank(b));
}

/**
 * Ask the model for today's candidates — the set, then a couple of spares —
 * and find each one's artwork and link. selectPicks makes the final five.
 */
export async function generatePicks(
  items: Item[],
  tasteNote: string,
  slots: Partial<Record<RecCategoryKey, number>>,
  avoid: { dismissed: Signal[]; saved: Signal[]; recent: Signal[]; older: Signal[] }
): Promise<DailyPick[]> {
  const library = items
    .map((i) => {
      const year = i.metadata?.year ? ` (${i.metadata.year})` : "";
      const why = i.description ? ` — "${i.description.slice(0, 500)}"` : "";
      return `- [${i.media_type}] ${i.title}${i.creator ? ` by ${i.creator}` : ""}${year}${why}`;
    })
    .join("\n");
  const asks = REC_CATEGORIES.filter((c) => slots[c.key]).map((c) => ASK[c.key](slots[c.key]!));
  const total = Object.values(slots).reduce((s, n) => s + (n ?? 0), 0);

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
      ? `Everything I've saved to check out later (don't suggest these; they show what I'm curious about right now):\n${list(avoid.saved)}\n\n`
      : "") +
    (avoid.recent.length ? `Already suggested to me this week (don't repeat):\n${list(avoid.recent)}\n\n` : "") +
    `Pick ${total} thing${total === 1 ? "" : "s"} for me today: ${asks.join("; ")}. ` +
    `Then add ${SPARES} spares, any of those kinds, in case one doesn't work out — ${total + SPARES} picks in all, ` +
    "today's first, spares last. " +
    "Read my favorites and saves as a whole — what they have in common, not just the nearest single title. " +
    "Spread it out: no two picks by the same creator, and no creator already suggested to me this week. " +
    "For each: a one-line hook and a short reason that names specific things I've favorited.";

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
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA } },
    system:
      "You are the taste engine behind Favorite, where people keep the books, films, music and writing they love. " +
      "You study someone's favorites and choose what they should try next. Your picks are specific and a little " +
      "off the beaten path — never generic crowd-pleasers unless they truly fit. Never suggest anything already in " +
      "their favorites. Settle every pick before you write it down. Write like a friend with great taste: plain " +
      "words, no hype, no spoilers.",
    messages: [{ role: "user", content: prompt }],
  } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming;
  const response = await anthropic.beta.messages.create(params);
  if (response.stop_reason === "refusal") throw new Error("model declined");
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
  console.log("picks usage:", JSON.stringify(response.usage));
  const parsed = JSON.parse(text) as {
    picks: (Omit<DailyPick, "image_url" | "view_url" | "canonical_id"> & { url: string })[];
  };

  const picks = parsed.picks
    .map((p) => ({ ...p, title: cleanTitle(p.title) }))
    // a pick it gave up on halfway comes back without its hook or reason
    .filter((p) => slots[category(p.media_type)!] && p.title && p.hook.trim() && p.reason.trim())
    .slice(0, total + SPARES);

  // artwork + a link from the same sources the add-search uses, so cards look native
  const found = await Promise.all(
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
  // an essay with no page to open is most likely one the model made up — a spare stands in
  return found.filter((p) => p.media_type !== "article" || !!p.view_url);
}
