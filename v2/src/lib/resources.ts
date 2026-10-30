import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { PLACED } from "./resource-placed";
import { TOPICS, type Topic } from "./resource-topics";
import type { MediaType } from "./types";
import { urlWorkKey } from "./url-key";

/**
 * antislop's archive (antislop.xyz/archive), with its curator's blessing:
 * every essay, talk, video and tweet in its catalog, read live and cached for
 * an hour — what it has featured first, newest first (it features a pick two
 * ways: a date of its own, or a day in its feed), then what's still waiting in
 * its backlog. Each is filed under what it's about: the curator's own tags,
 * ours (lib/resource-placed.ts) where he hasn't set any, a guess for a pick
 * that's new to both.
 */
export type ResourceKind = "essays" | "talks" | "videos" | "tweets";

export interface Resource {
  id: string;
  /** a tweet's is its text */
  title: string;
  creator: string;
  url: string;
  image_url: string | null;
  /** antislop's own word for it: "Blog post", "Essay", "Lecture"… */
  medium: string;
  kind: ResourceKind;
  /** what it's about — one topic or a few */
  topics: Topic[];
  minutes: number | null;
  /** when it was written, YYYY-MM-DD */
  published: string | null;
  /** featured in the last three days (antislop's "New"); never for the backlog */
  fresh: boolean;
  media_type: MediaType;
  /** the same identity a saved copy of the link gets (url_work_key) */
  canonical_id: string | null;
  /** tweets: who said it — shown as a quote, not a picture */
  tweet: { text: string; handle: string | null; avatar: string | null } | null;
}

const KIND: Record<string, ResourceKind> = {
  Speech: "talks",
  Lecture: "talks",
  Podcast: "talks",
  Video: "videos",
  Tweet: "tweets",
};

function youtube(url: URL): string | null {
  if (url.hostname.endsWith("youtu.be")) return url.pathname.slice(1) || null;
  if (/(^|\.)youtube\.com$/.test(url.hostname)) return url.searchParams.get("v");
  return null;
}

/** words that say what a pick is about, most telling first */
const WORDS: [Topic, RegExp][] = [
  ["Writing", /\b(writ(e|es|ing|er|ers)|storytelling|stories)\b/gi],
  ["Learning", /\b(learn\w*|stud(y|ying)|memor\w*|remember|reading|books?|skills?|practice)\b/gi],
  ["Productivity", /\b(productiv\w*|procrastinat\w*|focus\w*|distract\w*|habits?|routines?)\b/gi],
  ["Thinking", /\b(think\w*|decisions?|decide|mental models?|bias(es)?|rational\w*|problem[- ]solving|wisdom|wise)\b/gi],
  ["Creativity", /\b(creativ\w*|art|artists?|taste|ideas?|design\w*|music|craft)\b/gi],
  ["Career", /\b(careers?|jobs?|wealth|rich|money|startups?|founders?|business\w*|compan(y|ies)|leverage)\b/gi],
  ["Greatness", /\b(great\w*|excellen\w*|genius|ambiti\w*|success\w*|exceptional|master(y|ing)?)\b/gi],
  ["Worldview", /\b(life|lives|meaning\w*|happ(y|iness)|purpose|death|die|philosoph\w*|society|freedom|optimis\w*)\b/gi],
  ["Mindset", /\b(mindset|agency|courage\w*|fear\w*|fail\w*|confiden\w*|disciplin\w*|self|belie(f|fs|ve))\b/gi],
];

/**
 * A pick nobody has filed yet: what its words are mostly about, else where
 * its author's other picks mostly live — else only under All. (Tried on the
 * picks we placed by hand, it agrees on about half of those it guesses.)
 */
function guess(text: string, kin: Topic[][] = []): Topic[] {
  const best = (score: number[]) => {
    const top = Math.max(...score);
    return top > 0 ? [WORDS[score.indexOf(top)][0]] : null;
  };
  return (
    best(WORDS.map(([, re]) => text.match(re)?.length ?? 0)) ??
    best(WORDS.map(([t]) => kin.filter((k) => k.includes(t)).length)) ??
    []
  );
}

const later = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);

