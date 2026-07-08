"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import type { Collection } from "@/lib/social";

export type SortMode = "default" | "latest" | "oldest";
export type ViewMode = "grid" | "freeform";

export const MIN_COLS = 3;
export const MAX_COLS = 20;

/** Hairline slider (NS price-slider visuals): 1px track, 8×8 square handle. */
function SizeSlider({ cols, onCols }: { cols: number; onCols: (c: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // left = small items (many columns), right = large items (few columns)
  const pct = ((MAX_COLS - cols) / (MAX_COLS - MIN_COLS)) * 100;

  const set = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const p = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onCols(Math.round(MAX_COLS - p * (MAX_COLS - MIN_COLS)));
    },
    [onCols]
  );

  return (
    <div
      ref={trackRef}
      title="Tile size"
      className="relative mx-1 flex h-5 w-20 cursor-pointer touch-none items-center select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        set(e.clientX);
      }}
      onPointerMove={(e) => dragging && set(e.clientX)}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
      }}
    >
      <div className="absolute inset-x-0 h-px bg-zinc-400" />
      <div className="absolute h-px bg-zinc-900" style={{ left: 0, right: `${100 - pct}%` }} />
      <div
        className="absolute h-2 w-2 -translate-x-1/2 cursor-grab bg-zinc-900 active:cursor-grabbing"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Curator shelves behind one quiet control: closed, it's "Collections ▾" (or
 * the active shelf as a chip with a clearing ✕); open, it's a small menu of
 * shelves with counts, owner delete (confirm on second tap), and inline create.
 */
