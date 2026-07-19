"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Item, Profile, SearchResult } from "@/lib/types";
import { supabase, authHeaders } from "@/lib/supabase";
import { escapeLike } from "@/lib/social";
import { useLiveSearch } from "@/lib/use-live-search";
import { thumbCover } from "@/lib/img";

/** items joined with who saved them, for feeds and search */
export type FeedItem = Item & { profile: Profile };

/** short type tags for the Discover group */
export const TYPE_TAG: Record<string, string> = {
  book: "Book", movie: "Film", tv: "TV", music: "Music", podcast: "Pod", article: "Read",
};

/**
 * A Discover search result shaped as a library Item so DetailOverlay can show
 * it full-screen. No id/owner/date — it isn't in anyone's library (yet).
 */
export function resultToItem(r: SearchResult): Item {
  return {
    id: `discover-${r.media_type}-${r.source_id}`,
    profile_id: "",
    media_type: r.media_type,
    title: r.title,
    creator: r.creator,
    description: "",
    image_url: r.image_url,
    view_url: r.view_url,
    metadata: {
      ...(r.year ? { year: r.year } : {}),
      ...(r.source_id ? { source_id: r.source_id } : {}),
    },
    canonical_id: r.canonical_id,
    pinned_order: null,
    sort_order: 0,
    pos_x: null,
    pos_y: null,
    pos_rot: null,
    created_at: "",
  };
}

type SearchHits = { people: Profile[]; media: FeedItem[]; discover: SearchResult[] };

/**
 * People, saved items and external catalogs in one dropdown — the app-wide
 * search. Two skins: the compact icon that expands on focus (default), and
 * `wide` — a full-width bar that's always open, for Explore, where search is
 * the point of the page.
 */
