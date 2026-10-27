"use client";

import { useEffect, useRef, useState } from "react";

// Session-wide result cache, shared across every search box and surviving
// remounts (e.g. /add ↔ home). Keyed by `${scope}:${query}`; FIFO-capped.
const searchCache = new Map<string, unknown>();
const CACHE_MAX = 300;

/**
 * Shared type-ahead engine for every search box (home bar, /add palette,
 * onboarding picks): short debounce, session-wide result cache so backspacing
 * or retyping replays with zero delay (cache hits are read synchronously at
 * render — no state round trip), and stale-response protection (abort +
 * sequence) so results always track the latest keystroke. Previous results
 * stay on screen while the next query is in flight — the dropdown never
 * flashes empty mid-word.
 *
 * `results` is null when the query is under `minLength` or nothing has been
 * fetched yet — callers can tell "still searching" from "found nothing".
 *
 * The fetcher receives the trimmed query and an AbortSignal; throwing (e.g.
 * on a non-OK response, after surfacing its own error message) leaves the
 * failure uncached. It is read through a ref, so an inline closure is fine.
 */
export function useLiveSearch<T>(
  query: string,
  fetcher: (q: string, signal: AbortSignal) => Promise<T>,
  {
    minLength = 1,
    delay = 120,
    scope = "",
  }: { minLength?: number; delay?: number; scope?: string } = {}
): { results: T | null; searching: boolean } {
  // the last fetch that landed — shown while a newer query is still in flight
  const [fetched, setFetched] = useState<{ key: string; value: T } | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  const seq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const q = query.trim();
  const key = `${scope}:${q.toLowerCase()}`;
  const active = q.length >= minLength;

  // declared before the search effect so the ref is fresh when it runs
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (!active || searchCache.has(key)) {
      // a response still in flight for the old query is now stale
      seq.current++;
      abortRef.current?.abort();
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setPendingKey(key);
      try {
        const value = await fetcherRef.current(q, ctrl.signal);
        if (id !== seq.current) return;
        searchCache.set(key, value);
        if (searchCache.size > CACHE_MAX) {
          // Map iterates in insertion order — evict oldest first
          for (const k of searchCache.keys()) {
            if (searchCache.size <= CACHE_MAX) break;
            searchCache.delete(k);
          }
        }
        setFetched({ key, value });
      } catch {
        // aborted by a newer keystroke, network hiccup, or fetcher opt-out —
        // keep whatever is on screen rather than flashing the list away
      } finally {
        if (id === seq.current) setPendingKey(null);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [active, key, q, delay]);

  // cache wins and renders synchronously; otherwise the last landed result
  // stays visible while the current query fetches
  const cached = active ? (searchCache.get(key) as T | undefined) : undefined;
  const results = !active ? null : cached !== undefined ? cached : (fetched?.value ?? null);
  const searching = active && cached === undefined && pendingKey !== null;
  return { results, searching };
}
