import "server-only";
import { cacheLife } from "next/cache";
import type { MediaType } from "./types";

/**
 * A few lines on what a work is — never written by us, always fetched from
 * where it's catalogued and credited: TMDB's overview for films and shows,
 * Apple Books' or Open Library's description for books, the show's own feed
 * (or Deezer) for podcasts, and Wikipedia's summary for albums and for
 * anything the first source has nothing on. Cached for weeks per work —
 * misses too, so a work without one doesn't ask again on every view.
 */
export type About = { text: string; source: string; url: string | null };

type Asked = { canonical_id: string | null; media_type: MediaType; title: string; creator: string };

const UA = "Favorite/1.0 (https://myfavoriteapp.com)";
const get = (url: string, ms = 2500, init?: RequestInit) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(ms), headers: { "User-Agent": UA, ...init?.headers } });

/** text from catalog copy: tags out, entities decoded, whitespace tidied */
function plain(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\r/g, "")
    .trim();
}

// "#1 NEW YORK TIMES BESTSELLER • NOW A MAJOR MOTION PICTURE" — publisher shouting
const shouts = (p: string) => {
  const letters = p.replace(/[^A-Za-z]/g, "");
  return letters.length >= 8 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.6;
};

/**
 * The short version: shouting off the front, Open Library's footnotes off the
 * back, then whole sentences up to ~420 characters.
 */