export async function getResources(): Promise<Resource[] | null> {
  "use cache";
  cacheTag("resources");
  const base = process.env.ANTISLOP_SUPABASE_URL;
  const key = process.env.ANTISLOP_SUPABASE_ANON_KEY;
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      headers: { apikey: key!, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`antislop ${res.status}`);
    return (await res.json()) as T;
  };
  try {
    if (!base || !key) throw new Error("antislop isn't configured");
    type Row = {
      id: string;
      title: string | null;
      creator: string | null;
      date_published: string | null;
      medium: string | null;
      image_url: string | null;
      url: string | null;
      consumption_time: number | null;
      date_featured: string | null;
      created_at: string | null;
      body: string | null;
      description: string | null;
      topics: string[] | null;
      metadata: { twitter?: { handle?: string; avatar_url?: string } } | null;
    };
    const [rows, feed] = await Promise.all([
      get<Row[]>(
        "antislop_resources?select=id,title,creator,date_published,medium,image_url,url,consumption_time,date_featured,created_at,body,description,topics,metadata&limit=5000"
      ),
      get<{ archive_resource_id: string; date_featured: string }[]>(
        `feed_items?select=archive_resource_id,date_featured&archive_resource_id=not.is.null&date_featured=lte.${today}&limit=5000`
      ),
    ]);
    // the day each pick was (last) featured, whichever way
    const fed = new Map<string, string>();
    for (const f of feed) {
      if ((fed.get(f.archive_resource_id) ?? "") < f.date_featured) fed.set(f.archive_resource_id, f.date_featured);
    }
    // the curator's topics and ours; and, by author, where their picks live
    const filed = (r: Row) => TOPICS.filter((t) => r.topics?.includes(t) || PLACED[r.id]?.includes(t));
    const kin = new Map<string, Topic[][]>();
    for (const r of rows) {
      const by = r.creator?.trim().toLowerCase();
      const t = filed(r);
      if (by && t.length) kin.set(by, [...(kin.get(by) ?? []), t]);
    }
    const picks: { r: Resource; on: string; added: string }[] = [];
    for (const r of rows) {
      const own = r.date_featured && r.date_featured <= today ? r.date_featured : "";
      const on = [own, fed.get(r.id) ?? ""].sort().at(-1) ?? ""; // "" = still in the backlog
      let url: URL;
      try {
        url = new URL(r.url ?? "");
      } catch {
        continue;
      }
      const isTweet = r.medium === "Tweet";
      const text = (r.body ?? "").trim();
      const title = (r.title ?? "").trim() || (isTweet ? clip(text, 140) : "");
      if (!title) continue;
      const video = youtube(url);
      const topics = filed(r);
      picks.push({
        on,
        added: r.created_at ?? "",
        r: {
          id: r.id,
          title,
          creator: r.creator?.trim() ?? "",
          url: url.href,
          image_url: r.image_url ?? (video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : null),
          medium: r.medium ?? "Link",
          kind: KIND[r.medium ?? ""] ?? "essays",
          topics: topics.length
            ? topics
            : guess(`${title} ${r.description ?? ""} ${isTweet ? text : ""}`, kin.get(r.creator?.trim().toLowerCase() ?? "")),
          minutes: r.consumption_time ?? null,
          published: r.date_published ?? null,
          fresh: !!on && now - Date.parse(on) < 3 * 864e5,
          media_type: video ? "video" : isTweet ? "other" : "article",
          canonical_id: await urlWorkKey(url.href),
          tweet: isTweet
            ? { text: text || title, handle: r.metadata?.twitter?.handle ?? null, avatar: r.metadata?.twitter?.avatar_url ?? null }
            : null,
        },
      });
    }
    // featured newest first, then the backlog, newest added first — and a
    // pick catalogued twice (same title, same author) only once
    picks.sort((a, b) => later(a.on, b.on) || later(a.added, b.added) || a.r.title.localeCompare(b.r.title));
    const seen = new Set<string>();
    const out = picks
      .map((p) => p.r)
      .filter((r) => {
        const k = `${r.title}|${r.creator}`.toLowerCase();
        return !seen.has(k) && !!seen.add(k);
      });
    cacheLife("hours");
    return out;
  } catch (e) {
    // try again in a minute rather than an hour; the page says it's away
    console.error("resources:", e instanceof Error ? e.message : e);
    cacheLife("minutes");
    return null;
  }
}
