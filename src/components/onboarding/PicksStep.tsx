"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { MediaType, Profile, SearchResult } from "@/lib/types";
import { supabase, authHeaders } from "@/lib/supabase";
import { useLiveSearch } from "@/lib/use-live-search";
import { STARTER_SECTIONS, type StarterPick } from "@/lib/starter-picks";
import { EASE_SNAP, FramedCover, RevealWords, Rise } from "./bits";

/**
 * Beat 2 — first favorites. A curated wall of well-known covers plus a search
 * for anything else. Every favorite requires written thoughts before it lands:
 * this is a page of taste, not a checklist. Committed covers morph into a
 * "your page" tray that assembles live at the bottom.
 */

/** what the user is about to favorite — from the wall or from search */
type Pending = {
  media_type: MediaType;
  title: string;
  creator: string;
  /** artwork shown in the panel and the tray (local file for wall picks) */
  art: string | null;
  view_url: string | null;
  year: string;
  canonical_id: string | null;
  /** wall picks get a canonical enrichment pass at commit time */
  fromWall: boolean;
};

type Added = { key: string; media_type: MediaType; title: string; art: string | null };

const keyOf = (type: MediaType, title: string) => `${type}|${title.trim().toLowerCase()}`;

const TYPE_TAG: Record<string, string> = {
  book: "Book", movie: "Film", tv: "TV", music: "Music", podcast: "Pod",
  video: "Video", article: "Read",
};

