"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Resource, ResourceKind } from "@/lib/resources";
import { TOPICS, type Topic } from "@/lib/resource-topics";
import type { Work } from "@/lib/types";
import { TitleCard } from "../Cover";
import { TypedTitle } from "../Typewriter";
import { CardActions } from "../WorkCard";
import { cn, mediaBox, newBadge, pageTitle, pill, pillActive, pillIdle } from "../ui/styles";
import DiscoverTabs from "./DiscoverTabs";

const KINDS: { key: "all" | ResourceKind; label: string }[] = [
  { key: "all", label: "All formats" },
  { key: "essays", label: "Essays" },
  { key: "talks", label: "Talks" },
  { key: "videos", label: "Videos" },
  { key: "tweets", label: "Tweets" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const when = (d: string | null) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "");
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
const PAGE = 24;

/**
 * An image that fails says so — including one that failed before the page
 * woke up to listen (its error event has already gone by).
 */
function useBroken(): [boolean, (img: HTMLImageElement | null) => void, () => void] {
  const [broken, setBroken] = useState(false);
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setBroken(true);
  }, []);
  return [broken, ref, () => setBroken(true)];
}

/** The picture, or antislop's black title card when there's none (or it won't load). */
function Media({ r, priority }: { r: Resource; priority: boolean }) {
  const [broken, ref, fail] = useBroken();
  if (!r.image_url || broken) return <TitleCard title={r.title} creator={r.creator} badge={r.fresh} />;
  return (
    <div className={cn(mediaBox, "aspect-video")}>
      {r.fresh && <span className={newBadge}>New</span>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={r.image_url}
        alt=""
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onError={fail}
        className="absolute inset-0 size-full object-cover transition-opacity group-hover/resource:opacity-90"
      />
    </div>
  );
}

/** A tweet, as the quote it is: who said it (their initial when the picture's gone), then the words. */
function Quote({ r }: { r: Resource }) {
  const t = r.tweet!;
  const [broken, ref, fail] = useBroken();
  return (
    <div className="relative flex aspect-video flex-col overflow-hidden rounded-md border border-gray-200 bg-white p-4 transition-colors group-hover/resource:border-gray-300 dark:border-neutral-700/60 dark:bg-neutral-800 dark:group-hover/resource:border-neutral-600">
      {r.fresh && <span className={newBadge}>New</span>}
      <div className="flex items-center gap-2.5">
        {t.avatar && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={ref}
            src={t.avatar}
            alt=""
            loading="lazy"
            onError={fail}
            className="size-8 shrink-0 rounded-full bg-gray-200 object-cover dark:bg-neutral-700"
          />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600 dark:bg-neutral-700 dark:text-neutral-300">
            {(r.creator || t.handle || "?").trim().charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-semibold text-gray-900 dark:text-neutral-100">{r.creator}</span>
          {t.handle && <span className="block truncate text-xs text-gray-500 dark:text-neutral-400">@{t.handle}</span>}
        </span>
      </div>
      <p className="mt-3 line-clamp-4 text-[15px] leading-snug whitespace-pre-line text-gray-900 dark:text-neutral-100">{t.text}</p>
    </div>
  );
}

/** One resource: it opens where it lives; 🔖 ★ keep it on Favorite. A tweet's words are its picture. */
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
      {r.tweet ? (
        <a
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${r.creator}: ${r.tweet.text}`}
          className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-neutral-400"
        >
          <Quote r={r} />
        </a>
      ) : (
        <>
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
        </>
      )}
      <div className={cn("flex items-end justify-between gap-3", r.tweet ? "mt-3" : "mt-1")}>
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
 * Discover → Resources: antislop's whole archive — essays, talks, videos and
 * tweets — newest pick first. Browse it by what it's about (each topic counts
 * what's in it in the chosen format), then narrow by format, or search titles,
 * authors and what the tweets say. All of it arrives with the page; the grid
 * grows as you scroll.
 */
export default function ResourcesView({ resources }: { resources: Resource[] | null }) {
  const [topic, setTopic] = useState<"all" | Topic>("all");
  const [kind, setKind] = useState<"all" | ResourceKind>("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  const all = resources ?? [];
  const about = (r: Resource, t: "all" | Topic) => t === "all" || r.topics.includes(t);
  const shaped = (r: Resource, k: "all" | ResourceKind) => k === "all" || r.kind === k;
  const term = fold(q.trim());
  const list = all.filter(
    (r) =>
      about(r, topic) &&
      shaped(r, kind) &&
      (!term || fold(`${r.title} ${r.creator} ${r.tweet?.text ?? ""} ${r.tweet?.handle ?? ""}`).includes(term))
  );
  const topicCount = (t: "all" | Topic) => all.filter((r) => about(r, t) && shaped(r, kind)).length;
  const kindCount = (k: "all" | ResourceKind) => all.filter((r) => about(r, topic) && shaped(r, k)).length;
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
            Some of the greatest resources on the internet
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
            Resources aren&apos;t loading right now. Try again in a minute.
          </p>
        ) : (
          <>
            {/* what it's about — scrolls sideways on a phone; wraps in even rows above that, one from xl */}
            <div
              role="group"
              aria-label="Topic"
              className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-auto sm:max-w-[720px] sm:flex-wrap sm:justify-center sm:px-0 xl:max-w-none"
            >
              {(["all", ...TOPICS] as const).map((t) => {
                const n = topicCount(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTopic(t);
                      setLimit(PAGE);
                    }}
                    aria-pressed={topic === t}
                    disabled={!n && topic !== t}
                    className={cn(pill, topic === t ? pillActive : pillIdle, "disabled:cursor-default disabled:opacity-40")}
                  >
                    {t === "all" ? "All" : t}
                    <span className="font-medium tabular-nums opacity-60">{n}</span>
                  </button>
                );
              })}
            </div>
            {/* …then the format, quieter */}
            <div role="group" aria-label="Format" className="mt-4 mb-8 flex justify-center gap-5">
              {KINDS.map((k) => {
                const on = kind === k.key;
                return (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => {
                      setKind(k.key);
                      setLimit(PAGE);
                    }}
                    aria-pressed={on}
                    disabled={!on && !kindCount(k.key)}
                    className={cn(
                      "cursor-pointer rounded-sm text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-default disabled:opacity-40 dark:focus-visible:ring-neutral-400",
                      on
                        ? "text-gray-900 dark:text-neutral-100"
                        : "text-gray-400 hover:text-gray-700 disabled:hover:text-gray-400 dark:text-neutral-500 dark:hover:text-neutral-200 dark:disabled:hover:text-neutral-500"
                    )}
                  >
                    {k.label}
                  </button>
                );
              })}
            </div>
            {list.length === 0 ? (
              <p className="py-16 text-center text-sm text-gray-500 dark:text-neutral-400">
                {term ? <>Nothing matches &ldquo;{q.trim()}&rdquo;.</> : "Nothing here yet."}
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
