"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import type { BecauseRow, DiscoverWork, RankedWork } from "@/lib/types";
import { thumbCover } from "@/lib/img";
import { searchEverything, type SearchHits } from "@/lib/search";
import { useLiveSearch } from "@/lib/use-live-search";
import { useOwned } from "@/lib/use-owned";
import { useViewer } from "@/lib/viewer";
import { itemHref, titleKey } from "@/lib/work";
import { TypedTitle } from "../Typewriter";
import { pageTitle, primaryButton } from "../ui/styles";
import DiscoverSearch from "./DiscoverSearch";
import MostLoved from "./MostLoved";
import Shelf, { SectionHead, ShelfSkeleton } from "./Shelf";

type Mine = { because: BecauseRow[] };

function BecauseShelf({ row, priority = false }: { row: BecauseRow; priority?: boolean }) {
  const href = itemHref(row.seed);
  return (
    <Shelf
      priority={priority}
      works={row.works}
      head={
        <SectionHead
          lead={
            row.seed.image_url &&
            href && (
              <Link href={href} aria-hidden tabIndex={-1} className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbCover(row.seed.image_url, 120)}
                  alt=""
                  className="obj-shadow h-11 w-auto max-w-14 bg-gray-200 object-contain dark:bg-neutral-800"
                />
              </Link>
            )
          }
          title={
            <>
              Because you love{" "}
              {href ? (
                <Link href={href} className="underline-offset-4 hover:underline">
                  {row.seed.title}
                </Link>
              ) : (
                row.seed.title
              )}
            </>
          }
          sub={`${row.people} ${row.people === 1 ? "person loves" : "people love"} it too. Here’s what else they love.`}
        />
      }
    />
  );
}

function Nudge({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 border-y border-gray-200 py-5 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
      <p className="max-w-xl text-[15px] leading-relaxed text-gray-600 dark:text-neutral-300">{children}</p>
      {action}
    </div>
  );
}

const visitorNudge = (
  <Nudge
    action={
      <Link href="/signin?mode=signup" className={primaryButton}>
        Start your library
      </Link>
    }
  >
    Make a page of your favorites and Discover starts picking for you: what the people who love the same things love.
  </Nudge>
);

/**
 * Discover (2026-10-28): things to find, each with its reason. For members,
 * three "Because you love …" rows (loaded here, from /api/discover), each
 * holding works of its favorite's own type; for everyone, "Most loved" —
 * everything, by favorites. Every work shows how many love it and their
 * faces, people you follow first. Nothing that's already theirs is offered
 * back. People live on Friends; the old feed at /feed (lib/discover.ts).
 */
export default function DiscoverView({ initial }: { initial: RankedWork[] }) {
  const v = useViewer();
  const pid = v.status === "signed-in" ? (v.profile?.id ?? null) : null;
  const isOwned = useOwned();
  // rows: null when the personal rows couldn't load (then the page just goes without)
  const [mine, setMine] = useState<{ pid: string; rows: Mine | null } | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!pid) return;
    let stale = false;
    fetch(`/api/discover?viewer=${pid}`)
      .then((r) => (r.ok ? (r.json() as Promise<Mine>) : Promise.reject(new Error(`discover ${r.status}`))))
      .then((rows) => !stale && setMine({ pid, rows }))
      .catch(() => !stale && setMine({ pid, rows: null }));
    return () => {
      stale = true;
    };
  }, [pid]);

  const { results, searching } = useLiveSearch<SearchHits>(q, searchEverything, {
    minLength: 2,
    delay: 200,
    scope: "discover",
  });
  const searchMode = q.trim().length >= 2;

  const rows = pid && mine?.pid === pid ? mine.rows : undefined;
  // the rows in the order they show; each skips what's theirs and what an
  // earlier row already showed (so does Most loved) — by work, and by title
  // within a kind, for the odd copy two catalogs spell differently — puts
  // what people they follow love first, and hides with under four left
  const seen = new Set<string>();
  const byFriends = (w: DiscoverWork) => ((w.favoriter_ids ?? []).some((id) => v.followingIds.has(id)) ? 0 : 1);
  const keep = (works: DiscoverWork[] | undefined) => {
    const out = (works ?? [])
      .filter((w) => !isOwned(w) && !seen.has(w.work_key) && !seen.has(titleKey(w.media_type, w.title)))
      .sort((a, b) => byFriends(a) - byFriends(b))
      .slice(0, 12);
    if (out.length < 4) return null;
    for (const w of out) seen.add(w.work_key).add(titleKey(w.media_type, w.title));
    return out;
  };
  const because = (row: BecauseRow | undefined) => {
    const works = keep(row?.works);
    return row && works ? { ...row, works } : null;
  };
  const shelves = (rows?.because ?? []).map(because).filter((r) => r !== null);

  // before the personal rows: a placeholder while they load, or a nudge
  // when there's nothing to pick from yet
  const lead =
    v.status === "unknown" ? (
      <>
        <div className="signed-in-only">
          <ShelfSkeleton />
        </div>
        <div className="signed-out-only">{visitorNudge}</div>
      </>
    ) : v.status === "signed-out" ? (
      visitorNudge
    ) : rows === undefined ? (
      <ShelfSkeleton />
    ) : rows && shelves.length === 0 ? (
      <Nudge>
        Favorite a few things (the ★ on anything below) and rows picked from your taste start showing up here.
      </Nudge>
    ) : null;

  return (
    <div className="min-h-screen px-4 pt-14 pb-24 sm:px-6 sm:pt-20 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-14 text-center sm:mb-16">
          <TypedTitle text="Find your next favorite." caret className={pageTitle} />
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

        {searchMode ? (
          <DiscoverSearch results={results} searching={searching} />
        ) : (
          <div className="flex flex-col gap-16 sm:gap-20">
            {lead}
            {shelves.map((row, i) => (
              <BecauseShelf key={row.seed.work_key} row={row} priority={i === 0} />
            ))}
            <MostLoved initial={initial} isOwned={isOwned} skip={seen} />
          </div>
        )}
      </div>
    </div>
  );
}
