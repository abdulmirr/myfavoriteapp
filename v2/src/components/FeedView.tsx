"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { FeedWork, SearchResult } from "@/lib/types";
import { useViewer, viewer } from "@/lib/viewer";
import { useLiveSearch } from "@/lib/use-live-search";
import { searchEverything, type SearchHits } from "@/lib/search";
import { FEED_PAGE, TYPE_FILTERS, metaLine, typeLabel } from "@/lib/work";
import { TypedTitle } from "./Typewriter";
import Masonry, { MasonrySkeleton } from "./Masonry";
import WorkCard, { CardActions } from "./WorkCard";
import { NaturalCover } from "./Cover";
import Avatar from "./ui/Avatar";
import { card, cn, pageTitle, pill, pillActive, pillIdle } from "./ui/styles";

type FeedState = { works: FeedWork[]; hasMore: boolean };

const cacheKey = (pid: string, filter: string) => `fav2:feed:${pid}:${filter}`;

function readCache(pid: string, filter: string): FeedState | null {
  try {
    const raw = localStorage.getItem(cacheKey(pid, filter));
    return raw ? (JSON.parse(raw) as FeedState) : null;
  } catch {
    return null;
  }
}

function writeCache(pid: string, filter: string, s: FeedState) {
  try {
    // only the first page — enough for an instant paint next time
    localStorage.setItem(
      cacheKey(pid, filter),
      JSON.stringify({ works: s.works.slice(0, FEED_PAGE), hasMore: s.hasMore })
    );
  } catch {}
}

async function fetchPage(viewer: string | null, filter: string, offset: number): Promise<FeedState> {
  const p = new URLSearchParams({ filter, offset: String(offset) });
  if (viewer) p.set("viewer", viewer);
  const res = await fetch(`/api/feed?${p}`);
  const json = (await res.json()) as { works?: FeedWork[]; hasMore?: boolean };
  if (!res.ok) throw new Error("feed unavailable");
  return { works: json.works ?? [], hasMore: !!json.hasMore };
}

/** A catalog match that isn't on Favorite yet — no item page, so it links out. */
function CatalogCard({ r, priority }: { r: SearchResult; priority: boolean }) {
  const work = { ...r, year: r.year || null };
  const meta = metaLine(work);
  const body = (
    <>
      <NaturalCover work={{ ...work, image_url: r.image_url }} priority={priority} />
      <h3 className="pt-3 text-sm font-semibold leading-snug tracking-tight text-gray-900 sm:text-base dark:text-neutral-100">
        <span className="sm:group-hover/resource:underline">{r.title}</span>
      </h3>
    </>
  );
  return (
    <article className={cn(card, "p-3.5 sm:p-4")}>
      {r.view_url ? (
        <a href={r.view_url} target="_blank" rel="noopener noreferrer" className="group/resource block">
          {body}
        </a>
      ) : (
        <div>{body}</div>
      )}
      <div className="mt-0.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {meta && <p className="truncate text-xs text-gray-500 dark:text-neutral-400">{meta}</p>}
          <p className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400">{typeLabel(work)}</p>
        </div>
        <CardActions work={work} />
      </div>
    </article>
  );
}

