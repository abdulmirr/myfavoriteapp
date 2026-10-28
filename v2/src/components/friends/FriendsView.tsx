"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FriendGroup, FriendWork } from "@/lib/data";
import type { Profile, Work } from "@/lib/types";
import { useViewer } from "@/lib/viewer";
import { aWork, isRecent, itemHref, timeAgo } from "@/lib/work";
import { TypedTitle } from "../Typewriter";
import WorkRow, { WorkRowSkeleton } from "../WorkRow";
import Avatar from "../ui/Avatar";
import InviteButton from "./InviteButton";
import { NotificationRow, Reach, useNotifications } from "./FriendNotifications";
import PeopleToFollow, { useDiscover } from "./PeopleToFollow";
import { cn, inlineLink, pageTitle, primaryButton } from "../ui/styles";

type Page = { groups: FriendGroup[]; hasMore: boolean };

const cacheKey = (pid: string) => `fav2:friends:${pid}`;

function readCache(pid: string): Page | null {
  try {
    const raw = localStorage.getItem(cacheKey(pid));
    return raw ? (JSON.parse(raw) as Page) : null;
  } catch {
    return null;
  }
}

function writeCache(pid: string, p: Page) {
  try {
    localStorage.setItem(cacheKey(pid), JSON.stringify(p));
  } catch {}
}

async function fetchPage(pid: string, offset: number): Promise<Page> {
  const res = await fetch(`/api/friends?viewer=${pid}&offset=${offset}`);
  if (!res.ok) throw new Error("friends unavailable");
  const json = (await res.json()) as Partial<Page>;
  return { groups: json.groups ?? [], hasMore: !!json.hasMore };
}

const groupKey = (g: FriendGroup) => `${g.who.id}:${g.kind}:${g.list?.id ?? ""}:${g.day}`;

function toWork(it: FriendWork, kind: FriendGroup["kind"]): Work {
  return {
    media_type: it.media_type,
    title: it.title,
    creator: it.creator,
    image_url: it.image_url,
    view_url: it.view_url,
    year: it.metadata?.year != null ? String(it.metadata.year) : null,
    canonical_id: it.canonical_id,
    metadata: it.metadata,
    // favoriting a friend's favorite credits them ("via @…") — and tells them
    ...(kind === "favorite" ? { source_item_id: it.id, source_profile_id: it.profile_id } : {}),
  };
}

/** "Sam favorited an album", "Jo added 3 to Summer reads", "Ali made a new list, Films for Sundays". */
function Verb({ g }: { g: FriendGroup }) {
  const first = g.items[0];
  if (g.kind === "favorite") {
    return <>favorited {g.n === 1 && first ? aWork(first) : `${g.n} things`}</>;
  }
  const list = g.list ? (
    <Link href={`/${g.who.username}/lists/${g.list.slug}`} className={inlineLink}>
      {g.list.title}
    </Link>
  ) : (
    "a list"
  );
  if (g.list && g.list.created_at.slice(0, 10) === g.day) return <>made a new list, {list}</>;
  return g.n === 1 && first ? (
    <>
      saved {aWork(first)} to {list}
    </>
  ) : (
    <>
      added {g.n} to {list}
    </>
  );
}

/** One person's burst: who and when, then their works under the hairline. */
function Group({ g, priority }: { g: FriendGroup; priority: boolean }) {
  const name = g.who.display_name || `@${g.who.username}`;
  const more = g.n - g.items.length;
  return (
    <article>
      <header className="flex items-center gap-3">
        <Link href={`/${g.who.username}`} aria-label={name} className="shrink-0 rounded-[30%] transition-opacity hover:opacity-85">
          <Avatar p={g.who} className="size-9" />
        </Link>
        <p className="min-w-0 flex-1 text-sm leading-snug text-gray-500 dark:text-neutral-400">
          <Link href={`/${g.who.username}`} className="font-semibold text-gray-900 hover:underline dark:text-neutral-100">
            {name}
          </Link>{" "}
          <Verb g={g} />
        </p>
        <time dateTime={g.last_at} className="shrink-0 text-xs text-gray-400 tabular-nums dark:text-neutral-500">
          {timeAgo(g.last_at)}
        </time>
      </header>
      <div className="mt-1.5 ml-[17px] border-l border-gray-200 pl-1.5 sm:pl-3 dark:border-neutral-800">
        {g.items.map((it, i) => {
          const internal =
            g.kind === "favorite"
              ? itemHref({ canonical_id: it.canonical_id, item_id: it.id }, g.who.username)
              : it.canonical_id
                ? itemHref({ canonical_id: it.canonical_id })
                : null;
          return (
            <WorkRow
              key={it.id}
              work={toWork(it, g.kind)}
              href={internal ?? it.view_url}
              external={!internal}
              note={it.note}
              priority={priority && i < 2}
            />
          );
        })}
        {more > 0 && (
          <Link
            href={g.kind === "save" && g.list ? `/${g.who.username}/lists/${g.list.slug}` : `/${g.who.username}`}
            className="ml-2 inline-flex h-8 items-center rounded-lg px-1 text-sm font-semibold text-gray-500 hover:text-gray-900 sm:ml-3 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            + {more} more
          </Link>
        )}
      </div>
    </article>
  );
}

