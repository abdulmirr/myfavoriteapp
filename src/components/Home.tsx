"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  REC_CATEGORIES,
  REC_MIN_PER_CATEGORY,
  type Item,
  type Profile,
  type RecCategoryKey,
  type RecCounts,
  type Recommendation,
  type SearchResult,
} from "@/lib/types";
import { supabase, authHeaders } from "@/lib/supabase";
import {
  addToRadar,
  copyItem,
  escapeLike,
  fetchFollowing,
  fetchRadar,
  fetchSuggestions,
  itemKeys,
  removeFromRadar,
  type RadarItem,
} from "@/lib/social";
import { useLiveSearch } from "@/lib/use-live-search";
import { playSfx, playUi, preloadSfx } from "@/lib/sfx";
import { thumbCover } from "@/lib/img";
import dynamic from "next/dynamic";
import DetailOverlay from "./DetailOverlay";
import Notifications from "./Notifications";
import { TileMedia } from "./Tile";

// visitors-only (and framer-motion-heavy) — keep it out of the signed-in bundle
const Landing = dynamic(() => import("./Landing"));

type Tab = "foryou" | "following";

// stable identity so DetailOverlay's data effect doesn't re-fire every parent
// render while `friends` is still loading (null)
const NO_FOLLOWING: Profile[] = [];

/** items joined with who saved them, for the Friends feed and search */
type FeedItem = Item & { profile: Profile };

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

/**
 * A Discover search result shaped as a library Item so DetailOverlay can show
 * it full-screen. No id/owner/date — it isn't in anyone's library (yet).
 */
function resultToItem(r: SearchResult): Item {
  return {
    id: `discover-${r.media_type}-${r.source_id}`,
    profile_id: "",
    media_type: r.media_type,
    title: r.title,
    creator: r.creator,
    description: "",
    image_url: r.image_url,
    view_url: r.view_url,
    metadata: {
      ...(r.year ? { year: r.year } : {}),
      ...(r.source_id ? { source_id: r.source_id } : {}),
    },
    canonical_id: r.canonical_id,
    pinned_order: null,
    sort_order: 0,
    pos_x: null,
    pos_y: null,
    pos_rot: null,
    created_at: "",
  };
}

/** For You sections. Cards are square tiles like the library grid. */
const SECTION_UI: Record<RecCategoryKey, { label: string; one: string; many: string }> = {
  music: { label: "Music", one: "album", many: "albums" },
  books: { label: "Books", one: "book", many: "books" },
  filmtv: { label: "Film & TV", one: "film or show", many: "films or shows" },
  reading: { label: "Reading", one: "article or podcast", many: "articles or podcasts" },
};
const REC_SECTIONS = REC_CATEGORIES.map((c) => ({ ...c, ...SECTION_UI[c.key] }));