export default function FeedView({ initial }: { initial: FeedWork[] }) {
  const v = useViewer();
  const pid = v.profile?.id ?? null;
  const [filter, setFilter] = useState("all");
  const [feed, setFeed] = useState<FeedState | null>(null);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState("");
  const sentinel = useRef<HTMLDivElement>(null);
  const reqSeq = useRef(0);

  const viewerKey = v.status === "signed-in" ? pid : null;

  // Whose feed: a signed-in viewer gets theirs (cached → instant), a visitor
  // the server-rendered one. Decided before paint from the store's client
  // snapshot (+ the pre-paint auth hint while the session check runs), so
  // neither view ever flashes the other.
  /* eslint-disable react-hooks/set-state-in-effect -- choosing the view before paint is the point */
  useLayoutEffect(() => {
    const cur = viewer();
    const signedIn =
      cur.status === "signed-in" ||
      (cur.status === "unknown" && document.documentElement.dataset.auth === "in");
    const vk = cur.status === "signed-in" ? (cur.profile?.id ?? null) : null;
    const seq = ++reqSeq.current;
    setError(false);
    if (!signedIn && filter === "all") {
      setFeed({ works: initial, hasMore: initial.length === FEED_PAGE });
      return;
    }
    if (signedIn && !vk) return; // profile still resolving — skeleton holds
    setFeed(vk ? readCache(vk, filter) : null);
    fetchPage(vk, filter, 0)
      .then((s) => {
        if (seq !== reqSeq.current) return;
        setFeed(s);
        if (vk) writeCache(vk, filter, s);
      })
      .catch(() => seq === reqSeq.current && setError(true));
  }, [v.status, pid, filter, initial]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadMore = useCallback(async () => {
    if (!feed?.hasMore || loadingMore) return;
    setLoadingMore(true);
    const seq = reqSeq.current;
    try {
      const next = await fetchPage(viewerKey, filter, feed.works.length);
      if (seq !== reqSeq.current) return;
      setFeed((f) => {
        if (!f) return f;
        const seen = new Set(f.works.map((w) => w.work_key));
        return { works: [...f.works, ...next.works.filter((w) => !seen.has(w.work_key))], hasMore: next.hasMore };
      });
    } catch {
      /* the sentinel will try again on the next scroll */
    } finally {
      setLoadingMore(false);
    }
  }, [feed, loadingMore, viewerKey, filter]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !feed?.hasMore) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void loadMore(), {
      rootMargin: "900px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [feed, loadMore]);

  // search replaces the feed while there's a query
  const { results, searching } = useLiveSearch<SearchHits>(q, searchEverything, {
    minLength: 2,
    delay: 200,
    scope: "feed",
  });
  const searchMode = q.trim().length >= 2;

  // "Following" is members-only; while the session check runs the pre-paint
  // CSS switch shows it exactly when a session exists
  const filters: { key: string; label: string; className?: string }[] = [
    { key: "all", label: "All" },
    ...(v.status === "signed-out"
      ? []
      : [{ key: "following", label: "Following", className: v.status === "unknown" ? "signed-in-only" : undefined }]),
    ...TYPE_FILTERS.map((f) => ({ key: f.key, label: f.label })),
  ];

  return (
    <div className="min-h-screen px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-14 text-center sm:mb-16">
          <TypedTitle text="Looking for something?" caret className={pageTitle} />
          <form
            autoComplete="off"
            role="search"
            onSubmit={(e) => e.preventDefault()}
            className="relative mx-auto mt-4 w-full max-w-lg sm:mt-6"
          >
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              enterKeyHint="search"
              placeholder="Search books, films, music, people…"
              aria-label="Search Favorite"
              maxLength={200}
              className="h-11 w-full rounded-lg border border-gray-200 bg-white pr-12 pl-4 text-sm text-gray-900 shadow-xs outline-none placeholder:text-gray-400 focus-visible:ring-1 focus-visible:ring-gray-900/10 dark:border-neutral-700/60 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/10"
            />
            <button
              type={q ? "button" : "submit"}
              onClick={() => q && setQ("")}
              aria-label={q ? "Clear search" : "Search"}
              className="absolute top-1.5 right-1.5 inline-flex size-8 cursor-pointer items-center justify-center rounded-md bg-gray-900 text-white transition-colors hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {q ? <X className="size-4" /> : <Search className="size-4" />}
            </button>
          </form>
        </div>

        {!searchMode && (
          <div className="no-scrollbar -mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:mb-8 sm:flex-wrap sm:justify-center sm:px-0">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(pill, filter === f.key ? pillActive : pillIdle, f.className)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {searchMode ? (
          <SearchResults results={results} searching={searching} />
        ) : error && !feed ? (
          <p className="py-16 text-center text-sm text-red-600 dark:text-red-400">
            The feed couldn&apos;t be loaded. Refresh the page to try again.
          </p>
        ) : !feed ? (
          <MasonrySkeleton label="Loading the feed…" />
        ) : feed.works.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-500 dark:text-neutral-400">
            {filter === "following"
              ? v.following.length
                ? "Nothing from the people you follow here yet."
                : "Follow a few people and what they love lands here."
              : "Nothing here yet."}
          </p>
        ) : (
          <>
            <Masonry
              items={feed.works}
              keyOf={(w) => w.work_key}
              render={(w, i) => <WorkCard work={w} priority={i < 4} />}
              fallback={<MasonrySkeleton label="Loading the feed…" />}
            />
            {feed.hasMore && <div ref={sentinel} aria-hidden className="h-px w-full" />}
            {loadingMore && (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-neutral-400">Loading more…</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SearchResults({ results, searching }: { results: SearchHits | null; searching: boolean }) {
  if (!results) return <MasonrySkeleton label="Searching…" />;
  const { people, works, catalog } = results;
  if (!people.length && !works.length && !catalog.length) {
    return (
      <p className="py-16 text-center text-sm text-gray-500 dark:text-neutral-400">
        {searching ? "Searching…" : "No matches."}
      </p>
    );
  }
  type Entry = { kind: "work"; w: FeedWork } | { kind: "catalog"; r: SearchResult };
  const entries: Entry[] = [
    ...works.map((w) => ({ kind: "work" as const, w })),
    ...catalog.map((r) => ({ kind: "catalog" as const, r })),
  ];
  return (
    <div className={cn("flex flex-col gap-6 transition-opacity", searching && "opacity-60")}>
      {people.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
          {people.map((p) => (
            <Link
              key={p.id}
              href={`/${p.username}`}
              className={cn(card, "flex shrink-0 items-center gap-2.5 py-2 pr-4 pl-2 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-700/60")}
            >
              <Avatar p={p} className="size-8" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">
                  {p.display_name || p.username}
                </span>
                <span className="block truncate text-xs text-gray-500 dark:text-neutral-400">@{p.username}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {entries.length > 0 && (
        <Masonry
          items={entries}
          keyOf={(e) => (e.kind === "work" ? `w:${e.w.work_key}` : `c:${e.r.media_type}:${e.r.source_id}`)}
          render={(e, i) =>
            e.kind === "work" ? <WorkCard work={e.w} priority={i < 4} /> : <CatalogCard r={e.r} priority={i < 4} />
          }
          fallback={<MasonrySkeleton label="Searching…" />}
        />
      )}
    </div>
  );
}
