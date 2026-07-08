"use client";

import { useCallback, useRef, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";

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
 * The library's controls, grouped by what they do: Filter (search + category
 * buckets) narrows what you see; View (sort · grid ⇄ freeform · tile size)
 * changes how you see it. On desktop they stack vertically inside the
 * profile's placard column; on phones they become a sticky wrapped row above
 * the grid. These belong to the content they act on — app navigation lives
 * in the shell's top bar.
 */
export default function LibraryToolbar({
  search,
  onSearch,
  category,
  onCategory,
  counts,
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
  sort: SortMode;
  onSort: (s: SortMode) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  cols: number;
  onCols: (c: number) => void;
}) {
  return (
    // sticky full-bleed bar on phones (the negative margins let the blur reach
    // the screen edges past the layout wrapper's padding); a plain block in
    // the placard column on md+, where the column itself is sticky
    <div className="sticky top-14 z-20 -mx-5 bg-white/85 px-5 backdrop-blur sm:-mx-8 sm:px-8 md:static md:z-auto md:mx-0 md:mt-6 md:border-t md:border-zinc-100 md:bg-transparent md:px-0 md:pt-5 md:backdrop-blur-none">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2.5 py-3 text-xs md:flex-col md:items-stretch md:gap-5 md:py-0">
        {/* filter — what you're looking at */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2.5 md:flex-col md:items-stretch md:gap-3.5">
          <div className="group flex w-32 shrink-0 items-center gap-1.5 border-b border-zinc-400 pb-1 focus-within:border-zinc-900 sm:w-40 md:w-full">
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

          {/* categories with live counts — a row on phones, a list on desktop */}
          <nav className="flex items-center gap-4 md:flex-col md:items-start md:gap-2">
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
        </div>

        {/* view — how you're looking at it */}
        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-4 md:ml-0 md:border-t md:border-zinc-100 md:pt-4">
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
          <div className="hidden md:block">
            <SizeSlider cols={cols} onCols={onCols} />
          </div>
        </div>
      </div>
    </div>
  );
}