function blurb(raw: string): string | null {
  const s = plain(raw)
    .replace(/\(\[source\]\[\d+\]\)/g, "")
    .replace(/^\s*\[\d+\]:\s*\S+\s*$/gm, "")
    .replace(/\n-{3,}[\s\S]*$/, "");
  const parts = s
    .split(/\n+|\s+•\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  while (parts.length > 1 && shouts(parts[0])) parts.shift();
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  if (text.length < 40 || shouts(text)) return null;
  if (text.length <= 420) return text;
  const cut = text.slice(0, 420);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 140 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

async function tmdb(kind: "movie" | "tv", id: string): Promise<About | null> {
  const res = await get(`https://api.themoviedb.org/3/${kind}/${id}`, 2500, {
    headers: { Authorization: `Bearer ${process.env.TMDB_READ_TOKEN}` },
  });
  if (!res.ok) return null;
  const text = blurb(((await res.json()) as { overview?: string }).overview ?? "");
  return text ? { text, source: "TMDB", url: `https://www.themoviedb.org/${kind}/${id}` } : null;
}

/** a podcast's own feed (some take 4s+): the channel's summary, from its first 256KB */
async function feed(url: string, link: string | null): Promise<About | null> {
  if (!/^https?:\/\//.test(url)) return null;
  const res = await get(url, 5000);
  if (!res.ok || !res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < 256 * 1024) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  void reader.cancel().catch(() => {});
  const channel = Buffer.concat(chunks).toString("utf8").split(/<item[\s>]/i)[0];
  const m =
    channel.match(/<itunes:summary>([\s\S]*?)<\/itunes:summary>/i) ??
    channel.match(/<description>([\s\S]*?)<\/description>/i);
  const text = m ? blurb(m[1]) : null;
  return text ? { text, source: "the show", url: link } : null;
}

async function apple(id: string): Promise<About | null> {
  const res = await get(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  type Hit = { kind?: string; description?: string; feedUrl?: string; trackViewUrl?: string; collectionViewUrl?: string };
  const r = ((await res.json()) as { results?: Hit[] }).results?.[0];
  if (!r) return null;
  if (r.description) {
    const text = blurb(r.description);
    return text ? { text, source: "Apple Books", url: r.trackViewUrl ?? null } : null;
  }
  if (r.kind === "podcast" && r.feedUrl) return feed(r.feedUrl, r.trackViewUrl ?? r.collectionViewUrl ?? null);
  return null; // albums and songs: Apple has no notes — Wikipedia next
}

async function openLibrary(key: string): Promise<About | null> {
  const res = await get(`https://openlibrary.org${key}.json`, 4000);
  if (!res.ok) return null;
  const d = (await res.json()) as { description?: string | { value?: string } };
  const text = blurb(typeof d.description === "string" ? d.description : (d.description?.value ?? ""));
  return text ? { text, source: "Open Library", url: `https://openlibrary.org${key}` } : null;
}

async function deezerPodcast(id: string): Promise<About | null> {
  const res = await get(`https://api.deezer.com/podcast/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const d = (await res.json()) as { description?: string; link?: string };
  const text = blurb(d.description ?? "");
  return text ? { text, source: "Deezer", url: d.link ?? null } : null;
}

// what Wikipedia calls each kind: in the search, and as proof the page is
// about the right thing (Blonde the album, not the hair colour)
const KIND: Partial<Record<MediaType, { word: string; proof: RegExp }>> = {
  music: { word: "album", proof: /\b(album|ep|mixtape|record|song|single|soundtrack)\b/ },
  book: { word: "book", proof: /\b(book|novel|memoir|novella|essay|collection|non-fiction|nonfiction|work)\b/ },
  movie: { word: "film", proof: /\bfilm\b/ },
  tv: { word: "television series", proof: /\b(series|show|sitcom|miniseries|television|drama)\b/ },
  podcast: { word: "podcast", proof: /\bpodcast\b/ },
};
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// the page has to be the work itself: "In Rainbows" or "In Rainbows (album)",
// "Sapiens: A Brief History of Humankind" — never "In Rainbows – From the Basement"
function samePage(page: string, title: string): boolean {
  const base = page.replace(/\s*\([^)]*\)\s*$/, "");
  return norm(base) === norm(title) || norm(base.split(":")[0]) === norm(title) || norm(base) === norm(title.split(":")[0]);
}

async function wikipedia(w: Asked): Promise<About | null> {
  const kind = KIND[w.media_type];
  if (!kind) return null;
  const title = norm(w.title);
  const creator = norm(w.creator ?? "")
    .split(" ")
    .filter((p) => p.length > 2);
  const q = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `${w.title} ${w.creator ?? ""} ${kind.word}`.trim(),
    srlimit: "5",
    format: "json",
  });
  const res = await get(`https://en.wikipedia.org/w/api.php?${q}`);
  if (!res.ok) return null;
  const hits = (((await res.json()) as { query?: { search?: { title: string }[] } }).query?.search ?? [])
    .filter((h) => samePage(h.title, w.title))
    .slice(0, 2);
  for (const h of hits) {
    const s = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(h.title.replace(/ /g, "_"))}`);
    if (!s.ok) continue;
    const d = (await s.json()) as { type?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
    if (d.type !== "standard" || !d.extract) continue;
    const e = norm(d.extract);
    // the right page names the work, its kind, and (when we know it) its maker
    if (!e.includes(title) || !kind.proof.test(e) || (creator.length > 0 && !creator.some((p) => e.includes(p)))) continue;
    const text = blurb(d.extract);
    if (text) return { text, source: "Wikipedia", url: d.content_urls?.desktop?.page ?? null };
  }
  return null;
}

export async function getAbout(w: Asked): Promise<About | null> {
  "use cache";
  cacheLife("weeks");
  const id = w.canonical_id ?? "";
  try {
    const found = id.startsWith("tmdb:movie:")
      ? await tmdb("movie", id.slice("tmdb:movie:".length))
      : id.startsWith("tmdb:tv:")
        ? await tmdb("tv", id.slice("tmdb:tv:".length))
        : id.startsWith("itunes:")
          ? await apple(id.slice("itunes:".length))
          : id.startsWith("ol:/works/")
            ? await openLibrary(id.slice("ol:".length))
            : id.startsWith("deezer:podcast:")
              ? await deezerPodcast(id.slice("deezer:podcast:".length))
              : null;
    return found ?? (await wikipedia(w));
  } catch {
    return null; // a slow or broken source just means no blurb
  }
}
