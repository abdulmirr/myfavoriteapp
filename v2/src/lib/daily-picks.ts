import { REC_CATEGORIES, REC_MIN_PER_CATEGORY, type DailyPick, type Item, type MediaType, type RecCategoryKey, type RecCounts } from "./types";
import { generatePicks, pickSlots, selectPicks, type Signal } from "./picks";

/**
 * A member's day, wherever it's asked for: Home (/api/picks, signed in as
 * them) and the morning email (/api/newsletter/send, on the server's key).
 * Both choose from the same taste and hide the same picks, so the email
 * carries exactly the five Home shows. Each caller does its own reading,
 * claiming and storing; this file only decides.
 */

/** "The Godfather", "Godfather (1972)", "godfather" — one comparable spelling */
function normTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
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

export type OwnedRow = { media_type: string; title: string; canonical_id: string | null };

/**
 * Everything already theirs — every favorite and every save — as keys a pick
 * is checked against. A pick for something you own defeats the point.
 */
export function ownedSet(rows: OwnedRow[]): Set<string> {
  const keys = new Set<string>();
  for (const r of rows) {
    keys.add(ownKey(r.media_type, r.title));
    if (r.canonical_id) keys.add(r.canonical_id);
  }
  return keys;
}

export const owned = (p: Pick<DailyPick, "media_type" | "title" | "canonical_id">, keys: Set<string>) =>
  (!!p.canonical_id && keys.has(p.canonical_id)) || keys.has(ownKey(p.media_type, p.title));

/** taste gate: under REC_MIN_PER_CATEGORY favorites in a category the model is guessing */
export function tasteGate(types: MediaType[]): { counts: RecCounts; eligible: RecCategoryKey[] } {
  const counts = Object.fromEntries(
    REC_CATEGORIES.map((c) => [c.key, types.filter((t) => c.types.includes(t)).length])
  ) as RecCounts;
  return { counts, eligible: REC_CATEGORIES.filter((c) => counts[c.key] >= REC_MIN_PER_CATEGORY).map((c) => c.key) };
}

export type Taste = {
  /** their favorites, newest first */
  items: Item[];
  tasteNote: string;
  dismissed: Signal[];
  saved: Signal[];
  /** the week's earlier sets, flattened */
  recent: DailyPick[];
  owned: Set<string>;
};

/** Choose one day's set: the model's candidates, minus what they own, cut to the day's slots. */
export async function choosePicks(
  t: Taste,
  profileId: string,
  day: string,
  gate: { counts: RecCounts; eligible: RecCategoryKey[] }
): Promise<DailyPick[]> {
  const slots = pickSlots(gate.eligible, gate.counts, `${profileId}:${day}`);
  // the newest 150 in full (notes and all); the rest as a do-not-suggest list
  const generated = await generatePicks(t.items.slice(0, 150), t.tasteNote, slots, {
    dismissed: t.dismissed,
    saved: t.saved,
    recent: t.recent,
    older: t.items.slice(150),
  });
  if (!generated.length) throw new Error("empty");
  // never what they already have, whatever the model says (an all-owned set is
  // kept so the claim completes; visiblePicks hides it)
  const fresh = generated.filter((p) => !owned(p, t.owned));
  return selectPicks(fresh.length ? fresh : generated, slots, t.recent);
}

/** how long a pass hides a pick from the day's set */
export const PASS_WINDOW_MS = 2 * 864e5;

/**
 * What's left of a stored set to show: a pick they passed on lately, or have
 * favorited or saved since it was chosen (on any device), is gone.
 */
export function visiblePicks(picks: DailyPick[], passed: Pick<Signal, "media_type" | "title">[], keys: Set<string>): DailyPick[] {
  const gone = new Set(passed.map((d) => `${d.media_type}|${d.title.toLowerCase()}`));
  return picks.filter((p) => !gone.has(`${p.media_type}|${p.title.toLowerCase()}`) && !owned(p, keys));
}
