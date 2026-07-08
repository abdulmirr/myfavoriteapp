"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Item, Profile, Recommendation } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { fetchFollowing, fetchSuggestions, itemKeys } from "@/lib/social";
import { playSfx, playUi, preloadSfx } from "@/lib/sfx";
import dynamic from "next/dynamic";
import AppShell from "./AppShell";
import DetailOverlay from "./DetailOverlay";
import SearchBar, { resultToItem, TYPE_TAG, type FeedItem } from "./SearchBar";
import { TileMedia } from "./Tile";

// visitors-only (and framer-motion-heavy) — keep it out of the signed-in bundle
const Landing = dynamic(() => import("./Landing"));

type Tab = "foryou" | "following";

// stable identity so DetailOverlay's data effect doesn't re-fire every parent
// render while `friends` is still loading (null)
const NO_FOLLOWING: Profile[] = [];

function shortDate(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

/** "favorited a …" phrases for the feed — with the right article. */
const FAVORITED_PHRASE: Record<string, string> = {
  book: "a book", movie: "a film", tv: "a show", music: "some music",
  podcast: "a podcast", video: "a video", article: "an article",
  photo: "a photo", other: "something",
};

/** For You sections. Cards are square tiles like the library grid. */
const REC_SECTIONS: { label: string; types: string[] }[] = [
  { label: "Music", types: ["music"] },
  { label: "Books", types: ["book"] },
  { label: "Film & TV", types: ["movie", "tv"] },
  { label: "Reading", types: ["article", "other", "podcast"] },
];

/** A weekly pick shaped as a library Item so TileMedia frames it like the library. */
function recToItem(rec: Recommendation): Item {
  return {
    id: `rec-${rec.media_type}-${rec.title}`,
    profile_id: "",
    media_type: rec.media_type,
    title: rec.title,
    creator: rec.creator,
    description: "",
    image_url: rec.image_url,
    view_url: rec.view_url,
    metadata: rec.year ? { year: rec.year } : {},
    canonical_id: null,
    pinned_order: null,
    sort_order: 0,
    pos_x: null,
    pos_y: null,
    pos_rot: null,
    created_at: "",
  };
}

export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [viewer, setViewer] = useState<Profile | null>(null);
  // null = still checking; new owners are routed to /welcome before the feed shows
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("foryou");
  const [mounted, setMounted] = useState(false);
  // null = still loading; [] = follows nobody (FollowingFeed needs the difference)
  const [friends, setFriends] = useState<Profile[] | null>(null);
  const [quick, setQuick] = useState<{ item: Item; rect: DOMRect; favoriting?: boolean } | null>(
    null
  );
  // favorites made inside the overlay, so open feed rows flip to "Favorited"
  const [overlaySaved, setOverlaySaved] = useState<string[]>([]);
  useEffect(() => preloadSfx(), []);

  useEffect(() => {
    setMounted(true);
    const db = supabase();
    db.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    const { data: sub } = db.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const db = supabase();
      // the claim trigger runs on email confirm — brief retry covers the race.
      // profile_private rides along as an embed: one round trip, not two.
      type PrivRow = { onboarded_at: string | null };
      type ProfRow = Profile & { profile_private?: PrivRow | PrivRow[] | null };
      let prof: ProfRow | null = null;
      let profErr = false;
      for (let i = 0; i < 5 && !cancelled; i++) {
        const { data, error } = await db
          .from("profiles")
          .select(
            "id, user_id, username, display_name, bio, avatar_url, socials, profile_private(onboarded_at)"
          )
          .eq("user_id", userId)
          .maybeSingle();
        profErr = !!error;
        if (data) {
          prof = data as unknown as ProfRow;
          break;
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      if (cancelled) return;
      setViewer(prof ? ({ ...prof, profile_private: undefined } as Profile) : null);
      if (!prof) {
        // still no profile row — render the feed rather than trapping them
        setOnboarded(true);
        return;
      }
      // PostgREST returns an object for this one-to-one embed, but the
      // client's types say array — accept both shapes
      const priv = Array.isArray(prof.profile_private)
        ? prof.profile_private[0]
        : prof.profile_private;
      // a failed read must NOT bounce an onboarded user into /welcome
      if (profErr || priv?.onboarded_at) setOnboarded(true);
      else router.replace("/welcome");
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, router]);

  // who the viewer follows, so a Discover piece can show "Favorited by …"
  useEffect(() => {
    if (!viewer) return;
    fetchFollowing(viewer.id).then(setFriends);
  }, [viewer]);

  // session unknown, or onboarding status still resolving: blank so signed-in
  // users never flash the landing page (or the feed before a /welcome redirect)
  if (userId === undefined || (userId && onboarded !== true)) {
    return <div className="min-h-screen bg-white" />;
  }

  // the home feed is for signed-in users; visitors get the landing page
  if (userId === null) {
    return <Landing />;
  }

  return (
    <AppShell viewer={viewer} signedIn>
      <div
        className={`bg-white transition-opacity duration-700 ease-out ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
      >
        <header className="sticky top-14 z-20 bg-white/85 backdrop-blur md:top-0">
          <div className="mx-auto grid max-w-4xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-5 sm:px-8">
            <div className="min-w-0">
              <SearchBar
                onPick={(r, rect) => {
                  const item = resultToItem(r);
                  playSfx(item.media_type);
                  setQuick({ item, rect });
                }}
              />
            </div>

            <nav className="flex gap-6 text-xs">
              {(
                [
                  { key: "foryou", label: "For You" },
                  { key: "following", label: "Following" },
                ] as { key: Tab; label: string }[]
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`cursor-pointer transition-colors ${
                    tab === t.key ? "font-medium text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {/* right column balances the grid so the tabs stay centered */}
            <div />
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-5 pb-24 pt-6 sm:px-8">
          {tab === "foryou" ? (
            <ForYou viewer={viewer} />
          ) : (
            <FollowingFeed
              viewer={viewer}
              friends={friends}
              onOpen={(item, rect, favoriting) => setQuick({ item, rect, favoriting })}
              overlaySaved={overlaySaved}
            />
          )}
        </main>

        {quick && (
          <DetailOverlay
            item={quick.item}
            sourceRect={quick.rect}
            getSourceRect={() => null}
            isOwner={false}
            viewerProfile={viewer}
            viewerFollowing={friends ?? NO_FOLLOWING}
            onCloseStart={() => {}}
            onClose={() => setQuick(null)}
            onSave={async () => {}}
            onDelete={async () => {}}
            onFavorited={(it) => setOverlaySaved((prev) => [...prev, ...itemKeys(it)])}
            startFavoriting={quick.favoriting}
          />
        )}
      </div>
    </AppShell>
  );
}

/* ── For You: weekly AI picks, one section per category ────────────────────── */

function ForYou({ viewer }: { viewer: Profile | null }) {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    const run = async (attempt: number) => {
      setState("loading");
      try {
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("no session");
        const res = await fetch("/api/recommendations", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 202) {
          // another request is generating this week's picks — check back a few
          // times, then stop (each retry spends recs budget). The attempt count
          // travels as an argument so a manual "Try again" starts fresh.
          if (attempt < 3) {
            retryTimer.current = setTimeout(() => run(attempt + 1), 5000);
            return;
          }
          throw new Error("202");
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as {
          recommendations: Recommendation[];
          empty?: boolean;
        };
        if (json.empty || !json.recommendations.length) {
          setState("empty");
        } else {
          setRecs(json.recommendations);
          setState("ready");
        }
      } catch {
        setState("error");
      }
    };
    run(0);
  }, []);

  useEffect(() => {
    load();
    // a pending 202 retry must not fire into an unmounted tab (it would also
    // spend recs budget for nothing)
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [load]);

  return (
    <section>
      <div className="mb-12 flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold leading-snug tracking-tight text-zinc-900">
          For you
        </h1>
        <p className="text-xs text-zinc-400">New picks every Monday, drawn from your library.</p>
      </div>

      {state === "loading" && (
        <p className="pt-12 text-center text-xs text-zinc-400 [animation:smart-search-wave_1.6s_ease-in-out_infinite]">
          Curating your week — the first load takes a minute…
        </p>
      )}

      {state === "empty" && (
        <div className="flex flex-col gap-2 pt-2">
          <p className="text-xs leading-relaxed text-zinc-400">
            Nothing to go on yet — picks are drawn from what you save. Add a few favorites{" "}
            {viewer ? (
              <Link href={`/${viewer.username}`} className="text-zinc-900 hover:text-zinc-400">
                in your library
              </Link>
            ) : (
              "in your library"
            )}
            , or{" "}
            <Link href="/profile" className="text-zinc-900 hover:text-zinc-400">
              import from Goodreads or Letterboxd
            </Link>{" "}
            to bring your history with you.
          </p>
          <Suggestions viewer={viewer} lead="Meanwhile, some libraries worth a look:" />
        </div>
      )}

      {state === "error" && (
        <p className="pt-12 text-center text-xs text-zinc-400">
          Couldn’t load your picks.{" "}
          <button onClick={() => load()} className="cursor-pointer text-zinc-900 hover:text-zinc-400">
            Try again
          </button>
        </p>
      )}

      {state === "ready" && (
        <div className="flex flex-col gap-14">
          {REC_SECTIONS.map((section) => {
            const picks = recs.filter((r) => section.types.includes(r.media_type));
            if (!picks.length) return null;
            return (
              <div key={section.label}>
                <h2 className="mb-5 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                  {section.label}
                </h2>
                <div className="hover-fx grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
                  {picks.map((r, i) => (
                    <FlipCard key={`${r.title}-${i}`} rec={r} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </section>
  );
}


/** Cover that flips over to reveal why it was recommended. */
function FlipCard({ rec }: { rec: Recommendation }) {
  const [flipped, setFlipped] = useState(false);

  // same object-on-a-wall treatment as the library grid: vinyl sleeve for
  // music, fore-edge pages for books, snap frame for film/tv
  const cover = <TileMedia item={recToItem(rec)} />;

  return (
    <article className="item-tile">
      <div className="relative aspect-square w-full" style={{ perspective: "1200px" }}>
        <div
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            transition: "transform 0.45s var(--ease-morph)",
            transform: flipped ? "rotateY(180deg)" : "none",
          }}
        >
          {/* front: the cover */}
          <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
            {rec.view_url && !flipped ? (
              <a
                href={rec.view_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full w-full"
              >
                {cover}
              </a>
            ) : (
              cover
            )}
          </div>
          {/* back: the reason */}
          <div
            className="absolute inset-0 flex items-center overflow-y-auto bg-zinc-100 p-4 sm:p-5"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <p className="text-[11px] leading-relaxed text-zinc-500 sm:text-xs">{rec.reason}</p>
          </div>
        </div>
      </div>

      <h3 className="mt-3 truncate text-[13px] leading-snug tracking-[-0.01em] text-zinc-900">
        {rec.title}
      </h3>
      {rec.creator && <p className="truncate text-xs text-zinc-400">{rec.creator}</p>}
      <button
        onClick={() => setFlipped((f) => !f)}
        className={`mt-1.5 cursor-pointer text-[10px] uppercase tracking-[0.08em] transition-colors ${
          flipped ? "text-zinc-900 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-900"
        }`}
      >
        {flipped ? "← back" : "why?"}
      </button>
    </article>
  );
}

/* ── Following: latest saves from people you follow ────────────────────────── */

/**
 * Hands the invite text to Messages on Apple devices (sms: opens
 * Messages.app on macOS too), the share sheet on other phones, and
 * falls back to copying the message elsewhere.
 */
function InviteFriendButton() {
  const [copied, setCopied] = useState(false);

  const invite = async () => {
    const text = `been putting all my favorite movies + music into this app. make yours, i'll show you mine ${window.location.origin}`;
    if (/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)) {
      window.location.href = `sms:&body=${encodeURIComponent(text)}`;
      return;
    }
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <button
      onClick={invite}
      className={`shrink-0 cursor-pointer text-xs transition-colors ${
        copied ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
      }`}
    >
      {copied ? "Invite copied ✓" : "+ Invite a friend"}
    </button>
  );
}

/** consecutive same-day saves by the same friend, rendered as one visit */
type FeedGroup = { profile: Profile; day: string; items: FeedItem[] };

const FEED_PAGE = 40;

function FollowingFeed({
  viewer,
  friends,
  onOpen,
  overlaySaved,
}: {
  viewer: Profile | null;
  friends: Profile[] | null;
  onOpen: (item: Item, rect: DOMRect, favoriting?: boolean) => void;
  overlaySaved: string[];
}) {
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [followCount, setFollowCount] = useState<number | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string> | null>(null);
  const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());
  const [followeeIds, setFolloweeIds] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // keyset cursor: bulk "Favorite all" inserts share one created_at, so paging
  // on timestamp alone silently drops rows that straddle a page boundary —
  // page on (created_at, id) instead
  const cursor = useRef<{ ts: string; id: string } | null>(null);

  useEffect(() => {
    // Home already fetched who the viewer follows (profiles included) —
    // reuse it instead of re-querying follows + profiles here
    if (!viewer || friends === null) return;
    const db = supabase();
    let cancelled = false;
    (async () => {
      const ids = friends.map((f) => f.id);
      setFollowCount(ids.length);
      setFolloweeIds(ids);
      if (!ids.length) {
        setFeed([]);
        return;
      }
      const [itemsRes, mineRes] = await Promise.all([
        db
          .from("items")
          .select("*")
          .in("profile_id", ids)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(FEED_PAGE),
        db.from("items").select("media_type, title, canonical_id").eq("profile_id", viewer.id),
      ]);
      if (cancelled) return;
      if (itemsRes.error) {
        setError(true);
        return;
      }
      const byId = new Map(friends.map((p) => [p.id, p]));
      setProfileMap(byId);
      const rowsTyped = (itemsRes.data ?? []) as Item[];
      const last = rowsTyped[rowsTyped.length - 1];
      cursor.current = last ? { ts: last.created_at, id: last.id } : null;
      setFeed(
        rowsTyped.filter((i) => byId.has(i.profile_id)).map((i) => ({ ...i, profile: byId.get(i.profile_id)! }))
      );
      setHasMore(rowsTyped.length === FEED_PAGE);
      setSavedKeys(
        new Set(
          ((mineRes.data ?? []) as Pick<Item, "media_type" | "title" | "canonical_id">[]).flatMap(itemKeys)
        )
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [viewer, friends, reloadKey]);

  const loadMore = async () => {
    const cur = cursor.current;
    if (!cur || loadingMore) return;
    setLoadingMore(true);
    const { data: items, error: pageErr } = await supabase()
      .from("items")
      .select("*")
      .in("profile_id", followeeIds)
      // strictly older by (created_at, id): older timestamp, or same timestamp
      // with a smaller id — no shared-timestamp rows lost, no duplicates
      .or(`created_at.lt.${cur.ts},and(created_at.eq.${cur.ts},id.lt.${cur.id})`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(FEED_PAGE);
    if (pageErr) {
      // keep the button so the user can retry rather than silently dead-ending
      setLoadingMore(false);
      return;
    }
    const rows = (items ?? []) as Item[];
    const last = rows[rows.length - 1];
    if (last) cursor.current = { ts: last.created_at, id: last.id };
    setFeed((prev) => [
      ...(prev ?? []),
      ...rows
        .filter((i) => profileMap.has(i.profile_id))
        .map((i) => ({ ...i, profile: profileMap.get(i.profile_id)! })),
    ]);
    setHasMore(rows.length === FEED_PAGE);
    setLoadingMore(false);
  };

  // fold the flat feed into per-friend, per-day groups (feed is newest-first);
  // memoized so unrelated re-renders (overlay opens etc.) skip the regroup
  const groups: FeedGroup[] = useMemo(() => {
    const out: FeedGroup[] = [];
    for (const it of feed ?? []) {
      const day = it.created_at.slice(0, 10);
      const last = out[out.length - 1];
      if (last && last.profile.id === it.profile_id && last.day === day) last.items.push(it);
      else out.push({ profile: it.profile, day, items: [it] });
    }
    return out;
  }, [feed]);
  const overlaySavedSet = useMemo(() => new Set(overlaySaved), [overlaySaved]);

  return (
    <section>
      <div className="mb-10 flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold leading-snug tracking-tight text-zinc-900">
            Following
          </h1>
          <p className="text-xs text-zinc-400">What the people you follow are favoriting.</p>
        </div>
        <InviteFriendButton />
      </div>

      {error ? (
        <div className="pt-12 text-center">
          <p className="text-xs text-zinc-400">Couldn’t load your feed.</p>
          <button
            onClick={() => {
              setError(false);
              setFeed(null);
              setReloadKey((k) => k + 1);
            }}
            className="mt-3 cursor-pointer text-xs text-zinc-900 underline underline-offset-2 transition-colors hover:text-zinc-500"
          >
            Try again
          </button>
        </div>
      ) : feed === null ? (
        <p className="pt-12 text-center text-xs text-zinc-400 [animation:smart-search-wave_1.6s_ease-in-out_infinite]">
          Loading…
        </p>
      ) : followCount === 0 ? (
        <Suggestions viewer={viewer} />
      ) : feed.length === 0 ? (
        <p className="pt-12 text-center text-xs text-zinc-400">
          The people you follow haven’t favorited anything yet.
        </p>
      ) : (
        <div className="flex flex-col gap-14">
          {groups.map((group) => (
            <section key={`${group.profile.id}-${group.day}-${group.items[0].id}`}>
              {/* who + when — once per visit, not once per item */}
              <div className="flex items-center gap-3">
                <Link
                  href={`/${group.profile.username}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden bg-zinc-100 transition-opacity hover:opacity-80"
                >
                  {group.profile.avatar_url ? (
                    <img
                      src={group.profile.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-zinc-300">
                      {(group.profile.display_name || group.profile.username).slice(0, 1)}
                    </span>
                  )}
                </Link>
                <p className="min-w-0 flex-1 truncate text-xs text-zinc-400">
                  <Link
                    href={`/${group.profile.username}`}
                    className="text-[13px] font-medium text-zinc-900 transition-colors hover:text-zinc-400"
                  >
                    {group.profile.display_name || `@${group.profile.username}`}
                  </Link>{" "}
                  favorited{" "}
                  {group.items.length === 1
                    ? FAVORITED_PHRASE[group.items[0].media_type] ?? `a ${group.items[0].media_type}`
                    : `${group.items.length} pieces`}
                </p>
                <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                  {shortDate(group.items[0].created_at)}
                </span>
              </div>

              <ul className="hover-fx mt-5 flex flex-col gap-7 border-l border-zinc-100 pl-6 sm:ml-4">
                {group.items.map((item) => {
                  const saved =
                    savedKeys &&
                    itemKeys(item).some((k) => savedKeys.has(k) || overlaySavedSet.has(k));
                  const openItem = (e: React.MouseEvent<HTMLElement>, favoriting?: boolean) => {
                    const thumb = e.currentTarget.closest("li")?.querySelector(".feed-thumb");
                    playSfx(item.media_type);
                    onOpen(item, (thumb ?? e.currentTarget).getBoundingClientRect(), favoriting);
                  };
                  return (
                    <li key={item.id} className="item-tile flex gap-4">
                      <button
                        onClick={openItem}
                        aria-label={item.title}
                        className="feed-thumb w-24 shrink-0 cursor-pointer self-start"
                      >
                        <TileMedia item={item} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                              {TYPE_TAG[item.media_type] ?? item.media_type}
                            </span>
                            <h2 className="mt-0.5 truncate text-[13px] leading-snug tracking-[-0.01em] text-zinc-900">
                              <button
                                onClick={openItem}
                                className="cursor-pointer text-left transition-colors hover:text-zinc-400"
                              >
                                {item.title}
                              </button>
                            </h2>
                            {item.creator && (
                              <p className="truncate text-xs text-zinc-400">{item.creator}</p>
                            )}
                          </div>
                          {savedKeys && saved && (
                            <span className="shrink-0 pt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                              Favorited
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-500">
                            “{item.description}”
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="mx-auto cursor-pointer pb-4 text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900 disabled:cursor-wait"
            >
              {loadingMore ? "Loading…" : "Earlier saves ↓"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ── cold start: libraries worth following ─────────────────────────────────── */

export function Suggestions({ viewer, lead }: { viewer: Profile | null; lead?: string }) {
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSuggestions(viewer?.id ?? null).then(setPeople);
  }, [viewer]);

  const follow = async (p: Profile) => {
    if (!viewer) return;
    const { error } = await supabase()
      .from("follows")
      .insert({ follower_id: viewer.id, followee_id: p.id });
    if (!error) {
      playUi("confirm");
      setFollowed((prev) => new Set(prev).add(p.id));
    }
  };

  if (people === null) {
    return lead ? null : <p className="pt-12 text-center text-xs text-zinc-400">Loading…</p>;
  }
  if (people.length === 0) {
    // with a custom lead this is an add-on section, so vanish quietly
    return lead ? null : (
      <p className="pt-12 text-center text-xs text-zinc-400">
        You aren’t following anyone yet — find people with the search above.
      </p>
    );
  }
  return (
    <div className="pt-4">
      <p className="text-xs text-zinc-400">
        {lead ?? "You aren’t following anyone yet. Some libraries worth a look:"}
      </p>
      <ul className="mt-6 flex flex-col gap-4">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-3">
            <Link
              href={`/${p.username}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden bg-zinc-100 transition-opacity hover:opacity-80"
            >
              {p.avatar_url ? (
                <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs font-semibold text-zinc-300">
                  {(p.display_name || p.username).slice(0, 1)}
                </span>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/${p.username}`}
                className="text-[13px] font-medium text-zinc-900 transition-colors hover:text-zinc-400"
              >
                {p.display_name || `@${p.username}`}
              </Link>
              {p.bio && <p className="truncate text-xs text-zinc-400">{p.bio}</p>}
            </div>
            {followed.has(p.id) ? (
              <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                Following ✓
              </span>
            ) : (
              <button
                onClick={() => follow(p)}
                className="shrink-0 cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
              >
                + Follow
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