/** The people you follow, as faces — gold rings on whoever's been active in the last three days. */
function YourPeople({ people, lastSeen }: { people: Profile[]; lastSeen: Map<string, string> }) {
  const sorted = [...people].sort((a, b) => {
    const la = lastSeen.get(a.id) ?? "";
    const lb = lastSeen.get(b.id) ?? "";
    if (la !== lb) return la < lb ? 1 : -1;
    return (a.display_name || a.username).localeCompare(b.display_name || b.username);
  });
  return (
    <section aria-label="Your people" className="mb-10">
      <h2 className="px-1 text-sm font-semibold tracking-tight text-gray-900 dark:text-neutral-100">
        Your people <span className="font-medium text-gray-500 tabular-nums dark:text-neutral-400">{people.length}</span>
      </h2>
      <ul className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {sorted.map((p) => {
          const active = isRecent(lastSeen.get(p.id));
          return (
            <li key={p.id} className="w-[68px] shrink-0">
              <Link href={`/${p.username}`} className="group flex flex-col items-center gap-1.5 outline-none">
                <span
                  className={cn(
                    "rounded-[32%] p-[2.5px] transition-transform group-hover:-translate-y-0.5",
                    active ? "bg-gradient-to-tr from-[#f7a71e] to-[#ffd36e]" : "bg-transparent"
                  )}
                >
                  <Avatar p={p} className="size-14 ring-2 ring-gray-100 group-focus-visible:ring-gray-900 dark:ring-neutral-900" />
                </span>
                <span className="w-full truncate text-center text-xs text-gray-600 group-hover:text-gray-900 dark:text-neutral-400 dark:group-hover:text-neutral-100">
                  {p.display_name?.split(" ")[0] || p.username}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Friends: Discover is for finding things, this is your people. One
 * timeline — what the people you follow favorited and saved (grouped, so a
 * bulk import is one line) and what happened to you (follows, favorites from
 * your wall, taste approvals) — plus people with your taste, your reach, and
 * the invite button.
 */
export default function FriendsView() {
  const v = useViewer();
  const pid = v.status === "signed-in" ? (v.profile?.id ?? null) : null;
  const [fetched, setFetched] = useState<{ pid: string; page: Page } | null>(null);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const notifications = useNotifications();
  const discover = useDiscover();

  // a returning visit paints the last page at once; the network catches up
  const cached = useMemo(() => (pid ? readCache(pid) : null), [pid]);
  const page = fetched && fetched.pid === pid ? fetched.page : cached;

  useEffect(() => {
    if (!pid) return;
    let stale = false;
    fetchPage(pid, 0)
      .then((p) => {
        if (stale) return;
        setFetched({ pid, page: p });
        setError(false);
        writeCache(pid, p);
      })
      .catch(() => !stale && setError(true));
    return () => {
      stale = true;
    };
  }, [pid]);

  const loadMore = useCallback(async () => {
    if (!pid || !page?.hasMore || loadingMore || !fetched) return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(pid, page.groups.length);
      setFetched((f) => {
        if (!f || f.pid !== pid) return f;
        const seen = new Set(f.page.groups.map(groupKey));
        return { pid, page: { groups: [...f.page.groups, ...next.groups.filter((g) => !seen.has(groupKey(g)))], hasMore: next.hasMore } };
      });
    } catch {
      /* the sentinel tries again on the next scroll */
    } finally {
      setLoadingMore(false);
    }
  }, [pid, page, loadingMore, fetched]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !page?.hasMore) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void loadMore(), { rootMargin: "700px" });
    io.observe(el);
    return () => io.disconnect();
  }, [page, loadMore]);

  const lastSeen = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of page?.groups ?? []) if (!m.has(g.who.id) || m.get(g.who.id)! < g.last_at) m.set(g.who.id, g.last_at);
    return m;
  }, [page]);

  if (v.status === "signed-out") {
    return (
      <div className="px-4 pt-16 pb-20 text-center sm:pt-24">
        <h1 className={pageTitle}>Your friends, on Favorite.</h1>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-gray-500 dark:text-neutral-400">
          See what the people you follow are into — what they love, what they&apos;re saving — and who&apos;s noticing you.
        </p>
        <Link href="/signin?next=%2Ffriends" className={cn(primaryButton, "mt-7 px-5")}>
          Log in or sign up
        </Link>
      </div>
    );
  }

  const following = v.following;
  const groups = page?.groups ?? null;
  const notes = notifications.list;
  const alone = following.length === 0 && !v.stale && v.status === "signed-in";

  // one timeline, newest first: what your people did and what happened to
  // you. While more of their activity can load, a notification older than
  // the last loaded entry waits its turn, so the order never jumps.
  const floor = !alone && page?.hasMore && groups?.length ? Date.parse(groups[groups.length - 1].last_at) : -Infinity;
  const entries = [
    ...(alone ? [] : (groups ?? [])).map((g, i) => ({
      at: Date.parse(g.last_at),
      key: `g:${groupKey(g)}`,
      node: <Group g={g} priority={i < 3} />,
    })),
    ...(notes ?? [])
      .filter((n) => Date.parse(n.created_at) >= floor)
      .map((n) => ({ at: Date.parse(n.created_at), key: `n:${n.id}`, node: <NotificationRow n={n} data={notifications} /> })),
  ].sort((a, b) => b.at - a.at);
  const loading = !pid || notes === null || (!alone && !groups);

  const timeline =
    error && !groups && !alone ? (
      <p className="py-12 text-center text-sm text-red-600 dark:text-red-400">Couldn&apos;t load your friends. Refresh to try again.</p>
    ) : loading ? (
      <div className="flex flex-col gap-2" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <WorkRowSkeleton key={i} />
        ))}
      </div>
    ) : entries.length === 0 ? (
      alone ? null : (
        <p className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm leading-relaxed text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
          Quiet so far. When the people you follow favorite or save something, it lands here.
        </p>
      )
    ) : (
      <div className="flex flex-col gap-8">
        {entries.map((e) => (
          <div key={e.key}>{e.node}</div>
        ))}
        {!alone && page?.hasMore && <div ref={sentinel} aria-hidden className="h-px w-full" />}
        {loadingMore && <p className="py-4 text-center text-sm text-gray-500 dark:text-neutral-400">Loading more…</p>}
      </div>
    );
  const reach = notifications.reach && notifications.reach.pieces > 0 && (
    <div className="border-t border-gray-200 pt-3.5 dark:border-neutral-800">
      <Reach reach={notifications.reach} />
    </div>
  );

  return (
    <div className="px-4 pt-12 pb-20 sm:px-6 sm:pt-16 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* a block, not a flex column: the title measures its own width to fit phones */}
        <div className="mb-10 text-center sm:mb-14">
          <TypedTitle text="What are your friends into?" caret className={pageTitle} />
          <InviteButton className="mt-5 sm:mt-6" />
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
          <div className="min-w-0">
            {following.length > 0 && <YourPeople people={following} lastSeen={lastSeen} />}
            {alone && (
              <>
                <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center dark:border-neutral-700">
                  <p className="text-base font-semibold text-gray-900 dark:text-neutral-100">You&apos;re not following anyone yet.</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-gray-500 dark:text-neutral-400">
                    Follow a few people and what they love and save shows up here. Or bring your friends with you.
                  </p>
                </div>
                {/* on phones, the people to follow come right after — that's the next step */}
                <div className="mt-10 lg:hidden">
                  <PeopleToFollow people={discover} />
                </div>
              </>
            )}
            <section aria-label="Latest" className={cn(alone && entries.length > 0 && "mt-12")}>
              {entries.length > 0 && (
                <h2 className="mb-4 px-1 text-sm font-semibold tracking-tight text-gray-900 dark:text-neutral-100">Latest</h2>
              )}
              {timeline}
            </section>
            <div className="mt-12 flex flex-col gap-10 lg:hidden">
              {!alone && <PeopleToFollow people={discover} />}
              {reach}
            </div>
          </div>
          <aside className="hidden lg:flex lg:flex-col lg:gap-10">
            <PeopleToFollow people={discover} />
            {reach}
          </aside>
        </div>
      </div>
    </div>
  );
}
