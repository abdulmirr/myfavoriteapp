"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Item, Profile } from "@/lib/types";
import { categoryOf, type Category } from "@/lib/categories";
import { supabase } from "@/lib/supabase";
import {
  blockProfile,
  fetchFollowers,
  fetchFollowing,
  hasBlocked,
  itemKeys,
  unblockProfile,
  PROFILE_COLS,
} from "@/lib/social";
import { playUi, preloadSfx } from "@/lib/sfx";
import AppShell from "./AppShell";
import ProfileHeader from "./ProfileHeader";
import LibraryToolbar, { type SortMode, type ViewMode } from "./LibraryToolbar";
import Grid from "./Grid";
import Freeform from "./Freeform";
import DetailOverlay from "./DetailOverlay";
import IntroOverlay from "./IntroOverlay";
import Hint, { markHintSeen } from "./Hint";

export default function Library({
  profile: initialProfile,
  initialItems,
  initialItemId = null,
}: {
  profile: Profile;
  initialItems: Item[];
  /** ?item= deep link — opens that favorite's detail view on load */
  initialItemId?: string | null;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [items, setItems] = useState(initialItems);

  useEffect(() => preloadSfx(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("default");
  const [view, setView] = useState<ViewMode>("grid");
  const [cols, setCols] = useState(5); // default density: 5 per row until the slider is touched
  const [open, setOpen] = useState<{ item: Item; rect: DOMRect } | null>(null);
  const [gridDimmed, setGridDimmed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [followers, setFollowers] = useState<Profile[]>([]);
  const [following, setFollowing] = useState<Profile[]>([]);
  const [viewerFollowing, setViewerFollowing] = useState<Profile[]>([]);
  const [viewerProfile, setViewerProfile] = useState<Profile | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const refetchedClaim = useRef(false);

  useEffect(() => {
    setMounted(true);
    const stored = Number(localStorage.getItem("fav:cols"));
    if (stored >= 3 && stored <= 20) setCols(stored);
    const v = localStorage.getItem("fav:view"); // default view, set in /profile settings
    if (v === "grid" || v === "freeform") setView(v);
  }, []);

  // the slider fires per pointermove — debounce the (synchronous) storage
  // write so dragging only re-renders, never blocks on localStorage
  const colsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeCols = useCallback((c: number) => {
    setCols(c);
    if (colsSaveTimer.current) clearTimeout(colsSaveTimer.current);
    colsSaveTimer.current = setTimeout(() => localStorage.setItem("fav:cols", String(c)), 200);
  }, []);

  // track auth session; refresh profile once after first sign-in (claim trigger)
  useEffect(() => {
    const db = supabase();
    db.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    const { data: sub } = db.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId || profile.user_id || refetchedClaim.current) return;
    refetchedClaim.current = true;
    supabase()
      .from("profiles")
      .select("id, user_id, username, display_name, bio, avatar_url, socials")
      .eq("id", profile.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data as Profile);
      });
  }, [userId, profile.user_id, profile.id]);

  const isOwner = !!userId && userId === profile.user_id;

  // the displayed profile's circles
  useEffect(() => {
    fetchFollowers(profile.id).then(setFollowers);
    fetchFollowing(profile.id).then(setFollowing);
  }, [profile.id]);

  // the signed-in viewer's own profile (needed to follow)
  useEffect(() => {
    if (!userId) {
      setViewerProfile(null);
      return;
    }
    supabase()
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setViewerProfile((data as Profile) ?? null));
  }, [userId]);

  // who the viewer follows — powers "favorited by …" in the detail view
  useEffect(() => {
    if (!viewerProfile) {
      setViewerFollowing([]);
      return;
    }
    if (viewerProfile.id === profile.id) {
      setViewerFollowing(following);
      return;
    }
    fetchFollowing(viewerProfile.id).then(setViewerFollowing);
  }, [viewerProfile, profile.id, following]);

  const isFollowing = !!viewerProfile && followers.some((f) => f.id === viewerProfile.id);
  const canFollow = !!viewerProfile && viewerProfile.id !== profile.id;

  // taste match — the viewer's library keys, intersected with this profile's
  // items via the same canonical/title matching the feed uses for "Favorited"
  const [viewerKeys, setViewerKeys] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!viewerProfile || viewerProfile.id === profile.id) {
      setViewerKeys(null);
      return;
    }
    supabase()
      .from("items")
      .select("media_type, title, canonical_id")
      .eq("profile_id", viewerProfile.id)
      .then(({ data }) =>
        setViewerKeys(
          new Set(
            ((data ?? []) as Pick<Item, "media_type" | "title" | "canonical_id">[]).flatMap(itemKeys)
          )
        )
      );
  }, [viewerProfile, profile.id]);

  const sharedCount = useMemo(() => {
    if (!viewerKeys) return null;
    return items.filter((i) => itemKeys(i).some((k) => viewerKeys.has(k))).length;
  }, [items, viewerKeys]);

  // blocking — severs follows both ways; unblock restores nothing
  const [blocked, setBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  useEffect(() => {
    if (!viewerProfile || viewerProfile.id === profile.id) {
      setBlocked(false);
      return;
    }
    hasBlocked(viewerProfile.id, profile.id).then(setBlocked);
  }, [viewerProfile, profile.id]);

  const toggleBlock = useCallback(async () => {
    if (!viewerProfile || blockBusy) return;
    setBlockBusy(true);
    try {
      if (blocked) {
        await unblockProfile(profile.id);
        setBlocked(false);
      } else {
        await blockProfile(profile.id);
        setBlocked(true);
        setFollowers((prev) => prev.filter((f) => f.id !== viewerProfile.id));
        setFollowing((prev) => prev.filter((f) => f.id !== viewerProfile.id));
      }
    } catch (e) {
      console.error("block toggle failed:", e instanceof Error ? e.message : e);
    } finally {
      setBlockBusy(false);
    }
  }, [viewerProfile, profile.id, blocked, blockBusy]);

  const toggleFollow = useCallback(async () => {
    if (!viewerProfile || followBusy) return;
    setFollowBusy(true);
    const db = supabase();
    if (isFollowing) {
      const { error } = await db
        .from("follows")
        .delete()
        .eq("follower_id", viewerProfile.id)
        .eq("followee_id", profile.id);
      if (!error) setFollowers((prev) => prev.filter((f) => f.id !== viewerProfile.id));
    } else {
      const { error } = await db
        .from("follows")
        .insert({ follower_id: viewerProfile.id, followee_id: profile.id });
      if (!error) {
        playUi("confirm");
        setFollowers((prev) => [...prev, viewerProfile]);
      }
    }
    setFollowBusy(false);
  }, [viewerProfile, profile.id, isFollowing, followBusy]);

  // escape clears filters (NS behavior) when no overlay is open — but never
  // while typing in a field: first Escape should just leave the input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || open) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.blur();
        return;
      }
      setSearch("");
      setCategory("All");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const inCategory = useCallback(
    (item: Item) => category === "All" || categoryOf(item.media_type) === category,
    [category]
  );

  // live per-bucket counts — derived from items, so any add/delete updates them
  const counts = useMemo(() => {
    const c: Record<Category, number> = { All: items.length, Books: 0, Movies: 0, Music: 0, Other: 0 };
    for (const i of items) c[categoryOf(i.media_type)] += 1;
    return c;
  }, [items]);

  // search removes non-matches entirely; category reorders matches to the
  // top (FLIP animates the shuffle) and dims the rest
  const visible = useMemo(() => {
    let list = [...items];
    if (sort === "latest") {
      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else if (sort === "oldest") {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    } else {
      list.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.creator.toLowerCase().includes(q) ||
          i.media_type.includes(q)
      );
    }
    if (category !== "All") {
      const hit = list.filter(inCategory);
      const miss = list.filter((i) => !inCategory(i));
      list = [...hit, ...miss];
    }
    return list;
  }, [items, sort, search, category, inCategory]);

  const openItem = useCallback(
    (item: Item, rect: DOMRect, pushUrl = true) => {
      setOpen({ item, rect });
      setGridDimmed(true); // NS: the grid stays on screen, slowly fading under the morph
      if (pushUrl) {
        window.history.pushState({ favItem: item.id }, "", `/${profile.username}?item=${item.id}`);
      }
    },
    [profile.username]
  );

  /** the tile's on-screen rect, or a centered stand-in when it isn't visible */
  const rectFor = useCallback((id: string): DOMRect => {
    const el = document.querySelector(`[data-item-id="${id}"] .item-media`);
    if (el) return el.getBoundingClientRect();
    return new DOMRect(window.innerWidth / 2 - 60, window.innerHeight / 2 - 90, 120, 180);
  }, []);

  const clearItemUrl = useCallback(() => {
    if (new URLSearchParams(window.location.search).has("item")) {
      window.history.replaceState({}, "", `/${profile.username}`);
    }
  }, [profile.username]);

  // deep link: open the linked favorite once the grid has painted
  const deepLinked = useRef(false);
  useEffect(() => {
    if (!initialItemId || deepLinked.current) return;
    deepLinked.current = true;
    const item = initialItems.find((i) => i.id === initialItemId);
    if (!item) return;
    const t = setTimeout(() => openItem(item, rectFor(item.id), false), 80);
    return () => clearTimeout(t);
  }, [initialItemId, initialItems, openItem, rectFor]);

  // back/forward keeps the overlay in sync with ?item=
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    const onPop = () => {
      const id = new URLSearchParams(window.location.search).get("item");
      if (!id) {
        setOpen(null);
        setGridDimmed(false);
        return;
      }
      const item = itemsRef.current.find((i) => i.id === id);
      if (item) openItem(item, rectFor(item.id), false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openItem, rectFor]);

  const getSourceRect = useCallback(() => {
    if (!open) return null;
    const el = document.querySelector(`[data-item-id="${open.item.id}"] .item-media`);
    return el ? el.getBoundingClientRect() : null;
  }, [open]);

  const saveItem = useCallback(
    async (patch: Partial<Item>) => {
      if (!open) return;
      const { data, error } = await supabase()
        .from("items")
        .update(patch)
        .eq("id", open.item.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      const updated = data as Item;
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setOpen((o) => (o ? { ...o, item: updated } : o));
    },
    [open]
  );

  const deleteItem = useCallback(async () => {
    if (!open) return;
    const id = open.item.id;
    const { error } = await supabase().from("items").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setOpen(null);
    setGridDimmed(false);
    clearItemUrl();
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, [open, clearItemUrl]);

  // owner: pin to / unpin from the Top 4 hero row
  const togglePin = useCallback(async () => {
    if (!open) return;
    if (open.item.pinned_order) {
      await saveItem({ pinned_order: null });
      return;
    }
    const used = new Set(items.map((i) => i.pinned_order).filter(Boolean));
    const slot = [1, 2, 3, 4].find((s) => !used.has(s));
    if (!slot) throw new Error("Top four is full — unpin something first.");
    await saveItem({ pinned_order: slot });
  }, [open, items, saveItem]);

  const moveItem = useCallback(
    (id: string, pos: { pos_x: number; pos_y: number; pos_rot: number }) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...pos } : i)));
      if (!isOwner) return; // visitors can rearrange locally, nothing persists
      markHintSeen("freeform"); // they've dragged — retire the hint
      supabase().from("items").update(pos).eq("id", id).then(({ error }) => {
        if (error) console.error("position save failed:", error.message);
      });
    },
    [isOwner]
  );

  // Top 4 hero row — shown untouched at the top of the default grid view
  const pinned = useMemo(
    () =>
      items
        .filter((i) => i.pinned_order)
        .sort((a, b) => (a.pinned_order ?? 0) - (b.pinned_order ?? 0)),
    [items]
  );
  const showHero =
    view === "grid" && pinned.length > 0 && !search.trim() && category === "All" && sort === "default";
  const gridItems = useMemo(
    () => (showHero ? visible.filter((i) => !i.pinned_order) : visible),
    [showHero, visible]
  );

  // the intro shows at most 10 frames — don't hand it (and preload) more
  const introImages = useMemo(
    () => initialItems.map((i) => i.image_url).filter((u): u is string => !!u).slice(0, 10),
    [initialItems]
  );

  const freeformTileW = Math.max(54, Math.round(1000 / cols));

  // freeform is a full-screen mode: the sidebar and mobile header slide away,
  // leaving a lone floating "Grid" button as the way back
  const freeform = view === "freeform";

  return (
    <AppShell viewer={viewerProfile} signedIn={!!userId} collapsed={freeform}>
      <IntroOverlay images={introImages} />

      <ProfileHeader
        profile={profile}
        itemCount={items.length}
        followers={followers}
        following={following}
        isOwner={isOwner}
        canFollow={canFollow}
        isFollowing={isFollowing}
        followBusy={followBusy}
        onToggleFollow={toggleFollow}
        blocked={blocked}
        blockBusy={blockBusy}
        onToggleBlock={toggleBlock}
        sharedCount={sharedCount}
      />

      <LibraryToolbar
        search={search}
        onSearch={setSearch}
        category={category}
        onCategory={setCategory}
        counts={counts}
        sort={sort}
        onSort={setSort}
        view={view}
        onView={setView}
        cols={cols}
        onCols={changeCols}
      />

      {!freeform && (
        <main
          className={`relative mx-auto w-full max-w-5xl px-5 py-6 transition-opacity duration-700 ease-out sm:px-8 sm:py-8 ${
            mounted && !gridDimmed ? "opacity-100" : "opacity-0"
          }`}
        >
          {items.length === 0 ? (
            <p className="pt-16 text-center text-xs text-zinc-400">
              Nothing here yet
              {isOwner ? (
                <>
                  {" — "}
                  <Link href="/add" className="text-zinc-900 underline underline-offset-2 transition-colors hover:text-zinc-500">
                    add your first favorite
                  </Link>
                  .
                </>
              ) : (
                "."
              )}
            </p>
          ) : visible.length === 0 ? (
            <p className="pt-16 text-center text-xs text-zinc-400">No matches.</p>
          ) : (
            <>
              {showHero && (
                <div className="mb-10">
                  <p className="mb-4 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                    Top four
                  </p>
                  <Grid
                    items={pinned}
                    matches={inCategory}
                    hiddenId={open?.item.id ?? null}
                    cols={4}
                    onOpen={openItem}
                  />
                </div>
              )}
              <Grid
                items={gridItems}
                matches={inCategory}
                hiddenId={open?.item.id ?? null}
                cols={cols}
                onOpen={openItem}
              />
            </>
          )}
        </main>
      )}

      {/* freeform is a full-screen room laid over the page — the shell's
          chrome has already slid away (collapsed) */}
      {freeform && (
        <div
          className={`fixed inset-0 z-10 overflow-hidden bg-white transition-opacity duration-700 ease-out ${
            mounted && !gridDimmed ? "opacity-100" : "opacity-0"
          }`}
        >
          {isOwner && (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
              <Hint id="freeform" className="pointer-events-auto">
                Drag your favorites anywhere — the layout is yours.
              </Hint>
            </div>
          )}
          <Freeform
            items={visible}
            matches={inCategory}
            hiddenId={open?.item.id ?? null}
            tileW={freeformTileW}
            onOpen={openItem}
            onMove={moveItem}
          />
          {/* the floating button is the only way back */}
          <button
            onClick={() => setView("grid")}
            className="absolute left-5 top-5 z-30 flex cursor-pointer items-center gap-2 bg-white/85 px-3 py-2 text-xs font-medium text-zinc-900 backdrop-blur transition-opacity hover:opacity-60 md:left-8 md:top-8"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
              <rect x="1.5" y="1.5" width="5" height="5" />
              <rect x="9.5" y="1.5" width="5" height="5" />
              <rect x="1.5" y="9.5" width="5" height="5" />
              <rect x="9.5" y="9.5" width="5" height="5" />
            </svg>
            Grid
          </button>
        </div>
      )}

      {open && (
        <DetailOverlay
          item={open.item}
          sourceRect={open.rect}
          getSourceRect={getSourceRect}
          isOwner={isOwner}
          viewerProfile={viewerProfile}
          viewerFollowing={viewerFollowing}
          onCloseStart={() => setGridDimmed(false)}
          onClose={() => {
            setOpen(null);
            setGridDimmed(false);
            clearItemUrl();
          }}
          onSave={saveItem}
          onDelete={deleteItem}
          onTogglePin={isOwner ? togglePin : undefined}
          shareUrl={`/${profile.username}?item=${open.item.id}`}
        />
      )}
    </AppShell>
  );
}
