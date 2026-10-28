"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { MOST_LOVED_PAGE as PAGE } from "@/lib/discover";
import type { RankedWork } from "@/lib/types";
import { useViewer } from "@/lib/viewer";
import { TYPE_FILTERS } from "@/lib/work";
import { cn, pill, pillActive, pillIdle } from "../ui/styles";
import { GridSkeleton, SectionHead, grid } from "./Shelf";
import Tile from "./Tile";
import Who from "./Who";

type Page = { key: string; works: RankedWork[]; hasMore: boolean };

async function fetchPage(viewer: string | null, filter: string, offset: number): Promise<Omit<Page, "key">> {
  const p = new URLSearchParams({ filter, offset: String(offset) });
  if (viewer) p.set("viewer", viewer);
  const res = await fetch(`/api/discover/works?${p}`);
  const json = (await res.json()) as { works?: RankedWork[]; hasMore?: boolean };
  if (!res.ok) throw new Error("most loved unavailable");
  return { works: json.works ?? [], hasMore: !!json.hasMore };
}

const FILTERS = [{ key: "all", label: "All" }, ...TYPE_FILTERS.map((f) => ({ key: f.key, label: f.label }))];

function Divider({ label }: { label: string }) {
  return (
    <div className="col-span-full flex items-center gap-3">
      <h3 className="text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase dark:text-neutral-400">
        {label}
      </h3>
      <span className="h-px flex-1 bg-gray-200 dark:bg-neutral-800" />
    </div>
  );
}

/**
 * "Most loved": every work on Favorite as a dense grid of frames — the ones
 * favorited most in the last 30 days first, then the rest by favorites of
 * all time — each with how many and who (people you follow by name). By
 * medium; what's already yours, and what a shelf above already showed, stays
 * out. The first "All" page comes with the HTML; members get theirs on arrival.
 */
export default function MostLoved({
  initial,
  isOwned,
  skip,
}: {
  initial: RankedWork[];
  isOwned: (w: RankedWork) => boolean;
  skip: Set<string>;
}) {
  const v = useViewer();
  const viewer = v.status === "signed-in" ? (v.profile?.id ?? null) : null;
  const [filter, setFilter] = useState("all");
  const key = `${viewer ?? "-"}:${filter}`;
  const [page, setPage] = useState<Page>({ key: "-:all", works: initial, hasMore: initial.length === PAGE });
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

  const works = shown?.works.filter((w) => !isOwned(w) && !skip.has(w.work_key)) ?? [];
  const firstOld = works.findIndex((w) => w.this_month === 0);

  return (
    <section>
      <SectionHead title="Most loved" sub="What people favorited most this month, then of all time." />
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
          {works.map((w, i) => {
            const recent = w.this_month > 0;
            return (
              <Fragment key={w.work_key}>
                {i === 0 && recent && <Divider label="This month" />}
                {i === firstOld && <Divider label="All time" />}
                <Tile
                  work={w}
                  sizes="(max-width: 639px) 31vw, (max-width: 1279px) 17vw, 160px"
                  who={
                    recent ? (
                      <Who count={w.this_month} ids={w.month_ids} people={w.month_profiles} />
                    ) : (
                      <Who count={w.fav_count} ids={w.favoriter_ids} people={w.top_profiles} />
                    )
                  }
                />
              </Fragment>
            );
          })}
        </div>
      )}
      {ready && page.hasMore && <div ref={sentinel} aria-hidden className="h-px w-full" />}
      {loadingMore && <p className="py-8 text-center text-sm text-gray-500 dark:text-neutral-400">Loading more…</p>}
    </section>
  );
}
