"use client";

import { useEffect, useRef, useState } from "react";
import type { Item, MediaType, SearchResult } from "@/lib/types";
import { ADD_TYPES } from "@/lib/categories";
import { supabase, authHeaders } from "@/lib/supabase";
import { whoSaved } from "@/lib/social";
import { useLiveSearch } from "@/lib/use-live-search";

type Draft = Omit<SearchResult, "source_id"> & {
  source_id?: string;
  file?: File;
};

/** Stable identity for a search result across repeated searches. */
export function resultKey(r: SearchResult): string {
  return r.canonical_id ?? `${r.media_type}:${r.source_id}`;
}

/**
 * The add palette, styled after the NS ⌘K panel: sharp bordered panel, big
 * quiet input, type picker on top. Lives on /add as its own page. Searchable
 * types hit /api/search; video/link resolve a pasted URL; photo uploads to
 * storage.
 */
export default function AddFavorite({
  profileId,
  nextSortOrder,
  onAdded,
  bulkSelected,
  onBulkToggle,
}: {
  /** null while the viewer's profile is still resolving */
  profileId: string | null;
  nextSortOrder: number;
  onAdded: (item: Item) => void;
  /** bulk mode: keys (resultKey) of the results currently in the basket */
  bulkSelected?: Set<string>;
  /** bulk mode: present = clicking a result toggles it instead of drafting */
  onBulkToggle?: (r: SearchResult) => void;
}) {
  const [type, setType] = useState<MediaType>("book");
  const [query, setQuery] = useState("");
  const [urlSearching, setUrlSearching] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [thoughts, setThoughts] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualCreator, setManualCreator] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualPreview, setManualPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const mode = ADD_TYPES.find((t) => t.type === type)!.mode;

  // reset happens in pickType (same batch as the type change) rather than an
  // effect: an effect commits a frame later, and a keystroke landing in that
  // gap would resubmit the stale input value through onChange
  const pickType = (t: MediaType) => {
    setType(t);
    setQuery("");
    setDraft(null);
    setThoughts(""); // a note written for the discarded draft must not ride along
    setError("");
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, [type]);

  // live search for database-backed types; the hook debounces, caches per
  // session, and aborts stale requests so results always track the keystroke
  const { results: liveResults, searching: liveSearching } = useLiveSearch<SearchResult[]>(
    mode === "search" ? query : "",
    async (q, signal) => {
      const r = await fetch(`/api/search?type=${type}&q=${encodeURIComponent(q)}`, {
        headers: await authHeaders(),
        signal,
      });
      const d = await r.json();
      if (!r.ok) {
        // an expired session (401) otherwise reads as "no matches for anything"
        setError("Search failed — try again, or sign in again.");
        throw new Error("search failed"); // keep the failure out of the cache
      }
      setError("");
      return (d.results ?? []) as SearchResult[];
    },
    { scope: type }
  );
  const results = liveResults ?? [];
  const searching = liveSearching || urlSearching;

  const resolveUrl = async () => {
    if (!query.trim()) return;
    setUrlSearching(true);
    setError("");
    try {
      const r = await fetch(`/api/og?url=${encodeURIComponent(query.trim())}`, {
        headers: await authHeaders(),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setDraft({
        media_type: type,
        title: d.title ?? query,
        creator: d.site ?? "",
        image_url: d.image ?? null,
        view_url: query.trim(),
        year: "",
        canonical_id: null,
      });
    } catch {
      setError("Couldn't read that link — check the URL.");
    } finally {
      setUrlSearching(false);
    }
  };

  const pickFile = (f: File) => {
    setDraft({
      media_type: "photo",
      title: f.name.replace(/\.[^.]+$/, ""),
      creator: "",
      image_url: URL.createObjectURL(f),
      view_url: null,
      year: "",
      canonical_id: null,
      file: f,
    });
  };

  const save = async (d?: Draft) => {
    const src = d ?? draft;
    if (!src || !src.title.trim() || !profileId) return;
    setSaving(true);
    setError("");
    try {
      const db = supabase();

      // dedupe against the library (same media_type+title, or canonical id) —
      // mirrors the feed's savedByMe guard and the picks/import dedupe so the
      // /add page can't silently pile up a second copy of the same favorite
      const already = await whoSaved(
        { media_type: src.media_type, title: src.title, canonical_id: src.canonical_id ?? null },
        [profileId]
      );
      if (already.has(profileId)) {
        setError("Already in your library.");
        setSaving(false);
        return;
      }

      let imageUrl = src.image_url;

      if (src.file) {
        const path = `${profileId}/${Date.now()}-${src.file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const { error: upErr } = await db.storage
          .from("media")
          .upload(path, src.file);
        if (upErr) throw new Error(upErr.message);
        imageUrl = db.storage.from("media").getPublicUrl(path).data.publicUrl;
      }

      const { data, error: insErr } = await db
        .from("items")
        .insert({
          profile_id: profileId,
          media_type: src.media_type,
          title: src.title,
          creator: src.creator,
          description: thoughts,
          image_url: imageUrl,
          view_url: src.view_url,
          metadata: src.year ? { year: src.year } : {},
          canonical_id: src.canonical_id ?? null,
          sort_order: nextSortOrder,
        })
        .select()
        .single();
      if (insErr) throw new Error(insErr.message);
      onAdded(data as Item);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Save failed — are you signed in?",
      );
      setSaving(false);
    }
  };

  return (
    <div className="w-full border border-zinc-200 bg-white">
      {/* type picker */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-zinc-100 px-5 py-3">
        {ADD_TYPES.map((t) => (
          <button
            key={t.type}
            onClick={() => pickType(t.type)}
            className={`cursor-pointer text-[10px] uppercase tracking-[0.08em] transition-colors ${
              type === t.type
                ? "font-medium text-zinc-900"
                : "text-zinc-400 hover:text-zinc-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "manual" && !draft ? (
        /* fully manual entry — anything without a database */
        <div className="flex flex-col gap-3 p-5">
          <div className="flex gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden bg-zinc-100 text-center text-[10px] uppercase leading-tight tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
            >
              {manualPreview ? (
                <img
                  src={manualPreview}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                "image (optional)"
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setManualFile(f);
                    setManualPreview(URL.createObjectURL(f));
                  }
                }}
              />
            </button>
            <div className="flex w-full flex-col gap-2">
              <input
                value={manualTitle}
                autoFocus
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Title"
                className="border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
              />
              <input
                value={manualCreator}
                onChange={(e) => setManualCreator(e.target.value)}
                placeholder="By (optional)"
                className="border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
              />
            </div>
          </div>
          <input
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="Link (optional)"
            className="border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
          />
          <textarea
            value={thoughts}
            onChange={(e) => setThoughts(e.target.value)}
            rows={3}
            placeholder="Your thoughts — why is this a favorite?"
            className="resize-none border border-zinc-200 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
          />
          <p className="-mt-1.5 text-[11px] text-zinc-400">
            Optional — a line on why makes it yours.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                save({
                  media_type: "other",
                  title: manualTitle.trim(),
                  creator: manualCreator.trim(),
                  image_url: null,
                  view_url: manualUrl.trim() || null,
                  year: "",
                  canonical_id: null,
                  file: manualFile ?? undefined,
                })
              }
              disabled={saving || !manualTitle.trim() || !profileId}
              className="flex h-9 cursor-pointer items-center gap-2 bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-wait disabled:bg-zinc-400"
            >
              <img src="/favicon.svg" alt="" className="h-4.5 w-auto" />
              {saving ? "Saving..." : "Favorite"}
            </button>
            {error && <span className="text-[11px] text-red-500">{error}</span>}
          </div>
        </div>
      ) : !draft ? (
        <>
          {/* input row */}
          {mode !== "upload" ? (
            <div className="flex items-center">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && mode === "url") resolveUrl();
                }}
                placeholder={
                  mode === "search"
                    ? `Search for a ${
                        type === "music"
                          ? "song or album"
                          : type === "movie"
                            ? "movie or tv show"
                            : type
                      }`
                    : "Paste a URL and press ⏎"
                }
                className="h-14 w-full bg-transparent px-5 text-base text-zinc-900 outline-none placeholder:text-zinc-300"
              />
              {searching && (
                <span className="pr-5 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                  …
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) pickFile(f);
              }}
              className="flex h-40 w-full cursor-pointer items-center justify-center text-xs text-zinc-400 transition-colors hover:text-zinc-900"
            >
              Drop a photo here or click to browse
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickFile(f);
                }}
              />
            </button>
          )}

          {/* search results */}
          {mode === "search" && results.length > 0 && (
            <ul className="max-h-80 overflow-y-auto border-t border-zinc-100">
              {results.map((r, i) => {
                const picked = bulkSelected?.has(resultKey(r)) ?? false;
                return (
                  <li key={`${r.source_id}-${i}`}>
                    <button
                      onClick={() => (onBulkToggle ? onBulkToggle(r) : setDraft(r))}
                      className={`flex w-full cursor-pointer items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-zinc-50 ${
                        picked ? "bg-zinc-50" : ""
                      }`}
                    >
                      <div className="flex h-12 w-10 shrink-0 items-center justify-center">
                        {r.image_url ? (
                          <img
                            src={r.thumb_url ?? r.image_url}
                            alt=""
                            decoding="async"
                            // no fetchPriority: marking every row "high" just
                            // demotes them all back to equal priority
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <div className="h-full w-full bg-zinc-100" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs text-zinc-900">
                          {r.title}
                        </div>
                        <div className="truncate text-[11px] text-zinc-400">
                          {[r.creator, r.year].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {picked && (
                        <svg
                          className="ml-auto shrink-0 text-zinc-900"
                          width="13"
                          height="13"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M3 8.5 6.5 12 13 4.5" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <p className="px-5 pb-4 text-[11px] text-red-500">{error}</p>
          )}
        </>
      ) : (
        /* draft: preview + thoughts */
        <div className="save-appear flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-12 shrink-0 items-center justify-center">
              {draft.image_url ? (
                <img
                  src={draft.thumb_url ?? draft.image_url}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="h-full w-full bg-zinc-100" />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-900">
                {draft.title}
              </div>
              <div className="truncate text-xs text-zinc-400">
                {[draft.creator, draft.year].filter(Boolean).join(" · ")}
              </div>
            </div>
            <button
              onClick={() => setDraft(null)}
              className="ml-auto shrink-0 cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
            >
              Change
            </button>
          </div>
          <textarea
            value={thoughts}
            onChange={(e) => setThoughts(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Your thoughts — why is this a favorite?"
            className="resize-none border border-zinc-200 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
          />
          <p className="-mt-2.5 text-[11px] text-zinc-400">
            Optional — a line on why makes it yours.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => save()}
              disabled={saving || !profileId}
              className="flex h-9 cursor-pointer items-center gap-2 bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-wait disabled:bg-zinc-400"
            >
              <img src="/favicon.svg" alt="" className="h-4.5 w-auto" />
              {saving ? "Saving..." : "Favorite"}
            </button>
            {error && <span className="text-[11px] text-red-500">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
