"use client";

import { useSyncExternalStore } from "react";
import { cn } from "./ui/styles";

/**
 * antislop's masonry: N flex columns, items dealt round-robin (i % N), so a
 * newly loaded page only ever appends to the bottom of each column — nothing
 * already on screen moves.
 *
 * The column count depends on the viewport, which the server can't know, so
 * the server (and the hydration frame) renders `fallback` — a skeleton — and
 * the real columns appear on the first client frame after hydration.
 */
const QUERIES: [string, number][] = [
  ["(min-width: 1280px)", 4],
  ["(min-width: 1024px)", 3],
];

/** phones get two compact columns: covers are tall, a single column is a scroll marathon */
const BASE_COLUMNS = 2;

function columnsNow(max: number): number {
  for (const [q, n] of QUERIES) if (n <= max && matchMedia(q).matches) return n;
  return Math.min(BASE_COLUMNS, max);
}

function subscribe(cb: () => void) {
  const mqs = QUERIES.map(([q]) => matchMedia(q));
  mqs.forEach((m) => m.addEventListener("change", cb));
  return () => mqs.forEach((m) => m.removeEventListener("change", cb));
}

export function useColumns(max = 4): number | null {
  return useSyncExternalStore(
    subscribe,
    () => columnsNow(max),
    () => null
  );
}

export default function Masonry<T>({
  items,
  render,
  keyOf,
  max = 4,
  fallback,
  className,
}: {
  items: T[];
  render: (item: T, index: number) => React.ReactNode;
  keyOf: (item: T) => string;
  max?: number;
  fallback: React.ReactNode;
  className?: string;
}) {
  const cols = useColumns(max);
  if (cols === null) return <>{fallback}</>;
  return (
    <div className={cn("flex gap-2.5 sm:gap-4", className)}>
      {Array.from({ length: cols }, (_, c) => (
        <div key={c} className="flex min-w-0 flex-1 flex-col gap-2.5 sm:gap-4">
          {items.map((item, i) => (i % cols === c ? <div key={keyOf(item)}>{render(item, i)}</div> : null))}
        </div>
      ))}
    </div>
  );
}

/** antislop's loading skeleton: pulsing cards with varied, believable heights. */
const HEIGHTS = [228, 300, 156, 272, 196, 248, 184, 312];

export function MasonrySkeleton({ label = "Loading…", max = 4 }: { label?: string; max?: number }) {
  const colsFor = (n: number) =>
    Array.from({ length: n }, (_, c) => (
      <div key={c} className="flex min-w-0 flex-1 flex-col gap-2.5 sm:gap-4">
        {Array.from({ length: 4 }, (_, r) => (
          <div
            key={r}
            className="rounded-2xl border border-gray-200 bg-white p-2.5 sm:p-4 dark:border-neutral-700 dark:bg-neutral-800"
          >
            <div
              className="animate-pulse rounded-md bg-gray-200 dark:bg-neutral-700"
              style={{ height: HEIGHTS[(3 * r + c) % HEIGHTS.length] }}
            />
            <div className="mt-4 h-4 w-4/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
            <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
          </div>
        ))}
      </div>
    ));
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="flex gap-2.5 sm:gap-4 lg:hidden">{colsFor(Math.min(2, max))}</div>
      <div className={cn("hidden gap-4 lg:flex", max > 3 && "xl:hidden")}>{colsFor(Math.min(3, max))}</div>
      {max > 3 && <div className="hidden gap-4 xl:flex">{colsFor(4)}</div>}
    </div>
  );
}
