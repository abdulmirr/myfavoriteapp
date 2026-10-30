import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { MediaType } from "./types";
import { urlWorkKey } from "./url-key";

/**
 * antislop's archive (antislop.xyz/archive), with its curator's blessing:
 * the essays, talks and videos it has featured so far, read live from its
 * public catalog and cached for an hour — a new pick shows up here the day
 * antislop features it. Tweets stay out (Favorite has no place for them).
 */
export type ResourceKind = "essays" | "talks" | "videos";

export interface Resource {
  id: string;
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
}

const KIND: Record<string, ResourceKind> = { Speech: "talks", Lecture: "talks", Video: "videos" };

function youtube(url: URL): string | null {
  if (url.hostname.endsWith("youtu.be")) return url.pathname.slice(1) || null;
  if (/(^|\.)youtube\.com$/.test(url.hostname)) return url.searchParams.get("v");
  return null;
}

export async function getResources(): Promise<Resource[] | null> {
  "use cache";
  cacheTag("resources");
  const base = process.env.ANTISLOP_SUPABASE_URL;
  const key = process.env.ANTISLOP_SUPABASE_ANON_KEY;
  const now = Date.now();
  const q = new URLSearchParams({
    select: "id,title,creator,date_published,medium,image_url,url,consumption_time,date_featured",
    date_featured: `lte.${new Date(now).toISOString().slice(0, 10)}`,
    medium: "neq.Tweet",
    order: "date_featured.desc,id.asc",
    limit: "1000",
  });
  try {
    if (!base || !key) throw new Error("antislop isn't configured");
    const res = await fetch(`${base}/rest/v1/antislop_resources?${q}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`antislop ${res.status}`);
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
    };
    const rows = (await res.json()) as Row[];
    const out: Resource[] = [];
    for (const r of rows) {
      let url: URL;
      try {
        url = new URL(r.url ?? "");
      } catch {
        continue;
      }
      if (!r.title) continue;
      const video = youtube(url);
      out.push({
        id: r.id,
        title: r.title.trim(),
        creator: r.creator?.trim() ?? "",
        url: url.href,
        image_url: r.image_url ?? (video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : null),
        medium: r.medium ?? "Link",
        kind: KIND[r.medium ?? ""] ?? "essays",
        minutes: r.consumption_time ?? null,
        published: r.date_published ?? null,
        fresh: !!r.date_featured && now - Date.parse(r.date_featured) < 3 * 864e5,
        media_type: video ? "video" : "article",
        canonical_id: await urlWorkKey(url.href),
      });
    }
    cacheLife("hours");
    return out;
  } catch (e) {
    // try again in a minute rather than an hour; the page says it's away
    console.error("resources:", e instanceof Error ? e.message : e);
    cacheLife("minutes");
    return null;
  }
}
