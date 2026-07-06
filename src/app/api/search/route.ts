import { NextRequest, NextResponse } from "next/server";
import type { SearchResult } from "@/lib/types";
import { tmdb, books, music, podcasts, rankResults } from "@/lib/search-sources";
import { requireUser, withinLimit } from "@/lib/api-guard";

/** Global search (home search bar): every source at once, a few hits each. */
async function searchAll(q: string): Promise<SearchResult[]> {
  const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [movies, tv, bookHits, musicHits, podcastHits] = await Promise.all([
    safe(tmdb("movie", q)),
    safe(tmdb("tv", q)),
    safe(books(q)),
    safe(music(q)),
    safe(podcasts(q)),
  ]);
  return [
    ...musicHits.slice(0, 3),
    ...bookHits.slice(0, 3),
    ...movies.slice(0, 2),
    ...tv.slice(0, 2),
    ...podcastHits.slice(0, 2),
  ];
}

// Route-handler fetches skip Next's data cache (they run after request-time
// auth), so every query hits upstreams live. This module-level micro-cache
// makes repeat queries on a warm instance instant — the type-ahead UX turns
// prefix typing and backtracking into lots of repeats across users.
const TTL_MS = 5 * 60_000;
const CACHE_MAX = 500;
const memo = new Map<string, { at: number; results: SearchResult[] }>();

async function searchType(type: string, q: string): Promise<SearchResult[]> {
  const key = `${type}:${q.toLowerCase()}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.results;

  let results: SearchResult[] = [];
  if (type === "all") results = await searchAll(q);
  else if (type === "movie" || type === "tv") {
    // the add popup's combined movie/tv type: search both, interleave
    const [movies, tv] = await Promise.all([
      tmdb("movie", q).catch(() => [] as SearchResult[]),
      tmdb("tv", q).catch(() => [] as SearchResult[]),
    ]);
    const interleaved = Array.from({ length: Math.max(movies.length, tv.length) })
      .flatMap((_, i) => [movies[i], tv[i]])
      .filter(Boolean);
    results = rankResults(q, interleaved).slice(0, 10);
  }
  else if (type === "book") results = await books(q);
  else if (type === "music") results = await music(q);
  else if (type === "podcast") results = await podcasts(q);

  // don't memoize empty lists — they're usually an upstream hiccup, and
  // caching one would pin "no matches" on a real title for five minutes
  if (results.length > 0) {
    memo.set(key, { at: Date.now(), results });
    if (memo.size > CACHE_MAX) {
      for (const k of memo.keys()) {
        if (memo.size <= CACHE_MAX) break;
        memo.delete(k); // Map iterates in insertion order — oldest first
      }
    }
  }
  return results;
}

export async function GET(req: NextRequest) {
  // signed-in + budgeted: this route relays to TMDB/iTunes/OL on our quota
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const type = req.nextUrl.searchParams.get("type");
  if (!q || !type) return NextResponse.json({ results: [] });

  try {
    // budget check and upstream search race in parallel — this is type-ahead,
    // every keystroke pays this route's latency. The rare over-limit caller
    // wastes one upstream round trip; results are discarded.
    const [allowed, results] = await Promise.all([
      withinLimit(auth.db, "search", 500),
      searchType(type, q),
    ]);
    if (!allowed) {
      return NextResponse.json({ error: "daily limit reached" }, { status: 429 });
    }
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [], error: "search failed" }, { status: 502 });
  }
}
