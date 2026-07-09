"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Item, Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { fetchFollowing } from "@/lib/social";
import { playSfx, preloadSfx } from "@/lib/sfx";
import DetailOverlay from "./DetailOverlay";
import SearchBar, { resultToItem, type FeedItem } from "./SearchBar";
import Suggestions from "./Suggestions";
import { DiscoverPeople } from "./Friends";
import { TileMedia } from "./Tile";

const NO_FOLLOWING: Profile[] = [];
const PAGE = 24;

/**
 * Everyone on the app: libraries worth following and the newest favorites
 * across all profiles — outward discovery, distinct from "stuff for me".
 * Renders as Home's third tab for the signed-in; the /explore page wraps it
 * for signed-out visitors.
 */
export function ExploreFeed({
  viewer,
  onOpen,
  focusSearch = false,
}: {
  viewer: Profile | null;
  onOpen: (item: Item, rect: DOMRect) => void;
  /** the top bar's ⌕ lands here with the search bar already focused */
  focusSearch?: boolean;
}) {
  const [recent, setRecent] = useState<FeedItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // the newest favorites across every library, owner embedded
  const load = async (before?: { ts: string; id: string }) => {
    let q = supabase()
      .from("items")
      .select(
        "*, profile:profiles!profile_id(id, user_id, username, display_name, bio, avatar_url, socials)"
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE);
    if (before) {
      q = q.or(`created_at.lt.${before.ts},and(created_at.eq.${before.ts},id.lt.${before.id})`);
    }
    const { data } = await q;
    return ((data ?? []) as FeedItem[]).filter((i) => i.profile);
  };

  useEffect(() => {
    load().then((rows) => {
      setRecent(rows);
      setHasMore(rows.length === PAGE);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    if (!recent?.length || loadingMore) return;
    setLoadingMore(true);
    const last = recent[recent.length - 1];
    const rows = await load({ ts: last.created_at, id: last.id });
    setRecent((prev) => [...(prev ?? []), ...rows]);
    setHasMore(rows.length === PAGE);
    setLoadingMore(false);
  };

  const openItem = (item: Item, e: React.MouseEvent<HTMLElement>) => {
    const thumb = e.currentTarget.querySelector(".item-media") ?? e.currentTarget;
    playSfx(item.media_type);
    onOpen(item, thumb.getBoundingClientRect());
  };

  return (
    <section>
      <div className="mb-8 flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold leading-snug tracking-tight text-zinc-900">
          Explore
        </h1>
        <p className="text-xs text-zinc-400">
          Everyone on the app — people worth following, and what they’re saving.
        </p>
      </div>

      {/* the one true search — people, saved items, and the catalog in one
          bar. searching is the point of this page, so it opens the page. */}
      <div className="mb-12">
        <SearchBar
          wide
          autoFocus={focusSearch}
          onPick={(r, rect) => {
            const item = resultToItem(r);
            playSfx(item.media_type);
            onOpen(item, rect);
          }}
        />
      </div>

      <div>
        <h2 className="mb-5 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
          People with similar taste
        </h2>
        {viewer ? (
          <DiscoverPeople viewer={viewer} />
        ) : (
          <Suggestions viewer={viewer} lead="Libraries worth a look:" />
        )}
      </div>

      <div className="mt-14">
        <h2 className="mb-5 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
          Recent favorites
        </h2>
        {recent === null ? (
          <p className="pt-8 text-center text-xs text-zinc-400 [animation:smart-search-wave_1.6s_ease-in-out_infinite]">
            Loading…
          </p>
        ) : recent.length === 0 ? (
          <p className="pt-8 text-center text-xs text-zinc-400">Nothing here yet.</p>
        ) : (
          <>
            <div className="hover-fx grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 md:grid-cols-4">
              {recent.map((item) => (
                <article key={item.id} className="item-tile">
                  <button
                    onClick={(e) => openItem(item, e)}
                    aria-label={item.title}
                    className="block w-full cursor-pointer"
                  >
                    <TileMedia item={item} />
                  </button>
                  <h3 className="mt-3 truncate text-[13px] leading-snug tracking-[-0.01em] text-zinc-900">
                    {item.title}
                  </h3>
                  <Link
                    href={`/${item.profile.username}`}
                    className="truncate text-xs text-zinc-400 transition-colors hover:text-zinc-900"
                  >
                    @{item.profile.username}
                  </Link>
                </article>
              ))}
            </div>
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="mx-auto mt-12 block cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900 disabled:cursor-wait"
              >
                {loadingMore ? "Loading…" : "More ↓"}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The standalone /explore page — the signed-out visitor's door into the
 * network (their rail links here). Signed-in users get the same feed as a
 * tab on Home.
 */
export default function Explore() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [viewer, setViewer] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<Profile[] | null>(null);
  const [quick, setQuick] = useState<{ item: Item; rect: DOMRect } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    preloadSfx();
    const db = supabase();
    db.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    const { data: sub } = db.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setViewer(null);
      return;
    }
    supabase()
      .from("profiles")
      .select("id, user_id, username, display_name, bio, avatar_url, socials")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setViewer((data as Profile) ?? null));
  }, [userId]);

  useEffect(() => {
    if (!viewer) return;
    fetchFollowing(viewer.id).then(setFriends);
  }, [viewer]);

  return (
    <>
      <div
        className={`bg-white transition-opacity duration-700 ease-out ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
      >
        <main className="mx-auto max-w-4xl px-5 pb-24 pt-8 sm:px-8">
          <ExploreFeed viewer={viewer} onOpen={(item, rect) => setQuick({ item, rect })} />
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
          />
        )}
      </div>
    </>
  );
}
