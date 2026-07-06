import type { SearchResult } from "@/lib/types";

// Upstream media search sources, shared by /api/search (user-typed queries)
// and /api/recommendations (artwork lookup for AI picks).

// Every upstream fetch gets a hard timeout: iTunes/Deezer are known to stall
// (not just error), and the callers' `.catch(() => [])` only catches
// rejections — an abort rejects, so a hung source fails soft instead of
// holding the whole serverless request open to the platform limit.
const FETCH_TIMEOUT_MS = 8000;
function ftimeout(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), ...init });
}

// Upstream APIs fuzzy-match aggressively (iTunes returns an artist's popular
// tracks ahead of — or instead of — an exact-title album), so every search fn
// re-ranks its results by text match against the query before returning.
// Upstream order (a popularity signal) breaks ties via a small index penalty.
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // punctuation → space ("(Deluxe)" etc.)
    .replace(/\s+/g, " ")
    .trim();

export function rankResults(q: string, results: SearchResult[]): SearchResult[] {
  const nq = norm(q);
  if (!nq) return results;
  const tokens = nq.split(" ");
  return results
    .map((r, i) => {
      const title = norm(r.title ?? "");
      const creator = norm(r.creator ?? "");
      const combo = creator ? `${title} ${creator}` : title;
      let score: number;
      if (title === nq) score = 100;
      else if (creator === nq) score = 85; // artist/author lookup: keep their catalog together
      else if (title.startsWith(`${nq} `)) score = 80; // "yeezus (deluxe)"
      else if (combo === nq || `${creator} ${title}` === nq) score = 78; // "yeezus kanye" / "kanye yeezus"
      else if (title.includes(nq)) score = 65;
      else if (combo.includes(nq)) score = 55;
      // whole creator named in the query ("blonde frank ocean") beats results
      // that merely scatter the query's tokens across title + creator
      else if (creator && nq.includes(creator)) score = 50;
      else score = (tokens.filter((t) => combo.includes(t)).length / tokens.length) * 45;
      return { r, i, raw: score, score: score - i * 0.35 };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    // When the query genuinely matches something, drop zero-overlap filler
    // (Deezer pads sparse queries with unrelated hits). When nothing matches
    // (e.g. a typo the upstream corrected), keep the fuzzy results as-is.
    .filter((x, _, arr) => (arr[0].raw >= 55 ? x.raw > 0 : true))
    .map((x) => x.r);
}

// Interleave lists so an item's merged index tracks its upstream rank —
// concatenating would let one source's tail outrank another's top on ties.
function zip<T>(...lists: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(...lists.map((l) => l.length), 0);
  for (let i = 0; i < max; i++) {
    for (const l of lists) if (l[i] !== undefined) out.push(l[i]);
  }
  return out;
}

const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w500";
const IMG_SM = "https://image.tmdb.org/t/p/w154";

export async function tmdb(kind: "movie" | "tv", q: string): Promise<SearchResult[]> {
  const res = await ftimeout(`${TMDB}/search/${kind}?query=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${process.env.TMDB_READ_TOKEN}` },
    next: { revalidate: 3600 },
  });
  const data = await res.json();
  type TmdbHit = {
    id: number; title?: string; name?: string; poster_path?: string;
    release_date?: string; first_air_date?: string;
  };
  const hits = ((data.results ?? []) as TmdbHit[]).slice(0, 8).map((m) => ({
    media_type: kind,
    title: m.title ?? m.name ?? "",
    creator: "",
    image_url: m.poster_path ? `${IMG}${m.poster_path}` : null,
    thumb_url: m.poster_path ? `${IMG_SM}${m.poster_path}` : null,
    view_url: `https://www.themoviedb.org/${kind}/${m.id}`,
    year: (m.release_date ?? m.first_air_date ?? "").slice(0, 4),
    source_id: String(m.id),
    canonical_id: `tmdb:${kind}:${m.id}`,
  }));
  return rankResults(q, hits);
}