/** search enrichment type per media type (mirrors the import engine) */
const SEARCH_TYPE: Partial<Record<MediaType, string>> = {
  book: "book", movie: "movie", tv: "movie", music: "music", podcast: "podcast",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export default function PicksStep({
  profile,
  onNext,
}: {
  profile: Profile;
  onNext: (addedCount: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [thoughts, setThoughts] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<Added[]>([]);
  // items already in the library — returning mid-onboarding must not duplicate
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const nextSort = useRef<number | null>(null);

  const addedKeys = useMemo(() => new Set(added.map((a) => a.key)), [added]);
  const isDone = (mediaType: MediaType, title: string) => {
    const key = keyOf(mediaType, title);
    return addedKeys.has(key) || existingKeys.has(key);
  };

  // where new rows slot in, and what's already there (dedupe on re-entry)
  useEffect(() => {
    supabase()
      .from("items")
      .select("media_type, title, sort_order")
      .eq("profile_id", profile.id)
      .order("sort_order", { ascending: false })
      .then(({ data }) => {
        const rows = data ?? [];
        nextSort.current = (rows[0]?.sort_order ?? -1) + 1;
        setExistingKeys(new Set(rows.map((r) => keyOf(r.media_type as MediaType, r.title))));
      });
  }, [profile.id]);

  // live everything-search (people excluded — this beat is about media); the
  // hook debounces, caches per session, and drops stale responses
  const { results: liveResults, searching } = useLiveSearch<SearchResult[]>(
    query,
    async (q, signal) => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=all`, {
        headers: await authHeaders(),
        signal,
      });
      const json = res.ok ? await res.json() : { results: [] };
      return (json.results ?? []) as SearchResult[];
    },
    { minLength: 2, scope: "picks" }
  );
  const results = liveResults ?? [];

  const openWallPick = (p: StarterPick) => {
    setThoughts("");
    setError("");
    setPending({
      media_type: p.media_type,
      title: p.title,
      creator: p.creator,
      art: p.src,
      view_url: null,
      year: "",
      canonical_id: null,
      fromWall: true,
    });
  };

  const openSearchPick = (r: SearchResult) => {
    setThoughts("");
    setError("");
    setQuery(""); // clearing the query aborts any in-flight search and empties the dropdown
    setPending({
      media_type: r.media_type,
      title: r.title,
      creator: r.creator,
      art: r.image_url,
      view_url: r.view_url,
      year: r.year,
      canonical_id: r.canonical_id,
      fromWall: false,
    });
  };

  const commit = async () => {
    if (!pending || !thoughts.trim() || saving) return;
    if (isDone(pending.media_type, pending.title)) {
      setError("Already in your library.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let { art, view_url, year, canonical_id } = pending;

      // wall picks: one canonical pass so the item carries a real id + hosted art
      if (pending.fromWall) {
        try {
          const type = SEARCH_TYPE[pending.media_type] ?? "all";
          const res = await fetch(
            `/api/search?type=${type}&q=${encodeURIComponent(
              `${pending.title} ${pending.creator}`.trim()
            )}`,
            { headers: await authHeaders() }
          );
          if (res.ok) {
            const { results: hits } = (await res.json()) as { results: SearchResult[] };
            const hit =
              (hits ?? []).find((h) => norm(h.title) === norm(pending.title)) ?? hits?.[0];
            if (hit) {
              art = hit.image_url ?? art;
              view_url = hit.view_url ?? view_url;
              year = hit.year || year;
              canonical_id = hit.canonical_id ?? canonical_id;
            }
          }
        } catch {
          /* local cover art is a fine fallback */
        }
      }

      if (nextSort.current === null) nextSort.current = 0;
      const { error: insErr } = await supabase().from("items").insert({
        profile_id: profile.id,
        media_type: pending.media_type,
        title: pending.title,
        creator: pending.creator,
        description: thoughts.trim(),
        image_url: art,
        view_url,
        metadata: year ? { year } : {},
        canonical_id,
        sort_order: nextSort.current++,
      });
      if (insErr) throw new Error(insErr.message);

      const key = keyOf(pending.media_type, pending.title);
      setAdded((prev) => [...prev, { key, media_type: pending.media_type, title: pending.title, art }]);
      setPending(null);
      setThoughts("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const count = added.length;
  const trayCopy =
    count === 0
      ? "Tap a cover, or search for anything."
      : count < 4
        ? `${count} favorite${count === 1 ? "" : "s"} — a page starts at four.`
        : `${count} favorites — this is starting to look like you.`;

  return (
    <LayoutGroup>
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <h1 className="text-2xl font-semibold leading-snug tracking-tight text-zinc-900 sm:text-3xl">
          <RevealWords text="What do you love?" delay={0.1} />
        </h1>
        <Rise delay={0.35}>
          <p className="mt-2 text-xs text-zinc-400">
            Every favorite carries a reason — this is a page of taste, not a log.
          </p>
        </Rise>

        {/* search anything */}
        <Rise delay={0.5} className="relative mt-8">
          <div
            className={`flex items-center gap-2 border-b pb-1.5 transition-colors duration-200 ${
              searchFocused ? "border-zinc-900" : "border-zinc-300"
            }`}
          >
            <svg
              className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                searchFocused ? "text-zinc-900" : "text-zinc-400"
              }`}
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="5" cy="5" r="4" />
              <path d="M8 8l3 3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search books, films, music, podcasts…"
              className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-300"
            />
            {searching && (
              <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-zinc-400 [animation:smart-search-wave_1.6s_ease-in-out_infinite]">
                …
              </span>
            )}
          </div>

          {results.length > 0 && (
            <ul className="save-appear absolute left-0 right-0 top-full z-40 mt-2 max-h-72 overflow-y-auto border border-zinc-200 bg-white shadow-2xl">
              {results.map((r, i) => {
                const done = isDone(r.media_type, r.title);
                return (
                  <li key={`${r.media_type}-${r.source_id}-${i}`}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => !done && openSearchPick(r)}
                      disabled={done}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                        done ? "cursor-default opacity-50" : "cursor-pointer hover:bg-zinc-50"
                      }`}
                    >
                      <div className="flex h-10 w-8 shrink-0 items-center justify-center">
                        {r.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.thumb_url ?? r.image_url}
                            alt=""
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <div className="h-full w-full bg-zinc-100" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs text-zinc-900">{r.title}</div>
                        <div className="truncate text-[11px] text-zinc-400">
                          {[r.creator, r.year].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                        {done ? "Added ✓" : TYPE_TAG[r.media_type] ?? r.media_type}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Rise>

        {/* the wall */}
        <Rise delay={0.65} className="mt-10 flex flex-col gap-10 pb-8">
          {STARTER_SECTIONS.map((section, sectionIdx) => (
            <div key={section.label}>
              <h2 className="mb-4 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                {section.label}
              </h2>
              <div className="hover-fx grid grid-cols-4 gap-4 sm:grid-cols-6 sm:gap-5">
                {section.picks.map((p, pickIdx) => {
                  const done = isDone(p.media_type, p.title);
                  // first section's opening row is above the fold — load it eagerly
                  const eager = sectionIdx === 0 && pickIdx < 6;
                  return (
                    <button
                      key={p.src}
                      onClick={() => !done && openWallPick(p)}
                      aria-label={done ? `${p.title} — added` : `Favorite ${p.title}`}
                      className={`item-tile relative block text-left ${
                        done ? "cursor-default" : "cursor-pointer"
                      }`}
                    >
                      <div className={`transition-opacity duration-300 ${done ? "opacity-35" : ""}`}>
                        <FramedCover type={p.media_type} src={p.src} title={p.title} eager={eager} />
                      </div>
                      {done && (
                        <span className="save-appear absolute right-0 top-0 flex h-5 w-5 items-center justify-center bg-zinc-900 text-[10px] text-white">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </Rise>

        {/* your page, assembling — sticky above the shell footer */}
        <div className="sticky bottom-0 z-30 -mx-5 mt-auto border-t border-zinc-100 bg-white/85 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8">
          <div className="mx-auto flex max-w-3xl items-center gap-4">
            <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              {added.length === 0 ? (
                <p className="text-xs text-zinc-400">{trayCopy}</p>
              ) : (
                <>
                  {added.map((a) => (
                    <motion.div
                      key={a.key}
                      layoutId={`pick-${a.key}`}
                      transition={{ duration: 0.45, ease: EASE_SNAP }}
                      className="h-12 w-12 shrink-0"
                    >
                      <div className="flex h-full w-full items-center justify-center overflow-hidden bg-zinc-100">
                        {a.art ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.art} alt={a.title} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-semibold text-zinc-300">
                            {a.title.slice(0, 1)}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  <p className="ml-2 shrink-0 text-xs text-zinc-400">{trayCopy}</p>
                </>
              )}
            </div>
            {count === 0 && (
              <button
                onClick={() => onNext(0)}
                className="shrink-0 cursor-pointer text-xs text-zinc-400 transition-colors hover:text-zinc-900"
              >
                Skip →
              </button>
            )}
            <button
              onClick={() => onNext(count)}
              disabled={count === 0}
              className="h-9 shrink-0 cursor-pointer bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-default disabled:bg-zinc-400"
            >
              Continue
            </button>
          </div>
        </div>

        {/* commit panel — thoughts required, then the cover morphs into the tray */}
        <AnimatePresence>
          {pending && (
            <div className="fixed inset-0 z-[70] overflow-y-auto" role="dialog" aria-modal="true">
              <motion.button
                aria-label="Close"
                onClick={() => setPending(null)}
                className="fixed inset-0 cursor-default bg-white/35 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              />
              <div className="pointer-events-none relative flex min-h-full items-start justify-center px-4 pb-16 pt-[16vh]">
                <motion.div
                  className="pointer-events-auto w-full max-w-md border border-zinc-200 bg-white shadow-2xl"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.99 }}
                  transition={{ duration: 0.22, ease: EASE_SNAP }}
                >
                  <div className="flex flex-col gap-4 p-5">
                    <div className="flex items-center gap-4">
                      <motion.div
                        layoutId={`pick-${keyOf(pending.media_type, pending.title)}`}
                        transition={{ duration: 0.45, ease: EASE_SNAP }}
                        className="flex h-16 w-12 shrink-0 items-center justify-center"
                      >
                        {pending.art ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pending.art}
                            alt=""
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <div className="h-full w-full bg-zinc-100" />
                        )}
                      </motion.div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">
                          {pending.title}
                        </div>
                        <div className="truncate text-xs text-zinc-400">
                          {[pending.creator, pending.year].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <button
                        onClick={() => setPending(null)}
                        className="ml-auto shrink-0 cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
                      >
                        Cancel
                      </button>
                    </div>
                    <textarea
                      value={thoughts}
                      onChange={(e) => setThoughts(e.target.value)}
                      rows={4}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
                      }}
                      placeholder="Your thoughts — why is this a favorite?"
                      className="resize-none border border-zinc-200 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={commit}
                        disabled={saving || !thoughts.trim()}
                        className="flex h-9 cursor-pointer items-center gap-2 bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-default disabled:bg-zinc-400"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/favicon.svg" alt="" className="h-4.5 w-auto" />
                        {saving ? "Saving..." : "Favorite"}
                      </button>
                      {!thoughts.trim() && !error && (
                        <span className="text-[11px] text-zinc-400">
                          A word on why — that&rsquo;s the whole point.
                        </span>
                      )}
                      {error && <span className="text-[11px] text-red-500">{error}</span>}
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
