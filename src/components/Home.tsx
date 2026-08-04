"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFeed } from "./FeedTabs";
import {
  REC_CATEGORIES,
  REC_MIN_PER_CATEGORY,
  type Item,
  type Profile,
  type RecCategoryKey,
  type RecCounts,
  type Recommendation,
} from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { fetchFollowing, itemKeys, type Notification } from "@/lib/social";
import { playSfx, preloadSfx } from "@/lib/sfx";
import { thumbCover } from "@/lib/img";
import dynamic from "next/dynamic";
import DetailOverlay from "./DetailOverlay";
import { ExploreFeed } from "./Explore";
import { FriendsStrip, InviteFriendButton } from "./Friends";
import { NotificationEntry, useNotifications } from "./Notifications";
import Suggestions from "./Suggestions";
import { TYPE_TAG, type FeedItem } from "./SearchBar";
import { TileMedia } from "./Tile";

// visitors-only (and framer-motion-heavy) — keep it out of the signed-in bundle
const Landing = dynamic(() => import("./Landing"));

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
  podcast: "a podcast", video: "a video", article: "a link",
  photo: "a photo", other: "something",
};

/** For You sections. Cards are square tiles like the library grid. */
const SECTION_UI: Record<RecCategoryKey, { label: string; one: string; many: string }> = {
  music: { label: "Music", one: "album", many: "albums" },
  books: { label: "Books", one: "book", many: "books" },
  filmtv: { label: "Film & TV", one: "film or show", many: "films or shows" },
  reading: { label: "Reading", one: "link or podcast", many: "links or podcasts" },
};
const REC_SECTIONS = REC_CATEGORIES.map((c) => ({ ...c, ...SECTION_UI[c.key] }));

/**
 * A daily pick shaped as a library Item so the detail view frames it like the
 * library. The discover- prefix gives it the same overlay behavior as search
 * results (favorite + save actions, no favorited-count lookup), and the
 * engine's "why" rides in as the description — the curator's note in the
 * detail view's text column.
 */