// iTunes ebook artwork lives on Apple's CDN and loads reliably; Open Library's
// cover host (archive.org) frequently fails, so it's the fallback source.
export async function books(q: string): Promise<SearchResult[]> {
  type EbookHit = {
    trackId: number; trackName: string; artistName: string;
    artworkUrl100?: string; trackViewUrl?: string; releaseDate?: string;
  };
  const [apple, ol] = await Promise.all([
    (async () => {
      try {
        const res = await ftimeout(
          `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=ebook&limit=6`,
          { next: { revalidate: 3600 } }
        );
        const data = await res.json();
        return ((data.results ?? []) as EbookHit[]).map((b) => ({
          media_type: "book" as const,
          title: b.trackName,
          creator: b.artistName,
          image_url: b.artworkUrl100 ? b.artworkUrl100.replace("100x100", "600x600") : null,
          thumb_url: b.artworkUrl100 ?? null,
          view_url: b.trackViewUrl ?? null,
          year: (b.releaseDate ?? "").slice(0, 4),
          source_id: String(b.trackId),
          canonical_id: `itunes:${b.trackId}`,
        }));
      } catch {
        return [] as SearchResult[];
      }
    })(),
    openLibrary(q).catch(() => [] as SearchResult[]),
  ]);
  const seen = new Set<string>();
  const merged = zip(apple, ol).filter((b) => {
    const k = b.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return rankResults(q, merged).slice(0, 10);
}

async function openLibrary(q: string): Promise<SearchResult[]> {
  const res = await ftimeout(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8`,
    { next: { revalidate: 3600 } }
  );
  const data = await res.json();
  type OlDoc = {
    key: string; title: string; author_name?: string[];
    cover_i?: number; first_publish_year?: number;
  };
  return ((data.docs ?? []) as OlDoc[]).map((b) => ({
    media_type: "book" as const,
    title: b.title,
    creator: b.author_name?.[0] ?? "",
    image_url: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-L.jpg` : null,
    thumb_url: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : null,
    view_url: `https://openlibrary.org${b.key}`,
    year: b.first_publish_year ? String(b.first_publish_year) : "",
    source_id: b.key,
    canonical_id: `ol:${b.key}`,
  }));
}

/**
 * Wikipedia lookup for essays/articles: reliable canonical URLs, thumbnails
 * only sometimes — callers pair it with books() for cover-art fallback.
 */
export async function wikipedia(q: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: q,
    gsrlimit: "3",
    prop: "pageimages|info",
    inprop: "url",
    piprop: "thumbnail",
    pithumbsize: "600",
    format: "json",
  });
  const res = await ftimeout(`https://en.wikipedia.org/w/api.php?${params}`, {
    next: { revalidate: 3600 },
  });
  const data = await res.json();
  type WikiPage = {
    index: number; title: string; fullurl: string;
    thumbnail?: { source: string };
  };
  const pages = Object.values((data.query?.pages ?? {}) as Record<string, WikiPage>);
  return pages
    .sort((a, b) => a.index - b.index)
    .map((p) => ({
      media_type: "article" as const,
      title: p.title,
      creator: "",
      image_url: p.thumbnail?.source ?? null,
      view_url: p.fullurl,
      year: "",
      source_id: p.fullurl,
      canonical_id: null, // URL-identified — the link itself is the identity
    }));
}

// Music merges two catalogs: iTunes ranks mainstream hits well, Deezer fills
// in artists/albums Apple lacks (indie, international, region-locked). Both
// are keyless. iTunes goes first so existing itunes: canonical IDs keep
// matching items users already saved.
export async function music(q: string): Promise<SearchResult[]> {
  const [apple, dz] = await Promise.all([
    itunes(q, "music").catch(() => [] as SearchResult[]),
    deezer(q).catch(() => [] as SearchResult[]),
  ]);
  const key = (r: SearchResult) =>
    `${r.title.toLowerCase().trim()}|${r.creator.toLowerCase().trim()}`;
  const seen = new Set<string>();
  const merged = zip(apple, dz).filter((r) => {
    if (seen.has(key(r))) return false;
    seen.add(key(r));
    return true;
  });
  return rankResults(q, merged).slice(0, 14);
}

async function deezer(q: string): Promise<SearchResult[]> {
  type DzAlbum = {
    id: number; title: string; link: string;
    cover_big?: string; cover_medium?: string;
    artist?: { name: string };
  };
  type DzTrack = {
    id: number; title: string; link: string;
    artist: { name: string };
    album?: { title: string; cover_big?: string; cover_medium?: string };
  };
  const [albums, tracks] = await Promise.all([
    (async () => {
      const res = await ftimeout(
        `https://api.deezer.com/search/album?q=${encodeURIComponent(q)}&limit=5`,
        { next: { revalidate: 3600 } }
      );
      const data = await res.json();
      return ((data.data ?? []) as DzAlbum[]).map((a) => ({
        media_type: "music" as const,
        title: a.title,
        creator: a.artist?.name ?? "",
        image_url: a.cover_big ?? null,
        thumb_url: a.cover_medium ?? null,
        view_url: a.link,
        year: "", // Deezer search payloads omit release dates
        source_id: String(a.id),
        canonical_id: `deezer:album:${a.id}`,
      }));
    })(),
    (async () => {
      const res = await ftimeout(
        `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`,
        { next: { revalidate: 3600 } }
      );
      const data = await res.json();
      return ((data.data ?? []) as DzTrack[]).map((t) => ({
        media_type: "music" as const,
        title: t.title,
        creator: t.artist.name,
        image_url: t.album?.cover_big ?? null,
        thumb_url: t.album?.cover_medium ?? null,
        view_url: t.link,
        year: "",
        source_id: String(t.id),
        canonical_id: `deezer:track:${t.id}`,
      }));
    })(),
  ]);
  return zip(albums, tracks);
}