export default function SearchBar({
  onPick,
  wide = false,
  autoFocus = false,
}: {
  onPick: (r: SearchResult, rect: DOMRect) => void;
  wide?: boolean;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // people + saved items + external catalogs in one debounced shot; the hook
  // caches per session and drops stale responses, so results track keystrokes
  const { results, searching } = useLiveSearch<SearchHits>(
    q,
    async (query, signal) => {
      const db = supabase();
      // commas and parens are .or() tree syntax (a title like "Her (2013)"
      // would 400 the request); escapeLike then neutralizes %/_ wildcards
      const safe = escapeLike(query.replace(/[(),]/g, " "));
      const [{ data: profiles }, { data: items }, external] = await Promise.all([
        db
          .from("profiles")
          .select("id, user_id, username, display_name, bio, avatar_url, socials")
          .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
          .limit(3)
          .abortSignal(signal),
        db
          .from("items")
          // owner profile rides along as an embed — no second round trip
          .select("*, profile:profiles!profile_id(id, user_id, username, display_name, bio, avatar_url, socials)")
          .or(`title.ilike.%${safe}%,creator.ilike.%${safe}%`)
          .order("created_at", { ascending: false })
          .limit(4)
          .abortSignal(signal),
        authHeaders()
          .then((h) => fetch(`/api/search?q=${encodeURIComponent(query)}&type=all`, { headers: h, signal }))
          .then((r) => (r.ok ? r.json() : { results: [] }))
          .then((j) => (j.results ?? []) as SearchResult[])
          .catch(() => [] as SearchResult[]),
      ]);
      return {
        people: (profiles ?? []) as Profile[],
        media: ((items ?? []) as FeedItem[]).filter((i) => i.profile),
        discover: external,
      };
    },
    { minLength: 2, scope: "home" }
  );
  const people = results?.people ?? [];
  const media = results?.media ?? [];
  const discover = results?.discover ?? [];

  const hasResults = people.length > 0 || media.length > 0 || discover.length > 0;

  // icon-only until pressed: the underline and input reveal on focus and
  // collapse back once the field is blurred and empty. the wide bar never collapses.
  const expanded = wide || focused || q.trim().length > 0;

  return (
    <div className={`relative ${wide ? "w-full" : "max-w-56"}`}>
      {/* wide: a soft pill card — the page-opening instrument. compact: the
          quiet underline that expands on focus. */}
      <div
        className={
          wide
            ? `flex items-center gap-3 border bg-white px-4 py-3 shadow-[0_1px_2px_rgb(28_25_23/0.04),0_8px_24px_-12px_rgb(28_25_23/0.08)] transition-colors duration-200 ${
                focused ? "border-zinc-300" : "border-zinc-900/[0.08]"
              }`
            : `flex items-center gap-1.5 border-b border-t border-t-transparent pb-1 pt-1 transition-colors duration-200 ${
                focused ? "border-zinc-900" : expanded ? "border-zinc-400" : "border-transparent"
              }`
        }
      >
        <button
          aria-label="Search"
          onClick={() => inputRef.current?.focus()}
          className={`shrink-0 transition-colors ${
            expanded ? "text-zinc-900" : "cursor-pointer text-zinc-400 hover:text-zinc-900"
          }`}
        >
          <svg className={wide ? "h-4 w-4" : "h-3 w-3"} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="5" cy="5" r="4" />
            <path d="M8 8l3 3" />
          </svg>
        </button>
        <input
          ref={inputRef}
          value={q}
          autoFocus={autoFocus}
          placeholder={wide ? "Search people, favorites, and everything else…" : "Search"}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            setFocused(true);
            setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className={`bg-transparent text-zinc-900 outline-none transition-all duration-200 placeholder:text-zinc-400 ${
            wide ? "text-sm leading-5" : "text-xs leading-4"
          } ${expanded ? "w-full opacity-100" : "pointer-events-none w-0 opacity-0"}`}
        />
      </div>

      {open && q.trim().length >= 2 && (
        <div
          className={`absolute left-0 top-full z-40 mt-2 max-h-[70vh] overflow-y-auto border border-zinc-900/[0.06] bg-white/95 shadow-2xl backdrop-blur-xl save-appear ${
            wide ? "w-full" : "w-72"
          }`}
        >
          {results === null || (searching && !hasResults) ? (
            // first response for this query still in flight — "No matches."
            // here would flash a false negative on every keystroke
            <p className="px-4 py-3 text-xs text-zinc-400 [animation:smart-search-wave_1.6s_ease-in-out_infinite]">
              Searching…
            </p>
          ) : !hasResults ? (
            <p className="px-4 py-3 text-xs text-zinc-400">No matches.</p>
          ) : (
            <>
              {people.length > 0 && (
                <div className="py-1.5">
                  <p className="px-4 pb-1 pt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                    People
                  </p>
                  {people.map((p) => (
                    <Link
                      key={p.id}
                      href={`/${p.username}`}
                      className="flex items-center gap-2.5 px-4 py-1.5 transition-colors hover:bg-zinc-50"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden bg-zinc-100">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-semibold text-zinc-400">
                            {(p.display_name || p.username).slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <span className="truncate text-xs text-zinc-900">{p.display_name}</span>
                      <span className="truncate text-[11px] text-zinc-400">@{p.username}</span>
                    </Link>
                  ))}
                </div>
              )}
              {media.length > 0 && (
                <div className="border-t border-zinc-100 py-1.5">
                  <p className="px-4 pb-1 pt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                    Saved by people
                  </p>
                  {media.map((m) => (
                    <Link
                      key={m.id}
                      href={`/${m.profile.username}`}
                      className="flex items-center gap-2.5 px-4 py-1.5 transition-colors hover:bg-zinc-50"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden bg-zinc-100">
                        {m.image_url ? (
                          <img
                            src={thumbCover(m.image_url, 100)}
                            alt=""
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] font-semibold text-zinc-300">
                            {m.title.slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-900">
                        {m.title}
                        {m.creator && <span className="text-zinc-400"> — {m.creator}</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-zinc-400">@{m.profile.username}</span>
                    </Link>
                  ))}
                </div>
              )}
              {discover.length > 0 && (
                <div className="border-t border-zinc-100 py-1.5">
                  <p className="px-4 pb-1 pt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                    Discover
                  </p>
                  {discover.map((r) => (
                    <button
                      key={`${r.media_type}-${r.source_id}`}
                      // mousedown fires before the input's blur closes the dropdown
                      onMouseDown={(e) => {
                        e.preventDefault();
                        // the row's thumbnail is the morph origin for the detail view
                        const thumb = e.currentTarget.querySelector("div");
                        onPick(r, (thumb ?? e.currentTarget).getBoundingClientRect());
                        setOpen(false);
                      }}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-1.5 text-left transition-colors hover:bg-zinc-50"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden bg-zinc-100">
                        {r.image_url ? (
                          <img src={r.thumb_url ?? r.image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-semibold text-zinc-300">
                            {r.title.slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-900">
                        {r.title}
                        {r.creator && <span className="text-zinc-400"> — {r.creator}</span>}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                        {TYPE_TAG[r.media_type] ?? r.media_type}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
