"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedWork } from "@/lib/types";
import { useViewer } from "@/lib/viewer";
import { FEED_PAGE, TYPE_FILTERS } from "@/lib/work";
import { cn, pill, pillActive, pillIdle } from "../ui/styles";
import { GridSkeleton, SectionHead, grid } from "./Shelf";
import Tile from "./Tile";

type Page = { key: string; works: FeedWork[]; hasMore: boolean };

async function fetchPage(viewer: string | null, filter: string, offset: number): Promise<Omit<Page, "key">> {
  const p = new URLSearchParams({ filter, offset: String(offset) });
  if (viewer) p.set("viewer", viewer);
  const res = await fetch(`/api/feed?${p}`);
  const json = (await res.json()) as { works?: FeedWork[]; hasMore?: boolean };
  if (!res.ok) throw new Error("feed unavailable");
  return { works: json.works ?? [], hasMore: !!json.hasMore };
}

const FILTERS = [{ key: "all", label: "All" }, ...TYPE_FILTERS.map((f) => ({ key: f.key, label: f.label }))];

/**
 * Everything on Favorite as a dense grid of frames, by medium — the feed's
 * pages and order (people you follow first), minus what's already yours.
 * The first "All" page comes with the HTML; members get theirs on arrival.
 */
export default function Browse({ initial, isOwned }: { initial: FeedWork[]; isOwned: (w: FeedWork) => boolean }) {
  const v = useViewer();
  const viewer = v.status === "signed-in" ? (v.profile?.id ?? null) : null;
  const [filter, setFilter] = useState("all");
  const key = `${viewer ?? "-"}:${filter}`;
  const [page, setPage] = useState<Page>({ key: "-:all", works: initial, hasMore: initial.length === FEED_PAGE });
  const [failed, setFailed] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (v.status === "unknown" || key === "-:all") return;
    let stale = false;
    fetchPage(viewer, filter, 0)
      .then((s) => !stale && setPage({ key, ...s }))
      .catch(() => !stale && setFailed(key));
    return () => {
      stale = true;
    };
  }, [v.status, key, viewer, filter]);

  // a member's own "All" replaces the visitors' one when it lands
  const shown = page.key === key ? page : filter === "all" && page.key === "-:all" ? page : null;
  const ready = shown === page && page.key === key;

  const loadMore = useCallback(async () => {
    if (!ready || !page.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(viewer, filter, page.works.length);
      setPage((p) => {
        if (p.key !== key) return p;
        const seen = new Set(p.works.map((w) => w.work_key));
        return { key, works: [...p.works, ...next.works.filter((w) => !seen.has(w.work_key))], hasMore: next.hasMore };
      });
    } catch {
      /* the sentinel tries again on the next scroll */
    } finally {
      setLoadingMore(false);
    }
  }, [ready, page, loadingMore, viewer, filter, key]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !ready || !page.hasMore) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void loadMore(), { rootMargin: "900px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ready, page, loadMore]);

  const works = shown?.works.filter((w) => !isOwned(w)) ?? [];

  return (
    <section>
      <SectionHead title="Browse everything" />
      <div className="no-scrollbar -mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(pill, filter === f.key ? pillActive : pillIdle)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {!shown ? (
        failed === key ? (
          <p className="py-16 text-center text-sm text-red-600 dark:text-red-400">
            This couldn&apos;t be loaded. Refresh the page to try again.
          </p>
        ) : (
          <GridSkeleton label="Loading…" />
        )
      ) : works.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-500 dark:text-neutral-400">Nothing here yet.</p>
      ) : (
        <div className={cn(grid, "mt-6")}>
          {works.map((w) => (
            <Tile key={w.work_key} work={w} sizes="(max-width: 639px) 31vw, (max-width: 1279px) 17vw, 160px" />
          ))}
        </div>
      )}
      {ready && page.hasMore && <div ref={sentinel} aria-hidden className="h-px w-full" />}
      {loadingMore && <p className="py-8 text-center text-sm text-gray-500 dark:text-neutral-400">Loading more…</p>}
    </section>
  );
}