/** A daily pick shaped as a library Item so TileMedia frames it like the library. */
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
    <div
      className={`min-h-screen bg-white transition-opacity duration-700 ease-out ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
    >
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur">
        <div className="mx-auto grid max-w-4xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {/* your library is a place, not a tab — the pfp navigates away */}
            {viewer && (
              <Link
                href={`/${viewer.username}`}
                title="Your library"
                aria-label="Your library"
                className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden bg-zinc-100 transition-opacity hover:opacity-80"
              >
                {viewer.avatar_url ? (
                  <img
                    src={viewer.avatar_url}
                    alt={viewer.display_name || viewer.username}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[11px] font-semibold text-zinc-300">
                    {(viewer.display_name || viewer.username).slice(0, 1)}
                  </span>
                )}
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <SearchBar
                onPick={(r, rect) => {
                  const item = resultToItem(r);
                  playSfx(item.media_type);
                  setQuick({ item, rect });
                }}
              />
            </div>
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

          <div className="flex items-center justify-end gap-3">
            {viewer && (
              <Link
                href="/friends"
                title="Friends"
                aria-label="Friends"
                className="flex h-7 w-7 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-900"
              >
                {/* two people — drawn to match the bell's weight */}
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
                  <circle cx="6" cy="5.5" r="2.3" />
                  <path d="M2 13.5c0-2.5 1.8-4.1 4-4.1s4 1.6 4 4.1" />
                  <circle cx="11.6" cy="6.2" r="1.8" />
                  <path d="M12.3 9.8c1.6.4 2.7 1.7 2.7 3.5" />
                </svg>
              </Link>
            )}
            {viewer && <Notifications viewer={viewer} />}
            <Link
              href="/profile"
              title="Settings"
              aria-label="Settings"
              className="text-zinc-400 transition-colors hover:text-zinc-900"
            >
              {/* gear */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
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
  );
}

/* ── search: people and media across the whole database ───────────────────── */

type HomeSearchHits = { people: Profile[]; media: FeedItem[]; discover: SearchResult[] };

function SearchBar({ onPick }: { onPick: (r: SearchResult, rect: DOMRect) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // people + saved items + external catalogs in one debounced shot; the hook
  // caches per session and drops stale responses, so results track keystrokes
  const { results, searching } = useLiveSearch<HomeSearchHits>(
    q,
    async (query, signal) => {
      const db = supabase();
      // commas and parens are .or() tree syntax (a title like "Her (2013)"
      // would 400 the request); escapeLike then neutralizes %/_ wildcards
      const safe = escapeLike(query.replace(/[(),]/g, " "));
      const [{ data: profiles }, { data: items }, external] = await Promise.all([
        db
          .from("profiles")
          .select("id, user_id, username, display_name, bio, avatar_url, socials")
          .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
          .limit(3)
          .abortSignal(signal),
        db
          .from("items")
          // owner profile rides along as an embed — no second round trip
          .select("*, profile:profiles!profile_id(id, user_id, username, display_name, bio, avatar_url, socials)")
          .or(`title.ilike.%${safe}%,creator.ilike.%${safe}%`)
          .order("created_at", { ascending: false })
          .limit(4)
          .abortSignal(signal),
        authHeaders()
          .then((h) => fetch(`/api/search?q=${encodeURIComponent(query)}&type=all`, { headers: h, signal }))
          .then((r) => (r.ok ? r.json() : { results: [] }))
          .then((j) => (j.results ?? []) as SearchResult[])
          .catch(() => [] as SearchResult[]),
      ]);
      return {
        people: (profiles ?? []) as Profile[],
        media: ((items ?? []) as FeedItem[]).filter((i) => i.profile),
        discover: external,
      };
    },
    { minLength: 2, scope: "home" }
  );
  const people = results?.people ?? [];
  const media = results?.media ?? [];
  const discover = results?.discover ?? [];

  const hasResults = people.length > 0 || media.length > 0 || discover.length > 0;

  // icon-only until pressed: the underline and input reveal on focus and
  // collapse back once the field is blurred and empty
  const expanded = focused || q.trim().length > 0;

  return (
    <div className="relative max-w-56">
      {/* pt-1 balances pb-1, and the transparent top border balances border-b, so the icon centers on the pfp beside it */}
      <div
        className={`flex items-center gap-1.5 border-b border-t border-t-transparent pb-1 pt-1 transition-colors duration-200 ${
          focused ? "border-zinc-900" : expanded ? "border-zinc-400" : "border-transparent"
        }`}
      >
        <button
          aria-label="Search"
          onClick={() => inputRef.current?.focus()}
          className={`shrink-0 transition-colors ${
            expanded ? "text-zinc-900" : "cursor-pointer text-zinc-400 hover:text-zinc-900"
          }`}
        >
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="5" cy="5" r="4" />
            <path d="M8 8l3 3" />
          </svg>
        </button>
        <input
          ref={inputRef}
          value={q}
          placeholder="Search"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            setFocused(true);
            setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className={`bg-transparent text-xs leading-4 text-zinc-900 outline-none transition-all duration-200 placeholder:text-zinc-400 ${
            expanded ? "w-full opacity-100" : "pointer-events-none w-0 opacity-0"
          }`}
        />
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 top-full z-40 mt-2 max-h-[70vh] w-72 overflow-y-auto border border-zinc-200 bg-white shadow-2xl save-appear">
          {results === null || (searching && !hasResults) ? (
            // first response for this query still in flight — "No matches."
            // here would flash a false negative on every keystroke
            <p className="px-4 py-3 text-xs text-zinc-400 [animation:smart-search-wave_1.6s_ease-in-out_infinite]">
              Searching…
            </p>
          ) : !hasResults ? (
            <p className="px-4 py-3 text-xs text-zinc-400">No matches.</p>
          ) : (
            <>
              {people.length > 0 && (
                <div className="py-1.5">
                  <p className="px-4 pb-1 pt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                    People
                  </p>
                  {people.map((p) => (
                    <Link
                      key={p.id}
                      href={`/${p.username}`}
                      className="flex items-center gap-2.5 px-4 py-1.5 transition-colors hover:bg-zinc-50"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden bg-zinc-100">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-semibold text-zinc-300">
                            {(p.display_name || p.username).slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <span className="truncate text-xs text-zinc-900">{p.display_name}</span>
                      <span className="truncate text-[11px] text-zinc-400">@{p.username}</span>
                    </Link>
                  ))}
                </div>
              )}
              {media.length > 0 && (
                <div className="border-t border-zinc-100 py-1.5">
                  <p className="px-4 pb-1 pt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                    Saved by people
                  </p>
                  {media.map((m) => (
                    <Link
                      key={m.id}
                      href={`/${m.profile.username}`}
                      className="flex items-center gap-2.5 px-4 py-1.5 transition-colors hover:bg-zinc-50"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden bg-zinc-100">
                        {m.image_url ? (
                          <img
                            src={thumbCover(m.image_url, 100)}
                            alt=""
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] font-semibold text-zinc-300">
                            {m.title.slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-900">
                        {m.title}
                        {m.creator && <span className="text-zinc-400"> — {m.creator}</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-zinc-400">@{m.profile.username}</span>
                    </Link>
                  ))}
                </div>
              )}
              {discover.length > 0 && (
                <div className="border-t border-zinc-100 py-1.5">
                  <p className="px-4 pb-1 pt-1 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                    Discover
                  </p>
                  {discover.map((r) => (
                    <button
                      key={`${r.media_type}-${r.source_id}`}
                      // mousedown fires before the input's blur closes the dropdown
                      onMouseDown={(e) => {
                        e.preventDefault();
                        // the row's thumbnail is the morph origin for the detail view
                        const thumb = e.currentTarget.querySelector("div");
                        onPick(r, (thumb ?? e.currentTarget).getBoundingClientRect());
                        setOpen(false);
                      }}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-1.5 text-left transition-colors hover:bg-zinc-50"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden bg-zinc-100">
                        {r.image_url ? (
                          <img src={r.thumb_url ?? r.image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-semibold text-zinc-300">
                            {r.title.slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-900">
                        {r.title}
                        {r.creator && <span className="text-zinc-400"> — {r.creator}</span>}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                        {TYPE_TAG[r.media_type] ?? r.media_type}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** short type tags for the Discover group */
const TYPE_TAG: Record<string, string> = {
  book: "Book", movie: "Film", tv: "TV", music: "Music", podcast: "Pod", article: "Read",
};

/* ── For You: daily AI picks, one section per category ─────────────────────── */

function ForYou({ viewer }: { viewer: Profile | null }) {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [counts, setCounts] = useState<Partial<RecCounts>>({});
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<
    "loading" | "ready" | "gated" | "budget" | "done" | "error"
  >("loading");
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
          throw new Error("202");
        }
        if (res.status === 429) {
          // the day's generation budget is spent — retrying can't succeed,
          // so say that instead of offering a button that always fails
          setState("budget");
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
        setCounts(json.counts ?? {});
        if (json.allDismissed) {
          // they passed on the whole set — that's a judgment, not an empty
          // library; the gate copy would be flatly wrong here
          setState("done");
        } else if (json.gated || json.empty || !json.recommendations.length) {
          setTotal(json.total ?? 0);
          setState("gated");
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
          {REC_SECTIONS.map((section) => {
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
                      <FlipCard
                        key={`${r.title}-${i}`}
                        rec={r}
                        viewer={viewer}
                        onDismiss={() =>
                          setRecs((prev) =>
                            prev.filter(
                              (p) => !(p.media_type === r.media_type && p.title === r.title)
                            )
                          )
                        }
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

      {viewer && state !== "loading" && <SavedStrip viewer={viewer} />}
      {viewer && (state === "ready" || state === "budget" || state === "done") && (
        <Rediscover viewer={viewer} />
      )}
    </section>
  );
}


/** A saved row shaped as a library Item so TileMedia frames it like the library. */
function radarToItem(r: RadarItem): Item {
  return {
    id: r.id,
    profile_id: "",
    media_type: r.media_type,
    title: r.title,
    creator: r.creator,
    description: "",
    image_url: r.image_url,
    view_url: r.view_url,
    metadata: (r.metadata ?? {}) as Item["metadata"],
    canonical_id: r.canonical_id,
    pinned_order: null,
    sort_order: 0,
    pos_x: null,
    pos_y: null,
    pos_rot: null,
    created_at: r.created_at,
  };
}

/**
 * Your saved stuff — the private shelf of things spotted but not yet claimed.
 * Deliberately unnumbered and quiet: it's curiosity, never a backlog. The only
 * action is letting one go; favoriting happens where the piece itself lives.
 */
function SavedStrip({ viewer }: { viewer: Profile }) {
  const [rows, setRows] = useState<RadarItem[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchRadar(viewer.id).then((r) => !cancelled && setRows(r));
    return () => {
      cancelled = true;
    };
  }, [viewer.id]);

  if (!rows?.length) return null;

  const act = async (r: RadarItem, fn: () => Promise<void>) => {
    if (busy.has(r.id)) return;
    setBusy((s) => new Set(s).add(r.id));
    try {
      await fn();
      setRows((prev) => (prev ?? []).filter((x) => x.id !== r.id));
    } catch {
      /* leave the row; a retry is one tap away */
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(r.id);
        return next;
      });
    }
  };

  return (
    <div className="mt-16">
      {/* a section of its own — same voice as the "For you" header */}
      <h2 className="mb-8 flex items-center gap-2 text-lg font-semibold leading-snug tracking-tight text-zinc-900">
        {/* bookmark — the same mark as the save action */}
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden>
          <path d="M4 2.5h8v11.5l-4-3.2-4 3.2z" />
        </svg>
        Your saved stuff
      </h2>
      {/* three tight rows per line; each cover keeps its object-on-a-wall
          frame (vinyl sleeve, fore-edge pages, snap frame) — never a bare square */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-3">
        {rows.slice(0, 9).map((r) => (
          <div key={r.id} className="flex min-w-0 items-center gap-3">
            <div className="w-14 shrink-0">
              <TileMedia item={radarToItem(r)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs leading-snug tracking-[-0.01em] text-zinc-900">
                {r.title}
              </p>
              {r.creator && <p className="truncate text-[11px] text-zinc-400">{r.creator}</p>}
            </div>
            <button
              onClick={() => act(r, () => removeFromRadar(r.id))}
              disabled={busy.has(r.id)}
              aria-label="Remove from saved"
              title="Let it go"
              className="shrink-0 cursor-pointer text-zinc-300 transition-colors hover:text-zinc-900 disabled:cursor-wait"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
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

/** Cover that flips over to reveal why it was recommended. */
function FlipCard({
  rec,
  viewer,
  onDismiss,
}: {
  rec: Recommendation;
  viewer: Profile | null;
  onDismiss: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [onRadar, setOnRadar] = useState<"idle" | "saving" | "done">("idle");

  const radar = async () => {
    if (!viewer || onRadar !== "idle") return;
    setOnRadar("saving");
    try {
      await addToRadar(recToItem(rec), viewer.id);
      playUi("confirm");
      setOnRadar("done");
    } catch {
      setOnRadar("idle");
    }
  };

  const favorite = async () => {
    if (!viewer || saved === "saving" || saved === "done") return;
    setSaved("saving");
    try {
      // provenance stays null — this pick came from the engine, not a person
      await copyItem(recToItem(rec), viewer.id);
      playSfx(rec.media_type);
      setSaved("done");
    } catch {
      setSaved("error");
    }
  };

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
      <div className="mt-1.5 flex items-center gap-3">
        <button
          onClick={() => setFlipped((f) => !f)}
          className={`cursor-pointer text-[10px] uppercase tracking-[0.08em] transition-colors ${
            flipped ? "text-zinc-900 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-900"
          }`}
        >
          {flipped ? "back" : "why?"}
        </button>
        {viewer &&
          (saved === "done" ? (
            <span className="save-appear text-[10px] uppercase tracking-[0.08em] text-zinc-900">
              favorited ✓
            </span>
          ) : saved === "error" ? (
            <button
              onClick={favorite}
              className="cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
            >
              retry?
            </button>
          ) : (
            <button
              onClick={favorite}
              disabled={saved === "saving"}
              aria-label="Favorite"
              title="Favorite — add to your library"
              className={`cursor-pointer transition-opacity disabled:cursor-wait ${
                saved === "saving" ? "opacity-40" : "opacity-80 hover:opacity-100"
              }`}
            >
              {/* the star mark — the same gesture it is everywhere else */}
              <img src="/favicon.svg" alt="" className="h-3.5 w-auto" />
            </button>
          ))}
        {viewer && saved !== "done" && (
          <>
            {onRadar === "done" ? (
              <span className="save-appear text-[10px] uppercase tracking-[0.08em] text-zinc-900">
                saved ✓
              </span>
            ) : (
              <button
                onClick={radar}
                disabled={onRadar === "saving"}
                aria-label="Save for later"
                title="Save for later (private)"
                className="cursor-pointer text-zinc-400 transition-colors hover:text-zinc-900 disabled:cursor-wait"
              >
                {/* bookmark */}
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
                  <path d="M4 2.5h8v11.5l-4-3.2-4 3.2z" />
                </svg>
              </button>
            )}
            <button
              onClick={dismiss}
              title="Not for me — I won't suggest it again"
              className="ml-auto cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-300 transition-colors hover:text-zinc-900"
            >
              pass
            </button>
          </>
        )}
      </div>
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

function Suggestions({ viewer, lead }: { viewer: Profile | null; lead?: string }) {
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
