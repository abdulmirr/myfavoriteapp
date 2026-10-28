import type { MediaType, Work } from "./types";

/** "type|normalized title" — the identity for works without a canonical id. */
export function titleKey(type: string, title: string): string {
  return `${type}|${title.trim().toLowerCase()}`;
}

/**
 * Every key a work can be recognized by: the feed's grouping key, its
 * canonical id, and the type+title key. The feed SQL groups untagged rows
 * under a sibling's canonical id, so matching on all three keeps the star
 * and bookmark honest whichever way a row was saved.
 */
export function workKeys(w: Pick<Work, "media_type" | "title" | "canonical_id" | "work_key">): string[] {
  const keys = new Set<string>();
  if (w.work_key) keys.add(w.work_key);
  if (w.canonical_id) keys.add(w.canonical_id);
  keys.add(titleKey(w.media_type, w.title));
  return [...keys];
}

/** The key the feed groups this work by (mirrors feed_works / list_items). */
export function primaryKey(w: Pick<Work, "media_type" | "title" | "canonical_id" | "work_key">): string {
  return w.work_key ?? w.canonical_id ?? titleKey(w.media_type, w.title);
}

/** The second meta line on cards — antislop's "Blog post · 8 mins" slot. */
export function typeLabel(w: Pick<Work, "media_type" | "canonical_id">): string {
  const id = w.canonical_id ?? "";
  switch (w.media_type) {
    case "music":
      return /:track:|song/i.test(id) ? "Song" : /:album:|album/i.test(id) ? "Album" : "Music";
    case "book":
      return "Book";
    case "movie":
      return "Film";
    case "tv":
      return "TV show";
    case "podcast":
      return "Podcast";
    case "video":
      return "Video";
    case "article":
      return "Link";
    case "photo":
      return "Photo";
    default:
      return "Other";
  }
}

/** Plural nouns for counts and filters. */
export const TYPE_PLURAL: Record<MediaType, string> = {
  book: "books",
  movie: "films",
  tv: "shows",
  music: "music",
  podcast: "podcasts",
  video: "videos",
  article: "links",
  photo: "photos",
  other: "other",
};

/** Feed page size (server render + /api/feed). */
export const FEED_PAGE = 30;

/** The type filters shared by the feed and the wall. */
export const TYPE_FILTERS: { key: string; label: string; types: MediaType[] }[] = [
  { key: "music", label: "Music", types: ["music"] },
  { key: "books", label: "Books", types: ["book"] },
  { key: "film", label: "Film & TV", types: ["movie", "tv"] },
  { key: "podcasts", label: "Podcasts", types: ["podcast"] },
  { key: "videos", label: "Videos", types: ["video"] },
  { key: "links", label: "Links", types: ["article", "other"] },
];

/** "Creator · Year" — the first meta line. */
export function metaLine(w: Pick<Work, "creator" | "year" | "metadata">): string {
  const year = w.year ?? (w.metadata?.year != null ? String(w.metadata.year) : "");
  return [w.creator?.trim(), year?.trim()].filter(Boolean).join(" · ");
}

/** "8 Oct 2026" — antislop's date stamp. */
export function dayStamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Where a work's item page lives: canonical works are shared across every
 * library (`/item/<canonical>`, segments encoded — canonical ids carry colons
 * and slashes); untagged works hang off one library row (`/item/fav/<id>`).
 */
export function itemHref(
  w: Pick<Work, "canonical_id"> & { item_id?: string | null; source_item_id?: string | null },
  from?: string
): string | null {
  const q = from ? `?from=${encodeURIComponent(from)}` : "";
  if (w.canonical_id) {
    return `/item/${w.canonical_id.split("/").map(encodeURIComponent).join("/")}${q}`;
  }
  const id = w.item_id ?? w.source_item_id;
  return id ? `/item/fav/${id}${q}` : null;
}

/** A short, URL-safe slug for list titles ("10/10 Albums" → "10-10-albums"). */
export function slugify(title: string, max = 60): string {
  const s = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s || "list";
}

/** "now", "12m", "5h", "3d", then "26 Oct" (and the year once it isn't this one). */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" as const } : {}),
  });
}

/** "an album", "a book", "a film" — what someone favorited, said in passing. */
export function aWork(w: Pick<Work, "media_type" | "canonical_id">): string {
  const t = typeLabel(w);
  return (
    {
      Album: "an album",
      Song: "a song",
      Music: "some music",
      Book: "a book",
      Film: "a film",
      "TV show": "a show",
      Podcast: "a podcast",
      Video: "a video",
      Link: "a link",
      Photo: "a photo",
    } as Record<string, string>
  )[t] ?? "something";
}

/** Did this happen in the last `days` days? */
export function isRecent(iso: string | null | undefined, days = 3): boolean {
  return !!iso && Date.now() - new Date(iso).getTime() < days * 864e5;
}

/** Is this work new on Favorite (first favorited in the last 3 days)? */
export function isNew(firstAt: string | null | undefined): boolean {
  if (!firstAt) return false;
  return Date.now() - new Date(firstAt).getTime() < 3 * 864e5;
}
