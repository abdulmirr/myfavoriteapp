"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Resource, ResourceKind } from "@/lib/resources";
import type { Work } from "@/lib/types";
import { TitleCard } from "../Cover";
import { TypedTitle } from "../Typewriter";
import { CardActions } from "../WorkCard";
import { cn, mediaBox, newBadge, pageTitle, pill, pillActive, pillIdle } from "../ui/styles";
import DiscoverTabs from "./DiscoverTabs";

const KINDS: { key: "all" | ResourceKind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "essays", label: "Essays" },
  { key: "talks", label: "Talks" },
  { key: "videos", label: "Videos" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const when = (d: string | null) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "");
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
const PAGE = 24;

/** The picture, or antislop's black title card when there's none (or it won't load). */
function Media({ r, priority }: { r: Resource; priority: boolean }) {
  const [broken, setBroken] = useState(false);
  if (!r.image_url || broken) return <TitleCard title={r.title} creator={r.creator} badge={r.fresh} />;
  return (
    <div className={cn(mediaBox, "aspect-video")}>
      {r.fresh && <span className={newBadge}>New</span>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={r.image_url}
        alt=""
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onError={() => setBroken(true)}
        className="absolute inset-0 size-full object-cover transition-opacity group-hover/resource:opacity-90"
      />
    </div>
  );
}

/** One resource: it opens where it lives; 🔖 ★ keep it on Favorite. */
function ResourceCard({ r, priority }: { r: Resource; priority: boolean }) {
  const work: Work = {
    media_type: r.media_type,
    title: r.title,
    creator: r.creator,
    image_url: r.image_url,
    view_url: r.url,
    canonical_id: r.canonical_id,
    year: r.published?.slice(0, 4) ?? null,
  };
  const by = [r.creator, when(r.published)].filter(Boolean).join(" · ");
  return (
    <article className="group/resource min-w-0">
      <a href={r.url} target="_blank" rel="noopener noreferrer" aria-hidden tabIndex={-1} className="block">
        <Media r={r} priority={priority} />
      </a>
      <a
        href={r.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-neutral-400"
      >
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-gray-900 group-hover/resource:underline dark:text-neutral-100">
          {r.title}
        </h3>
      </a>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {by && <p className="truncate text-xs text-gray-500 dark:text-neutral-400">{by}</p>}
          <p className="mt-0.5 text-xs text-gray-400 dark:text-neutral-500">
            {r.medium}
            {r.minutes ? ` · ${r.minutes} min` : ""}
          </p>
        </div>
        <CardActions work={work} />
      </div>
    </article>
  );
}

/**
 * Discover → Resources: antislop's archive — essays, talks and videos for
 * founders and for getting better at life — newest pick first, by kind, with
 * a search over titles and authors. All of it arrives with the page; the
 * grid grows as you scroll.
 */
export default function ResourcesView({ resources }: { resources: Resource[] | null }) {
  const [kind, setKind] = useState<"all" | ResourceKind>("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  const all = resources ?? [];
  const term = fold(q.trim());
  const list = all.filter(
    (r) => (kind === "all" || r.kind === kind) && (!term || fold(`${r.title} ${r.creator}`).includes(term))
  );
  const counts = Object.fromEntries(KINDS.map((k) => [k.key, k.key === "all" ? all.length : all.filter((r) => r.kind === k.key).length]));
  const more = list.length > limit;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setLimit((n) => n + PAGE), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, limit]);

  return (
    <div className="min-h-screen px-4 pt-8 pb-24 sm:px-6 sm:pt-10 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <DiscoverTabs current="resources" />
        <div className="mt-12 mb-10 text-center sm:mt-16 sm:mb-12">
          <TypedTitle text="Worth your time." caret className={pageTitle} />
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-balance text-gray-500 dark:text-neutral-400">
            Picked by{" "}
            <a
              href="https://antislop.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gray-700 underline-offset-4 hover:underline dark:text-neutral-200"
            >
              antislop
            </a>
            : essays, talks and videos for founders, and for getting better at life.
          </p>
          <form
            autoComplete="off"
            role="search"
            onSubmit={(e) => e.preventDefault()}
            className="relative mx-auto mt-6 w-full max-w-lg"
          >
            <input
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(PAGE);
              }}
              enterKeyHint="search"
              placeholder="Search titles and authors…"
              aria-label="Search resources"
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

        {resources === null ? (
          <p className="py-16 text-center text-sm text-gray-500 dark:text-neutral-400">
            antislop&apos;s picks aren&apos;t loading right now. Try again in a minute.
          </p>
        ) : (
          <>
            <div className="no-scrollbar -mx-4 mb-8 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:justify-center sm:px-0">
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => {
                    setKind(k.key);
                    setLimit(PAGE);
                  }}
                  aria-pressed={kind === k.key}
                  className={cn(pill, kind === k.key ? pillActive : pillIdle)}
                >
                  {k.label}
                  <span className="font-medium tabular-nums opacity-60">{counts[k.key]}</span>
                </button>
              ))}
            </div>
            {list.length === 0 ? (
              <p className="py-16 text-center text-sm text-gray-500 dark:text-neutral-400">
                Nothing matches &ldquo;{q.trim()}&rdquo;.
              </p>
            ) : (
              <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {list.slice(0, limit).map((r, i) => (
                  <ResourceCard key={r.id} r={r} priority={i < 4} />
                ))}
              </div>
            )}
            {more && <div ref={sentinel} aria-hidden className="h-px w-full" />}
          </>
        )}
      </div>
    </div>
  );
}