function recToItem(rec: Recommendation): Item {
  return {
    id: `discover-rec-${rec.media_type}-${rec.title}`,
    profile_id: "",
    media_type: rec.media_type,
    title: rec.title,
    creator: rec.creator,
    description: rec.reason,
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
  // which feed shows rides in the URL (?feed=…), set by the top bar's switcher;
  // the bar's ⌕ adds &search=1 so Explore's search bar opens focused
  const tab = useFeed();
  const focusSearch = useSearchParams().get("search") === "1";
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
    <>
      <div
        className={`bg-white transition-opacity duration-700 ease-out ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
      >
        <main className="mx-auto max-w-4xl px-5 pb-24 pt-8 sm:px-8">
          {tab === "foryou" ? (
            <ForYou viewer={viewer} onOpen={(item, rect) => setQuick({ item, rect })} />
          ) : tab === "following" ? (
            <section>
              <div className="mb-8 flex items-end justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <h1 className="text-lg font-semibold leading-snug tracking-tight text-zinc-900">
                    Friends
                  </h1>
                  <p className="text-xs text-zinc-400">
                    Your people — what they’re favoriting, and who’s noticing you.
                  </p>
                </div>
                <InviteFriendButton />
              </div>
              {friends && friends.length > 0 && (
                <div className="mb-12">
                  <FriendsStrip friends={friends} />
                </div>
              )}
              <FollowingFeed
                viewer={viewer}
                friends={friends}
                onOpen={(item, rect, favoriting) => setQuick({ item, rect, favoriting })}
                overlaySaved={overlaySaved}
                heading={false}
              />
            </section>
          ) : (
            <ExploreFeed
              viewer={viewer}
              focusSearch={focusSearch}
              onOpen={(item, rect) => setQuick({ item, rect })}
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
    </>
  );
}

/* ── For You: daily AI picks, one section per category ─────────────────────── */

// the last good set, cached client-side — the feed paints instantly on open
// and refreshes in the background. The set only changes once a day, so the
// cache is almost always exactly right; on the daily rollover it shows
// yesterday's picks while today's brew instead of a blank screen.
const RECS_CACHE_KEY = "fav:recs";
type RecsCache = {
  uid: string;
  day: string;
  recs: Recommendation[];
  counts: Partial<RecCounts>;
  total: number;
};
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

function ForYou({
  viewer,
  onOpen,
}: {
  viewer: Profile | null;
  onOpen: (item: Item, rect: DOMRect) => void;
}) {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [counts, setCounts] = useState<Partial<RecCounts>>({});
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<
    "loading" | "ready" | "gated" | "budget" | "done" | "error"
  >("loading");
  // a background refresh while cached picks are showing — never a blank screen
  const [refreshing, setRefreshing] = useState(false);
  const [cachedDay, setCachedDay] = useState<string | null>(null);
  const shownRef = useRef<Recommendation[]>([]);
  const cacheUidRef = useRef<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hydrate from the cache before the network is even asked
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECS_CACHE_KEY);
      if (!raw) return;
      const c = JSON.parse(raw) as RecsCache;
      if (!c.recs?.length) return;
      cacheUidRef.current = c.uid ?? null;
      shownRef.current = c.recs;
      setRecs(c.recs);
      setCounts(c.counts ?? {});
      setTotal(c.total ?? 0);
      setCachedDay(c.day ?? null);
      setState("ready");
    } catch {
      /* an unreadable cache is just a cold start */
    }
  }, []);

  const load = useCallback(() => {
    const run = async (attempt: number) => {
      setRefreshing(true);
      if (!shownRef.current.length) setState("loading");
      try {
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("no session");
        const uid = data.session!.user.id;
        // a cached set that belongs to a different account (shared browser)
        // must not linger on screen
        if (cacheUidRef.current && cacheUidRef.current !== uid) {
          cacheUidRef.current = null;
          shownRef.current = [];
          setRecs([]);
          setCachedDay(null);
          setState("loading");
          localStorage.removeItem(RECS_CACHE_KEY);
        }
        const res = await fetch("/api/recommendations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            // lets the server roll the daily set over at OUR midnight, not UTC's
            "x-tz-offset": String(new Date().getTimezoneOffset()),
          },
        });
        if (res.status === 202) {
          // another request is generating today's picks — check back a few
          // times, then stop (each retry spends recs budget). The attempt count
          // travels as an argument so a manual "Try again" starts fresh.
          if (attempt < 3) {
            retryTimer.current = setTimeout(() => run(attempt + 1), 5000);
            return;
          }
          // yesterday's set stays up rather than an error for a slow brew
          if (shownRef.current.length) {
            setRefreshing(false);
            return;
          }
          throw new Error("202");
        }
        if (res.status === 429) {
          // the day's generation budget is spent — retrying can't succeed,
          // so say that instead of offering a button that always fails
          setRefreshing(false);
          if (!shownRef.current.length) setState("budget");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as {
          recommendations: Recommendation[];
          counts?: RecCounts;
          total?: number;
          gated?: boolean;
          empty?: boolean;
          allDismissed?: boolean;
        };
        setRefreshing(false);
        setCounts(json.counts ?? {});
        if (json.allDismissed) {
          // they passed on the whole set — that's a judgment, not an empty
          // library; the gate copy would be flatly wrong here
          shownRef.current = [];
          setRecs([]);
          localStorage.removeItem(RECS_CACHE_KEY);
          setState("done");
        } else if (json.gated || json.empty || !json.recommendations.length) {
          setTotal(json.total ?? 0);
          shownRef.current = [];
          setRecs([]);
          localStorage.removeItem(RECS_CACHE_KEY);
          setState("gated");
        } else {
          shownRef.current = json.recommendations;
          setRecs(json.recommendations);
          setCachedDay(localDay());
          setState("ready");
          try {
            localStorage.setItem(
              RECS_CACHE_KEY,
              JSON.stringify({
                uid,
                day: localDay(),
                recs: json.recommendations,
                counts: json.counts ?? {},
                total: json.total ?? 0,
              } satisfies RecsCache)
            );
          } catch {
            /* a full localStorage just means a cold start next time */
          }
        }
      } catch {
        setRefreshing(false);
        // with cached picks on screen, a failed refresh stays silent — the
        // stale set beats an error message
        if (!shownRef.current.length) setState("error");
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
        <p className="text-xs text-zinc-400">New picks every day, drawn from your library.</p>
      </div>

      {state === "loading" && (
        <p className="pt-12 text-center text-xs text-zinc-400 [animation:smart-search-wave_1.6s_ease-in-out_infinite]">
          Curating today’s picks — the first load takes a minute…
        </p>
      )}

      {state === "gated" && (
        <div className="flex flex-col gap-2 pt-2">
          <p className="text-xs leading-relaxed text-zinc-400">
            <Link
              href={viewer ? `/${viewer.username}` : "/add"}
              className="text-zinc-900 hover:text-zinc-400"
            >
              Favorite more
            </Link>{" "}
            to get recommendations — picks unlock once any section reaches{" "}
            {REC_MIN_PER_CATEGORY} favorites.
          </p>
          {total > 0 && (
            <p className="text-[11px] tracking-wide text-zinc-400">
              {REC_SECTIONS.map((s, i) => (
                <span key={s.key}>
                  {i > 0 && <span className="mx-1.5 text-zinc-300">·</span>}
                  {s.label}{" "}
                  <span className={(counts[s.key] ?? 0) > 0 ? "text-zinc-900" : undefined}>
                    {Math.min(counts[s.key] ?? 0, REC_MIN_PER_CATEGORY)}/{REC_MIN_PER_CATEGORY}
                  </span>
                </span>
              ))}
            </p>
          )}
          <Suggestions viewer={viewer} lead="Meanwhile, some libraries worth a look:" />
        </div>
      )}

      {state === "budget" && (
        <p className="pt-12 text-center text-xs text-zinc-400">
          Today’s curation budget is spent — fresh picks land tomorrow.
        </p>
      )}

      {state === "done" && (
        <p className="pt-12 text-center text-xs text-zinc-400">
          You’ve passed on all of today’s picks — a fresh set lands tomorrow.
        </p>
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
          {/* the daily rollover: yesterday's set stays up while today's brew —
              a quiet note instead of a blank screen */}
          {refreshing && cachedDay !== null && cachedDay !== localDay() && (
            <p className="-mt-6 text-[11px] text-zinc-400 [animation:smart-search-wave_1.6s_ease-in-out_infinite]">
              Yesterday’s picks, while today’s are being curated…
            </p>
          )}
          {REC_SECTIONS.map((section, sectionIdx) => {
            const picks = recs.filter((r) => section.types.includes(r.media_type));
            const have = counts[section.key] ?? 0;
            const need = REC_MIN_PER_CATEGORY - have;
            return (
              <div key={section.label}>
                <h2 className="mb-5 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                  {section.label}
                </h2>
                {picks.length ? (
                  <div className="hover-fx grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
                    {picks.map((r, i) => (
                      <RecCard
                        key={`${r.title}-${i}`}
                        rec={r}
                        viewer={viewer}
                        eager={sectionIdx === 0}
                        onOpen={onOpen}
                        onDismiss={() => {
                          // the cache must forget it too, or a passed pick
                          // resurrects on the next open until the refresh lands
                          const next = shownRef.current.filter(
                            (p) => !(p.media_type === r.media_type && p.title === r.title)
                          );
                          shownRef.current = next;
                          setRecs(next);
                          try {
                            const raw = localStorage.getItem(RECS_CACHE_KEY);
                            if (raw) {
                              const c = JSON.parse(raw) as RecsCache;
                              localStorage.setItem(
                                RECS_CACHE_KEY,
                                JSON.stringify({ ...c, recs: next })
                              );
                            }
                          } catch {
                            /* cache refresh is best-effort */
                          }
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">
                    {need > 0
                      ? // empty because they haven't favorited enough here yet
                        `Favorite ${need}${have > 0 ? " more" : ""} ${need === 1 ? section.one : section.many} to get picks here.`
                      : // unlocked after today's set was drawn — tomorrow pays it off
                        "Fresh picks land here tomorrow."}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewer && (state === "ready" || state === "budget" || state === "done") && (
        <Rediscover viewer={viewer} />
      )}
    </section>
  );
}

/**
 * Rediscover: one favorite from 30+ days back, rotated daily — the library
 * remembered back to its owner (a taste page ages well; show that). Renders
 * nothing while the library is too young to have a past.
 */
type RediscoverPick = Pick<Item, "id" | "title" | "creator" | "image_url" | "created_at">;

function Rediscover({ viewer }: { viewer: Profile }) {
  const [pick, setPick] = useState<{ item: RediscoverPick; months: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cutoff = new Date(Date.now() - 30 * 864e5).toISOString();
      const { data } = await supabase()
        .from("items")
        .select("id, title, creator, image_url, created_at")
        .eq("profile_id", viewer.id)
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(60);
      if (cancelled || !data?.length) return;
      // deterministic daily rotation — same pick all day, new pick tomorrow
      const day = Math.floor(Date.now() / 864e5);
      const item = data[day % data.length] as RediscoverPick;
      setPick({
        item,
        months: Math.max(
          1,
          Math.round((Date.now() - new Date(item.created_at).getTime()) / (30 * 864e5))
        ),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [viewer.id]);

  if (!pick) return null;
  const { item, months } = pick;

  return (
    <div className="mt-14">
      <h2 className="mb-5 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
        From your wall
      </h2>
      <Link
        href={`/${viewer.username}?item=${item.id}`}
        className="group flex items-center gap-4"
      >
        <div className="h-16 w-16 shrink-0 overflow-hidden bg-zinc-100">
          {item.image_url && (
            <img
              src={thumbCover(item.image_url)}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] leading-snug tracking-[-0.01em] text-zinc-900">
            {item.title}
          </p>
          {item.creator && <p className="truncate text-xs text-zinc-400">{item.creator}</p>}
          <p className="mt-0.5 text-[11px] text-zinc-400 transition-colors group-hover:text-zinc-900">
            Favorited {months} month{months === 1 ? "" : "s"} ago — still one of yours?
          </p>
        </div>
      </Link>
    </div>
  );
}

/**
 * A daily pick, one grammar with everything else: click the cover and the
 * detail view opens — the engine's "why" reads as the curator's note in the
 * text column, and Favorite / Save are the full-size actions there. The only
 * control left on the card is `pass`, which has no home in the detail view
 * (dismissals feed the engine).
 */
function RecCard({
  rec,
  viewer,
  eager = false,
  onOpen,
  onDismiss,
}: {
  rec: Recommendation;
  viewer: Profile | null;
  /** first section sits above the fold — fetch its covers immediately */
  eager?: boolean;
  onOpen: (item: Item, rect: DOMRect) => void;
  onDismiss: () => void;
}) {
  const dismiss = async () => {
    if (!viewer) return;
    onDismiss(); // the card leaves immediately; the write is fire-and-forget
    // supabase builders are lazy — .then() is what actually sends the request
    supabase()
      .from("rec_dismissals")
      .upsert(
        {
          profile_id: viewer.id,
          media_type: rec.media_type,
          title: rec.title,
          creator: rec.creator,
        },
        { onConflict: "profile_id,media_type,title", ignoreDuplicates: true }
      )
      .then(({ error }) => {
        if (error) console.error("dismissal not saved:", error.message);
      });
  };

  return (
    <article className="item-tile">
      <button
        aria-label={rec.title}
        className="block w-full cursor-pointer"
        onClick={(e) => {
          const media = e.currentTarget.querySelector(".item-media");
          if (media) {
            playSfx(rec.media_type);
            onOpen(recToItem(rec), media.getBoundingClientRect());
          }
        }}
      >
        {/* same object-on-a-wall treatment as the library grid */}
        <TileMedia item={recToItem(rec)} eager={eager} />
      </button>

      <div className="mt-3 flex items-baseline gap-3">
        <h3 className="min-w-0 truncate text-[13px] leading-snug tracking-[-0.01em] text-zinc-900">
          {rec.title}
        </h3>
        {viewer && (
          <button
            onClick={dismiss}
            title="Not for me — I won't suggest it again"
            className="ml-auto shrink-0 cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-300 transition-colors hover:text-zinc-900"
          >
            pass
          </button>
        )}
      </div>
      {rec.creator && <p className="truncate text-xs text-zinc-400">{rec.creator}</p>}
    </article>
  );
}

/* ── Activity: latest saves from people you follow ─────────────────────────── */

/** consecutive same-day saves by the same friend, rendered as one visit */
type FeedGroup = { profile: Profile; day: string; items: FeedItem[] };

const FEED_PAGE = 40;

function FollowingFeed({
  viewer,
  friends,
  onOpen,
  overlaySaved,
  heading = true,
}: {
  viewer: Profile | null;
  friends: Profile[] | null;
  onOpen: (item: Item, rect: DOMRect, favoriting?: boolean) => void;
  overlaySaved: string[];
  /** false when a parent (the Friends tab) already provides the header */
  heading?: boolean;
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

  // notifications ride this same feed — one merged timeline, one grammar
  const notif = useNotifications(viewer);

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

  // visits and notifications shuffled into one newest-first stream
  type Entry =
    | { ts: string; key: string; kind: "group"; group: FeedGroup }
    | { ts: string; key: string; kind: "notif"; n: Notification };
  const entries: Entry[] = useMemo(() => {
    const out: Entry[] = groups.map((group) => ({
      ts: group.items[0].created_at,
      key: `g-${group.profile.id}-${group.day}-${group.items[0].id}`,
      kind: "group",
      group,
    }));
    for (const n of notif.list ?? [])
      out.push({ ts: n.created_at, key: `n-${n.id}`, kind: "notif", n });
    return out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  }, [groups, notif.list]);

  const overlaySavedSet = useMemo(() => new Set(overlaySaved), [overlaySaved]);

  return (
    <section>
      {heading && (
        <div className="mb-10 flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold leading-snug tracking-tight text-zinc-900">
            Activity
          </h1>
          <p className="text-xs text-zinc-400">What the people you follow are favoriting.</p>
        </div>
      )}

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
        // nobody followed yet — notifications (someone found you first) still
        // show above the suggestions
        <div className="flex flex-col gap-14">
          {entries.map((e) =>
            e.kind === "notif" ? (
              <NotificationEntry
                key={e.key}
                n={e.n}
                state={notif}
                viewerId={viewer?.id ?? null}
                viewerFollowing={friends ?? []}
              />
            ) : null
          )}
          <Suggestions viewer={viewer} />
        </div>
      ) : entries.length === 0 ? (
        <p className="pt-12 text-center text-xs text-zinc-400">
          The people you follow haven’t favorited anything yet.
        </p>
      ) : (
        <div className="flex flex-col gap-14">
          {entries.map((e) =>
            e.kind === "notif" ? (
              <NotificationEntry
                key={e.key}
                n={e.n}
                state={notif}
                viewerId={viewer?.id ?? null}
                viewerFollowing={friends ?? []}
              />
            ) : (
              <FeedGroupEntry
                key={e.key}
                group={e.group}
                savedKeys={savedKeys}
                overlaySavedSet={overlaySavedSet}
                onOpen={onOpen}
              />
            )
          )}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="mx-auto cursor-pointer pb-4 text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900 disabled:cursor-wait"
            >
              {loadingMore ? "Loading…" : "Earlier saves ↓"}
            </button>
          )}
          {/* the reach footnote — who you put on, quietly closing the feed */}
          {notif.reach !== null && notif.reach.pieces > 0 && (
            <p className="border-t border-zinc-100 pt-5 text-[11px] leading-relaxed text-zinc-400">
              You put on{" "}
              {notif.reach.people.slice(0, 2).map((p, i) => (
                <span key={p.id}>
                  {i > 0 && (notif.reach!.people.length > 2 ? ", " : " and ")}
                  <Link
                    href={`/${p.username}`}
                    className="text-zinc-900 transition-colors hover:text-zinc-400"
                  >
                    {p.display_name || `@${p.username}`}
                  </Link>
                </span>
              ))}
              {notif.reach.people.length > 2 &&
                `, and ${notif.reach.people.length - 2} other${
                  notif.reach.people.length === 3 ? "" : "s"
                }`}{" "}
              on {notif.reach.pieces} piece{notif.reach.pieces === 1 ? "" : "s"}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** one friend's visit — who + when, then their pieces under the hairline */
function FeedGroupEntry({
  group,
  savedKeys,
  overlaySavedSet,
  onOpen,
}: {
  group: FeedGroup;
  savedKeys: Set<string> | null;
  overlaySavedSet: Set<string>;
  onOpen: (item: Item, rect: DOMRect, favoriting?: boolean) => void;
}) {
  return (
    <section>
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
                {/* a 96px slot — the 200px variant, not the full cover */}
                <TileMedia item={item} thumb={200} />
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
  );
}