function CollectionsMenu({
  collections,
  selected,
  onSelect,
  isOwner,
  onCreate,
  onDelete,
}: {
  collections: Collection[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  isOwner: boolean;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // click-away or escape closes
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError("");
    try {
      await onCreate(trimmed);
      setName("");
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create that.");
    } finally {
      setBusy(false);
    }
  };

  const active = selected ? collections.find((c) => c.id === selected) : null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      {active ? (
        // the active shelf reads as a chip: name reopens the menu, ✕ clears
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <button
            onClick={() => setOpen((o) => !o)}
            className="cursor-pointer font-medium text-zinc-900"
          >
            {active.name}
          </button>
          <button
            onClick={() => onSelect(null)}
            aria-label="Clear collection filter"
            className="cursor-pointer text-zinc-400 transition-colors hover:text-zinc-900"
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M2 2l8 8M10 2L2 10" />
            </svg>
          </button>
        </span>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className={`cursor-pointer whitespace-nowrap transition-colors ${
            open ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
          }`}
        >
          Collections ▾
        </button>
      )}

      {open && (
        <div className="save-appear absolute left-0 top-full z-30 mt-2 flex w-52 flex-col border border-zinc-200 bg-white py-1.5 shadow-xl">
          {collections.length === 0 && !isOwner && (
            <p className="px-3 py-1.5 text-xs text-zinc-400">No collections yet.</p>
          )}
          {collections.map((c) => (
            <div key={c.id} className="group flex items-center gap-2 px-3">
              <button
                onClick={() => {
                  onSelect(selected === c.id ? null : c.id);
                  setOpen(false);
                }}
                className={`min-w-0 flex-1 cursor-pointer truncate py-1.5 text-left text-xs transition-colors ${
                  selected === c.id ? "font-medium text-zinc-900" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                {c.name}
                <span className="ml-1.5 text-zinc-300">{c.count}</span>
              </button>
              {isOwner &&
                (confirmDelete === c.id ? (
                  <button
                    onClick={async () => {
                      setConfirmDelete(null);
                      try {
                        await onDelete(c.id);
                      } catch {
                        /* the row stays; another tap retries */
                      }
                    }}
                    className="shrink-0 cursor-pointer text-[10px] uppercase tracking-[0.08em] text-red-500 hover:text-red-600"
                  >
                    delete?
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setConfirmDelete(c.id);
                      setTimeout(() => setConfirmDelete((v) => (v === c.id ? null : v)), 2500);
                    }}
                    aria-label={`Delete collection ${c.name}`}
                    className="shrink-0 cursor-pointer text-zinc-300 opacity-0 transition-opacity hover:text-zinc-900 group-hover:opacity-100"
                  >
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                      <path d="M2 2l8 8M10 2l-8 8" />
                    </svg>
                  </button>
                ))}
            </div>
          ))}
          {isOwner &&
            (adding ? (
              <div className="flex flex-col gap-1 px-3 pb-1 pt-1.5">
                <input
                  value={name}
                  autoFocus
                  maxLength={40}
                  placeholder="e.g. 2026 canon"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                    if (e.key === "Escape") {
                      setAdding(false);
                      setName("");
                      setError("");
                    }
                  }}
                  onBlur={() => {
                    if (!name.trim()) setAdding(false);
                  }}
                  className="w-full border-b border-zinc-200 bg-transparent pb-0.5 text-xs text-zinc-900 outline-none placeholder:text-zinc-300 focus:border-zinc-400"
                />
                {error && <span className="text-[11px] text-red-500">{error}</span>}
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className={`cursor-pointer px-3 py-1.5 text-left text-xs text-zinc-400 transition-colors hover:text-zinc-900 ${
                  collections.length ? "border-t border-zinc-100" : ""
                }`}
              >
                + New collection
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * The library's controls in one sticky row under the profile header: search,
 * category buckets, collections, sort, grid ⇄ freeform, tile size. These
 * belong to the content they act on — app navigation lives in the shell's rail.
 */
export default function LibraryToolbar({
  search,
  onSearch,
  category,
  onCategory,
  counts,
  isOwner,
  collections,
  selectedCollection,
  onSelectCollection,
  onCreateCollection,
  onDeleteCollection,
  sort,
  onSort,
  view,
  onView,
  cols,
  onCols,
}: {
  search: string;
  onSearch: (v: string) => void;
  category: Category;
  onCategory: (c: Category) => void;
  counts: Record<Category, number>;
  isOwner: boolean;
  /** curator shelves — tap to filter the grid, tap again to clear */
  collections: Collection[];
  selectedCollection: string | null;
  onSelectCollection: (id: string | null) => void;
  onCreateCollection: (name: string) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
  sort: SortMode;
  onSort: (s: SortMode) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  cols: number;
  onCols: (c: number) => void;
}) {
  return (
    <div className="sticky top-14 z-20 bg-white/85 backdrop-blur md:top-0">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-5 overflow-x-auto px-5 py-3 text-xs sm:px-8 [scrollbar-width:none]">
        {/* search */}
        <div className="group flex w-32 shrink-0 items-center gap-1.5 border-b border-zinc-400 pb-1 focus-within:border-zinc-900 sm:w-40">
          <svg
            className="h-3 w-3 shrink-0 text-zinc-400 group-focus-within:text-zinc-900"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="5" cy="5" r="4" />
            <path d="M8 8l3 3" />
          </svg>
          <input
            value={search}
            placeholder="Search"
            onChange={(e) => onSearch(e.target.value)}
            className="w-full bg-transparent text-xs leading-4 text-zinc-900 outline-none placeholder:text-zinc-400"
          />
        </div>

        {/* categories with live counts */}
        <nav className="flex shrink-0 items-center gap-4">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => onCategory(c)}
              className={`cursor-pointer whitespace-nowrap transition-colors ${
                category === c
                  ? "font-medium text-zinc-900"
                  : "text-zinc-400 hover:text-zinc-900"
              }`}
            >
              {c === "All" ? "All" : `${counts[c] ?? 0} ${c}`}
            </button>
          ))}
        </nav>

        {/* curator shelves, folded behind one control */}
        {(collections.length > 0 || isOwner) && (
          <CollectionsMenu
            collections={collections}
            selected={selectedCollection}
            onSelect={onSelectCollection}
            isOwner={isOwner}
            onCreate={onCreateCollection}
            onDelete={onDeleteCollection}
          />
        )}

        <div className="ml-auto flex shrink-0 items-center gap-4">
          {/* one word that cycles: my order → latest → oldest → my order */}
          <button
            onClick={() =>
              onSort(sort === "default" ? "latest" : sort === "latest" ? "oldest" : "default")
            }
            className={`cursor-pointer whitespace-nowrap transition-colors ${
              sort === "default"
                ? "text-zinc-400 hover:text-zinc-900"
                : "font-medium text-zinc-900"
            }`}
          >
            {sort === "oldest" ? "Oldest" : "Latest"}
          </button>
          {(["grid", "freeform"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onView(v)}
              className={`cursor-pointer transition-colors ${
                view === v ? "font-medium text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
              }`}
            >
              {v === "grid" ? "Grid" : "Freeform"}
            </button>
          ))}
          {/* on phones the grid is locked to two columns (globals.css) — the
              slider only shows where it still does something */}
          <div className={view === "grid" ? "hidden md:block" : undefined}>
            <SizeSlider cols={cols} onCols={onCols} />
          </div>
        </div>
      </div>
    </div>
  );
}
