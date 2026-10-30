import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { MediaType } from "./types";
import { urlWorkKey } from "./url-key";

/**
 * antislop's archive (antislop.xyz/archive), with its curator's blessing:
 * every essay, talk, video and tweet it has published so far, read live from
 * its public catalog and cached for an hour — a new pick shows up here the day
 * antislop features it. antislop publishes a pick two ways (a date of its own,
 * or a day in its feed); both count. Picks still in its backlog stay out, so
 * Favorite never runs ahead of the curator.
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
  minutes: number | null;
  /** when it was written, YYYY-MM-DD */
  published: string | null;
  /** featured in the last three days (antislop's "New") */
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
      body: string | null;
      metadata: { twitter?: { handle?: string; avatar_url?: string } } | null;
    };
    const [rows, feed] = await Promise.all([
      get<Row[]>(
        "antislop_resources?select=id,title,creator,date_published,medium,image_url,url,consumption_time,date_featured,body,metadata&limit=5000"
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
    const out: Resource[] = [];
    const when = new Map<string, string>();
    for (const r of rows) {
      const own = r.date_featured && r.date_featured <= today ? r.date_featured : "";
      const on = [own, fed.get(r.id) ?? ""].sort().at(-1);
      if (!on) continue; // still in antislop's backlog
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
      when.set(r.id, on);
      out.push({
        id: r.id,
        title,
        creator: r.creator?.trim() ?? "",
        url: url.href,
        image_url: r.image_url ?? (video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : null),
        medium: r.medium ?? "Link",
        kind: KIND[r.medium ?? ""] ?? "essays",
        minutes: r.consumption_time ?? null,
        published: r.date_published ?? null,
        fresh: now - Date.parse(on) < 3 * 864e5,
        media_type: video ? "video" : isTweet ? "other" : "article",
        canonical_id: await urlWorkKey(url.href),
        tweet: isTweet
          ? { text: text || title, handle: r.metadata?.twitter?.handle ?? null, avatar: r.metadata?.twitter?.avatar_url ?? null }
          : null,
      });
    }
    // newest featured first
    out.sort((a, b) => {
      const x = when.get(a.id)!;
      const y = when.get(b.id)!;
      return x === y ? a.title.localeCompare(b.title) : x < y ? 1 : -1;
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
