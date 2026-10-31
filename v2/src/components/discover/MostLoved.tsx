"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MOST_LOVED_PAGE as PAGE } from "@/lib/discover";
import type { RankedWork } from "@/lib/types";
import { TYPE_FILTERS, titleKey } from "@/lib/work";
import { cn, pill, pillActive, pillIdle } from "../ui/styles";
import { GridSkeleton, SectionHead, grid } from "./Shelf";
import Tile from "./Tile";
import Who from "./Who";

type Page = { key: string; works: RankedWork[]; hasMore: boolean };

async function fetchPage(filter: string, offset: number): Promise<Omit<Page, "key">> {
  const p = new URLSearchParams({ filter, offset: String(offset) });
  const res = await fetch(`/api/discover/works?${p}`);
  const json = (await res.json()) as { works?: RankedWork[]; hasMore?: boolean };
  if (!res.ok) throw new Error("most loved unavailable");
  return { works: json.works ?? [], hasMore: !!json.hasMore };
}

const FILTERS = [{ key: "all", label: "All" }, ...TYPE_FILTERS.map((f) => ({ key: f.key, label: f.label }))];

/**
 * "Most loved": every work on Favorite as a dense grid of frames, by how
 * many people across Favorite have it — each with that number and their
 * faces (people you follow first). By medium. The same list for everyone,
 * members and visitors alike — nothing is left out for being yours or for
 * showing in a row above. The first "All" page comes with the HTML.
 */
export default function MostLoved({ initial }: { initial: RankedWork[] }) {
  const [filter, setFilter] = useState("all");
  const key = filter;
  const [page, setPage] = useState<Page>({ key: "all", works: initial, hasMore: initial.length === PAGE });
  const [failed, setFailed] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  // "All" is the list that came with the HTML
  if (key === "all" && page.key !== key) setPage({ key, works: initial, hasMore: initial.length === PAGE });

  useEffect(() => {
    if (key === "all") return;
    let stale = false;
    fetchPage(filter, 0)
      .then((s) => !stale && setPage({ key, ...s }))
      .catch(() => !stale && setFailed(key));
    return () => {
      stale = true;
    };
  }, [key, filter]);

  const shown = page.key === key ? page : null;
  const ready = shown !== null;

  const loadMore = useCallback(async () => {
    if (!ready || !page.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(filter, page.works.length);
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
  }, [ready, page, loadingMore, filter, key]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !ready || !page.hasMore) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void loadMore(), { rootMargin: "900px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ready, page, loadMore]);

  // once each: by work, and by title within a kind (two catalogs' spellings)
  const once = new Set<string>();
  const works = (shown?.works ?? []).filter((w) => {
    const t = titleKey(w.media_type, w.title);
    if (once.has(t)) return false;
    once.add(t);
    return true;
  });

  return (
    <section>
      <SectionHead title="Most loved" sub="What everyone on Favorite has favorited most." />
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
            <Tile
              key={w.work_key}
              work={w}
              sizes="(max-width: 639px) 31vw, (max-width: 1279px) 17vw, 160px"
              who={<Who count={w.fav_count} ids={w.favoriter_ids} people={w.top_profiles} />}
            />
          ))}
        </div>
      )}
      {ready && page.hasMore && <div ref={sentinel} aria-hidden className="h-px w-full" />}
      {loadingMore && <p className="py-8 text-center text-sm text-gray-500 dark:text-neutral-400">Loading more…</p>}
    </section>
  );
}