// Podcasts: iTunes is the canonical directory but 403-throttles readily;
// Deezer's podcast index keeps results flowing when Apple is out. Dedupe is
// title-only because Deezer podcast objects carry no host/creator field.
export async function podcasts(q: string): Promise<SearchResult[]> {
  const [apple, dz] = await Promise.all([
    itunes(q, "podcast").catch(() => [] as SearchResult[]),
    deezerPodcasts(q).catch(() => [] as SearchResult[]),
  ]);
  const seen = new Set<string>();
  const merged = zip(apple, dz).filter((r) => {
    const k = norm(r.title);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return rankResults(q, merged).slice(0, 10);
}

async function deezerPodcasts(q: string): Promise<SearchResult[]> {
  type DzPodcast = {
    id: number; title: string; link: string;
    picture_big?: string; picture_medium?: string;
  };
  const res = await ftimeout(
    `https://api.deezer.com/search/podcast?q=${encodeURIComponent(q)}&limit=6`,
    { next: { revalidate: 3600 } }
  );
  const data = await res.json();
  return ((data.data ?? []) as DzPodcast[]).map((p) => ({
    media_type: "podcast" as const,
    title: p.title,
    creator: "",
    image_url: p.picture_big ?? null,
    thumb_url: p.picture_medium ?? null,
    view_url: p.link,
    year: "",
    source_id: String(p.id),
    canonical_id: `deezer:podcast:${p.id}`,
  }));
}

export async function itunes(q: string, type: "music" | "podcast"): Promise<SearchResult[]> {
  // songs/albums/shows carry artworkUrl100; podcast episodes only have 600/160/60
  type ItunesHit = {
    trackId?: number; collectionId?: number; trackName?: string; collectionName?: string;
    artistName?: string; artworkUrl100?: string; artworkUrl160?: string;
    artworkUrl600?: string; artworkUrl60?: string; trackViewUrl?: string;
    collectionViewUrl?: string; releaseDate?: string; wrapperType?: string;
  };
  const entities = type === "music" ? ["song", "album"] : ["podcastEpisode", "podcast"];
  const lists = await Promise.all(
    entities.map(async (entity) => {
      // Apple throttles per entity (403) — one failing must not sink the
      // other, and a single retry with a browser UA often clears a 403.
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=${entity}&limit=5`;
      try {
        let res = await ftimeout(url, { next: { revalidate: 3600 } });
        if (!res.ok) {
          res = await ftimeout(url, {
            cache: "no-store",
            headers: { "User-Agent": "Mozilla/5.0 (Macintosh) FavoritesApp/1.0" },
          });
        }
        if (!res.ok) return [] as ItunesHit[];
        const data = await res.json();
        return (data.results ?? []) as ItunesHit[];
      } catch {
        return [] as ItunesHit[];
      }
    })
  );
  const hits = zip(...lists).map((s) => ({
    media_type: type,
    title: s.trackName ?? s.collectionName ?? "",
    creator: s.artistName ?? "", // podcast episodes sometimes omit artistName
    image_url:
      s.artworkUrl600 ?? (s.artworkUrl100 ? s.artworkUrl100.replace("100x100", "600x600") : null),
    thumb_url: s.artworkUrl160 ?? s.artworkUrl100 ?? s.artworkUrl60 ?? null,
    view_url: s.trackViewUrl ?? s.collectionViewUrl ?? null,
    year: (s.releaseDate ?? "").slice(0, 4),
    source_id: String(s.trackId ?? s.collectionId ?? ""),
    canonical_id: s.trackId ?? s.collectionId ? `itunes:${s.trackId ?? s.collectionId}` : null,
  }));
  return rankResults(q, hits);
}
