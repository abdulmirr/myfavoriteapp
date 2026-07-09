"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Item, Profile } from "@/lib/types";
import { categoryOf, type Category } from "@/lib/categories";
import { supabase } from "@/lib/supabase";
import {
  approveTaste,
  blockProfile,
  fetchFollowers,
  fetchFollowing,
  fetchRadar,
  friendlyError,
  hasApprovedTaste,
  hasBlocked,
  promoteRadar,
  removeFromRadar,
  setTasteNote,
  tasteApprovalCount,
  unapproveTaste,
  unblockProfile,
  PROFILE_COLS,
  type RadarItem,
} from "@/lib/social";
import { playSfx, playUi, preloadSfx } from "@/lib/sfx";
import { useShell } from "./ShellProvider";
import { shelfFromParam } from "./ShelfTabs";
import Sidebar, { type SortMode, type ViewMode } from "./Sidebar";
import Grid from "./Grid";
import Freeform from "./Freeform";
import DetailOverlay from "./DetailOverlay";
import IntroOverlay from "./IntroOverlay";
import Hint, { markHintSeen } from "./Hint";
import { TileMedia } from "./Tile";

/** A saved row shaped as a library Item, so tiles and the detail view frame
    it exactly like a favorite. */
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
  const [cols, setCols] = useState(5); // default density until the slider is touched
  // a touched slider (now or on a past visit) is authoritative; until then the
  // density follows the width of the column the grid actually lives in
  const [colsTouched, setColsTouched] = useState(false);
  // `saved: true` marks a queue item — the detail view then hides the
  // owner instruments (edit, delete, pin) that act on the items table
  const [open, setOpen] = useState<{ item: Item; rect: DOMRect; saved?: boolean } | null>(null);
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
    if (stored >= 3 && stored <= 20) {
      setCols(stored);
      setColsTouched(true);
    }
    const v = localStorage.getItem("fav:view"); // default view, set in /profile settings
    if (v === "grid" || v === "freeform") setView(v);
  }, []);

  // the slider fires per pointermove — debounce the (synchronous) storage
  // write so dragging only re-renders, never blocks on localStorage
  const colsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeCols = useCallback((c: number) => {
    setCols(c);
    setColsTouched(true);
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

  // tell the persistent top bar whose wall it's sitting over: your own page
  // gets the Favorites · Saved switcher, someone else's shows their handle
  const { setProfileBar } = useShell();
  useEffect(() => {
    setProfileBar({ handle: profile.username, own: isOwner });
    return () => setProfileBar(null);
  }, [profile.username, isOwner, setProfileBar]);

  // which shelf — the wall or the private queue. URL-driven (the top bar's
  // switcher writes ?shelf=saved); only ever honored on your own page.
  const shelf = shelfFromParam(useSearchParams().get("shelf"));
  const savedShelf = isOwner && shelf === "saved";

  // the queue itself, fetched when the shelf opens
  const [savedRows, setSavedRows] = useState<RadarItem[] | null>(null);
  const [savedBusy, setSavedBusy] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!savedShelf) return;
    let cancelled = false;
    fetchRadar(profile.id).then((r) => !cancelled && setSavedRows(r));
    return () => {
      cancelled = true;
    };
  }, [savedShelf, profile.id]);

  // favorite-or-remove, straight off the queue tile. favoriting also puts the
  // piece on the wall, so the wall refetches to include it.
  const actOnSaved = useCallback(
    async (r: RadarItem, action: "favorite" | "remove") => {
      if (savedBusy.has(r.id)) return;
      setSavedBusy((s) => new Set(s).add(r.id));
      try {
        if (action === "favorite") {
          await promoteRadar(r, profile.id);
          playUi("confirm");
          const { data } = await supabase()
            .from("items")
            .select("*")
            .eq("profile_id", profile.id)
            .order("sort_order", { ascending: true });
          if (data) setItems(data as Item[]);
        } else {
          await removeFromRadar(r.id);
        }
        setSavedRows((prev) => (prev ?? []).filter((x) => x.id !== r.id));
        setOpen((o) => (o?.item.id === r.id ? null : o));
      } catch {
        /* leave the row; a retry is one tap away */
      } finally {
        setSavedBusy((s) => {
          const next = new Set(s);
          next.delete(r.id);
          return next;
        });
      }
    },
    [savedBusy, profile.id]
  );

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

  // a failed follow/block used to fail silently — say what happened, briefly
  const [socialError, setSocialError] = useState("");
  const socialErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashSocialError = useCallback((msg: string) => {
    setSocialError(msg);
    if (socialErrorTimer.current) clearTimeout(socialErrorTimer.current);
    socialErrorTimer.current = setTimeout(() => setSocialError(""), 5000);
  }, []);

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
      flashSocialError(
        e instanceof Error ? friendlyError(e.message) : "Couldn't update the block — try again."
      );
    } finally {
      setBlockBusy(false);
    }
  }, [viewerProfile, profile.id, blocked, blockBusy, flashSocialError]);

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
      else flashSocialError(friendlyError(error.message));
    } else {
      const { error } = await db
        .from("follows")
        .insert({ follower_id: viewerProfile.id, followee_id: profile.id });
      if (!error) {
        playUi("confirm");
        setFollowers((prev) => [...prev, viewerProfile]);
      } else {
        flashSocialError(friendlyError(error.message));
      }
    }
    setFollowBusy(false);
  }, [viewerProfile, profile.id, isFollowing, followBusy, flashSocialError]);

  // "Approve taste" — the person-level gesture next to Follow. Count is public
  // (definer RPC); the row itself is only visible to giver + receiver.
  const [tasteCount, setTasteCount] = useState(0);
  const [approved, setApproved] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  // the optional-note nudge lives only in the moment right after approving —
  // keyed by profile id so navigating to another library never carries it over
  const [notePromptFor, setNotePromptFor] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    tasteApprovalCount(profile.id).then((c) => {
      if (!stale) setTasteCount(c);
    });
    return () => {
      stale = true;
    };
  }, [profile.id]);

  useEffect(() => {
    if (!viewerProfile || viewerProfile.id === profile.id) return;
    let stale = false;
    hasApprovedTaste(viewerProfile.id, profile.id).then((v) => {
      if (!stale) setApproved(v);
    });
    return () => {
      stale = true;
    };
  }, [viewerProfile, profile.id]);

  const toggleApprove = useCallback(async () => {
    if (!viewerProfile || approveBusy) return;
    setApproveBusy(true);
    try {
      if (approved) {
        await unapproveTaste(viewerProfile.id, profile.id);
        setApproved(false);
        setNotePromptFor(null);
        setTasteCount((c) => Math.max(0, c - 1));
      } else {
        await approveTaste(viewerProfile.id, profile.id);
        playUi("confirm");
        setApproved(true);
        setNotePromptFor(profile.id);
        setTasteCount((c) => c + 1);
      }
    } catch (e) {
      console.error("approve toggle failed:", e instanceof Error ? e.message : e);
    } finally {
      setApproveBusy(false);
    }
  }, [viewerProfile, profile.id, approved, approveBusy]);

  const sendTasteNote = useCallback(
    async (note: string) => {
      if (!viewerProfile) return;
      await setTasteNote(viewerProfile.id, profile.id, note);
      setNotePromptFor(null);
    },
    [viewerProfile, profile.id]
  );

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

  // the queue reuses the wall's two *narrowing* controls — search and
  // categories — but nothing that arranges (a queue has no curated order):
  // it stays newest-first, and category hard-filters rather than dimming,
  // since "show me just the books to read" is the whole point.
  const savedCounts = useMemo(() => {
    const c: Record<Category, number> = {
      All: savedRows?.length ?? 0, Books: 0, Movies: 0, Music: 0, Other: 0,
    };
    for (const r of savedRows ?? []) c[categoryOf(r.media_type)] += 1;
    return c;
  }, [savedRows]);

  const visibleSaved = useMemo(() => {
    let list = savedRows ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.creator ?? "").toLowerCase().includes(q) ||
          r.media_type.includes(q)
      );
    }
    if (category !== "All") list = list.filter((r) => categoryOf(r.media_type) === category);
    return list;
  }, [savedRows, search, category]);

  const openItem = useCallback(
    (item: Item, rect: DOMRect, pushUrl = true) => {
      setOpen({ item, rect });
      setGridDimmed(true); // NS: the grid stays on screen, slowly fading under the morph
      if (pushUrl) {
        // merge, don't rebuild — other query params must survive
        const url = new URL(window.location.href);
        url.searchParams.set("item", item.id);
        window.history.pushState({ favItem: item.id }, "", url.pathname + url.search);
      }
    },
    []
  );

  /** the tile's on-screen rect, or a centered stand-in when it isn't visible */
  const rectFor = useCallback((id: string): DOMRect => {
    const el = document.querySelector(`[data-item-id="${id}"] .item-media`);
    if (el) return el.getBoundingClientRect();
    return new DOMRect(window.innerWidth / 2 - 60, window.innerHeight / 2 - 90, 120, 180);
  }, []);

  const clearItemUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("item")) {
      url.searchParams.delete("item"); // keep other params intact
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);

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
    view === "grid" && pinned.length > 0 && !search.trim() && category === "All" &&
    sort === "default";
  const gridItems = useMemo(
    () => (showHero ? visible.filter((i) => !i.pinned_order) : visible),
    [showHero, visible]
  );

  // drag-to-reorder is only honest when the grid shows the real "my order":
  // owner, default sort, nothing filtered, mouse-class pointer (touch scrolls)
  const [finePointer, setFinePointer] = useState(false);
  useEffect(() => {
    let stale = false;
    queueMicrotask(() => {
      if (!stale) setFinePointer(window.matchMedia("(pointer: fine)").matches);
    });
    return () => {
      stale = true;
    };
  }, []);
  const canReorder =
    isOwner && finePointer && sort === "default" && !search.trim() &&
    category === "All";

  const commitReorder = useCallback(
    (ids: string[]) => {
      // the hero row keeps the head of the order; the grid reorders the rest
      const full = showHero ? [...pinned.map((p) => p.id), ...ids] : ids;
      const pos = new Map(full.map((id, idx) => [id, idx]));
      setItems((prev) =>
        prev.map((i) => (pos.has(i.id) ? { ...i, sort_order: pos.get(i.id)! } : i))
      );
      supabase()
        .rpc("reorder_items", { p_ids: full })
        .then(({ error }) => {
          if (error) console.error("reorder not saved:", error.message);
        });
    },
    [showHero, pinned]
  );

  // the intro shows at most 10 frames — don't hand it (and preload) more
  const introImages = useMemo(
    () => initialItems.map((i) => i.image_url).filter((u): u is string => !!u).slice(0, 10),
    [initialItems]
  );

  const freeformTileW = Math.max(54, Math.round(1000 / cols));

  // freeform is a full-screen mode: the sidebar and mobile header slide away,
  // leaving a lone floating "Grid" button as the way back
  // the queue is always a plain grid — freeform is a wall instrument
  const freeform = view === "freeform" && !savedShelf;

  // ask the persistent shell to slide its chrome away in freeform, and restore
  // it when leaving the view or the page
  const { setCollapsed } = useShell();
  useEffect(() => {
    setCollapsed(freeform);
    return () => setCollapsed(false);
  }, [freeform, setCollapsed]);

  // the gallery shares the row with the placard on desktop, so the default
  // density is measured against the column's own width, not the viewport
  const stageRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (colsTouched || freeform) return;
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setCols(w > 1040 ? 6 : w > 800 ? 5 : w > 560 ? 4 : 3);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [colsTouched, freeform]);

  return (
    <>
      <IntroOverlay images={introImages} />

      {/* full-bleed: the sidebar sits flush to the screen's left edge (below the
          top bar), the gallery fills the rest. one vertical stack on phones;
          the freeform overlay escapes this flow entirely. */}
      <div className="flex w-full flex-col md:flex-row md:items-stretch">
        <div className="md:sticky md:top-14 md:h-[calc(100dvh-3.5rem)] md:w-64 md:shrink-0">
          <Sidebar
            profile={profile}
            counts={savedShelf ? savedCounts : counts}
            followers={followers}
            following={following}
            canFollow={canFollow}
            isFollowing={isFollowing}
            followBusy={followBusy}
            onToggleFollow={toggleFollow}
            tasteCount={tasteCount}
            socialError={socialError}
            approved={approved}
            approveBusy={approveBusy}
            onToggleApprove={toggleApprove}
            noteOpen={notePromptFor === profile.id}
            onDismissNote={() => setNotePromptFor(null)}
            onSendTasteNote={sendTasteNote}
            blocked={blocked}
            blockBusy={blockBusy}
            onToggleBlock={toggleBlock}
            isOwner={isOwner}
            signedIn={!!userId}
            search={search}
            onSearch={setSearch}
            category={category}
            onCategory={setCategory}
            sort={sort}
            onSort={setSort}
            view={view}
            onView={setView}
            cols={cols}
            onCols={changeCols}
            savedShelf={savedShelf}
          />
        </div>

        {!freeform && (
          <main
            ref={stageRef}
            className={`relative min-w-0 flex-1 px-5 pb-16 pt-4 transition-opacity duration-700 ease-out sm:px-8 md:pt-8 ${
              mounted && !gridDimmed ? "opacity-100" : "opacity-0"
            }`}
          >
            {savedShelf ? (
              /* the queue: things spotted but not yet claimed, newest first.
                 same tiles, same detail view as the wall — plus the two calls
                 each row asks for: favorite it, or let it go. */
              savedRows === null ? (
                <p className="pt-16 text-center text-xs text-zinc-400 [animation:smart-search-wave_1.6s_ease-in-out_infinite]">
                  Loading…
                </p>
              ) : savedRows.length === 0 ? (
                <p className="pt-16 text-center text-xs text-zinc-400">
                  Nothing saved yet — tap the bookmark on anything you spot in the feeds.
                </p>
              ) : visibleSaved.length === 0 ? (
                <p className="pt-16 text-center text-xs text-zinc-400">No matches.</p>
              ) : (
                <div className="hover-fx grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
                  {visibleSaved.map((r) => {
                    const item = radarToItem(r);
                    return (
                      <article key={r.id} className="item-tile">
                        <button
                          onClick={(e) => {
                            const thumb =
                              e.currentTarget.querySelector(".item-media") ?? e.currentTarget;
                            playSfx(item.media_type);
                            setOpen({ item, rect: thumb.getBoundingClientRect(), saved: true });
                          }}
                          aria-label={item.title}
                          className="block w-full cursor-pointer"
                        >
                          <TileMedia item={item} />
                        </button>
                        <h3 className="mt-3 truncate text-[13px] leading-snug tracking-[-0.01em] text-zinc-900">
                          {item.title}
                        </h3>
                        {item.creator && (
                          <p className="truncate text-xs text-zinc-400">{item.creator}</p>
                        )}
                        <div className="mt-1.5 flex items-center gap-3 text-xs">
                          <button
                            onClick={() => actOnSaved(r, "favorite")}
                            disabled={savedBusy.has(r.id)}
                            className="cursor-pointer font-medium text-zinc-900 transition-colors hover:text-zinc-500 disabled:cursor-wait"
                          >
                            Favorite
                          </button>
                          <button
                            onClick={() => actOnSaved(r, "remove")}
                            disabled={savedBusy.has(r.id)}
                            className="cursor-pointer text-zinc-400 transition-colors hover:text-zinc-900 disabled:cursor-wait"
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )
            ) : items.length === 0 ? (
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
                  onReorderCommit={canReorder ? commitReorder : undefined}
                />
                {canReorder && gridItems.length > 1 && (
                  <Hint id="reorder" className="mt-8">
                    Drag a favorite to rearrange your wall — this order is yours.
                  </Hint>
                )}
              </>
            )}
          </main>
        )}
      </div>

      {/* freeform is a full-screen room laid over the page — the shell's
          chrome has already slid away (collapsed) */}
      {freeform && (
        <div
          className={`fixed inset-0 z-30 overflow-hidden bg-white transition-opacity duration-700 ease-out ${
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
          /* a saved item isn't on the wall yet — no edit/delete/pin/share */
          isOwner={open.saved ? false : isOwner}
          viewerProfile={viewerProfile}
          viewerFollowing={viewerFollowing}
          onCloseStart={() => setGridDimmed(false)}
          onClose={() => {
            setOpen(null);
            setGridDimmed(false);
            clearItemUrl();
          }}
          onSave={open.saved ? async () => {} : saveItem}
          onDelete={open.saved ? async () => {} : deleteItem}
          onTogglePin={!open.saved && isOwner ? togglePin : undefined}
          shareUrl={open.saved ? undefined : `/${profile.username}?item=${open.item.id}`}
        />
      )}
    </>
  );
}
