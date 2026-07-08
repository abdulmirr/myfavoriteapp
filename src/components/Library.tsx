"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Item, Profile } from "@/lib/types";
import { categoryOf, type Category } from "@/lib/categories";
import { supabase } from "@/lib/supabase";
import {
  approveTaste,
  blockProfile,
  createCollection,
  deleteCollection,
  fetchCollectionItemIds,
  fetchCollections,
  fetchFollowers,
  fetchFollowing,
  fetchTasteMatch,
  friendlyError,
  hasApprovedTaste,
  hasBlocked,
  setTasteNote,
  tasteApprovalCount,
  unapproveTaste,
  unblockProfile,
  PROFILE_COLS,
  type Collection,
  type TasteMatch,
} from "@/lib/social";
import { playUi, preloadSfx } from "@/lib/sfx";
import Sidebar, { type SortMode, type ViewMode } from "./Sidebar";
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
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [followers, setFollowers] = useState<Profile[]>([]);
  const [following, setFollowing] = useState<Profile[]>([]);
  const [viewerFollowing, setViewerFollowing] = useState<Profile[]>([]);
  const [peopleOpen, setPeopleOpen] = useState(false);
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

  // curator shelves: public on the page, ?c=<id> makes a filtered view shareable
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [collectionItemIds, setCollectionItemIds] = useState<Set<string> | null>(null);

  const collectionsLoaded = useRef(false);
  const loadCollections = useCallback(() => {
    fetchCollections(profile.id).then((c) => {
      collectionsLoaded.current = true;
      setCollections(c);
    });
  }, [profile.id]);

  useEffect(() => {
    loadCollections();
    // a shared collection link opens pre-filtered (deferred a tick — the
    // repo's hook rules ban synchronous setState inside effects)
    const c = new URLSearchParams(window.location.search).get("c");
    if (!c) return;
    let stale = false;
    queueMicrotask(() => {
      if (!stale) setSelectedCollection(c);
    });
    return () => {
      stale = true;
    };
  }, [loadCollections]);

  useEffect(() => {
    let stale = false;
    if (!selectedCollection) {
      queueMicrotask(() => {
        if (!stale) setCollectionItemIds(null);
      });
    } else {
      fetchCollectionItemIds(selectedCollection).then((ids) => {
        if (!stale) setCollectionItemIds(ids);
      });
    }
    return () => {
      stale = true;
    };
  }, [selectedCollection]);

  const selectCollection = useCallback((id: string | null) => {
    setSelectedCollection(id);
    // keep the URL shareable without adding history entries per tap
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("c", id);
    else url.searchParams.delete("c");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  // a stale/foreign ?c= (deleted shelf, mistyped link, other profile's id)
  // would filter the wall to a dead "No matches." — drop it once collections
  // have actually loaded and the id isn't among them
  useEffect(() => {
    if (!selectedCollection || !collectionsLoaded.current) return;
    if (collections.some((c) => c.id === selectedCollection)) return;
    let stale = false;
    queueMicrotask(() => {
      if (!stale) selectCollection(null);
    });
    return () => {
      stale = true;
    };
  }, [collections, selectedCollection, selectCollection]);

  // shared favorites between the viewer and this library — the compatibility read
  const [tasteMatch, setTasteMatch] = useState<TasteMatch | null>(null);
  useEffect(() => {
    let stale = false;
    if (!viewerProfile || viewerProfile.id === profile.id) {
      queueMicrotask(() => {
        if (!stale) setTasteMatch(null);
      });
    } else {
      fetchTasteMatch(viewerProfile.id, profile.id).then((m) => {
        if (!stale) setTasteMatch(m);
      });
    }
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
    // a collection is a subset, not an ordering — non-members leave entirely
    if (collectionItemIds) list = list.filter((i) => collectionItemIds.has(i.id));
    return list;
  }, [items, sort, search, category, inCategory, collectionItemIds]);

  const openItem = useCallback(
    (item: Item, rect: DOMRect, pushUrl = true) => {
      setOpen({ item, rect });
      setGridDimmed(true); // NS: the grid stays on screen, slowly fading under the morph
      if (pushUrl) {
        // merge, don't rebuild — a selected collection's ?c= must survive
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
      url.searchParams.delete("item"); // keep ?c= and friends intact
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
    sort === "default" && !selectedCollection;
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
    category === "All" && !selectedCollection;

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
  const freeform = view === "freeform";

  return (
    <div className="flex h-screen overflow-hidden">
      <IntroOverlay images={introImages} />

      <Sidebar
        profile={profile}
        itemsCount={items.length}
        counts={counts}
        followerCount={followers.length}
        followingCount={following.length}
        onPeople={() => setPeopleOpen(true)}
        peopleOpen={peopleOpen}
        onClosePeople={() => setPeopleOpen(false)}
        followers={followers}
        following={following}
        canFollow={canFollow}
        isFollowing={isFollowing}
        followBusy={followBusy}
        onToggleFollow={toggleFollow}
        tasteCount={tasteCount}
        tasteMatch={tasteMatch}
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
        collections={collections}
        selectedCollection={selectedCollection}
        onSelectCollection={selectCollection}
        onCreateCollection={async (name) => {
          const c = await createCollection(profile.id, name);
          setCollections((prev) => [...prev, c]);
        }}
        onDeleteCollection={async (id) => {
          await deleteCollection(id);
          setCollections((prev) => prev.filter((c) => c.id !== id));
          if (selectedCollection === id) selectCollection(null);
        }}
        sort={sort}
        onSort={setSort}
        view={view}
        onView={(v) => {
          setView(v);
          setMobileMenu(false);
        }}
        cols={cols}
        onCols={changeCols}
        collapsed={freeform}
        mobileOpen={mobileMenu}
        onCloseMobile={() => setMobileMenu(false)}
      />

      <div
        className={`relative flex flex-1 flex-col ${
          freeform ? "overflow-hidden" : "overflow-y-auto overscroll-contain"
        }`}
      >
        {/* mobile header — slides up and out in freeform */}
        <header
          className={`z-30 flex min-h-[4.5rem] shrink-0 items-center justify-between bg-white/85 px-5 py-4 backdrop-blur transition-[margin,opacity] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] md:hidden ${
            freeform ? "pointer-events-none relative -mt-[4.5rem] opacity-0" : "sticky top-0"
          }`}
        >
          {/* the mark goes home, same as the sidebar's */}
          <Link href="/" aria-label="Home" className="w-fit transition-opacity hover:opacity-70">
            <img src="/favicon.svg" alt="Favorites" className="h-6 w-auto" />
          </Link>
          <button
            aria-label="Menu"
            onClick={() => setMobileMenu((m) => !m)}
            className="-mr-3 flex h-10 w-10 cursor-pointer items-center justify-center"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" stroke="#18181b" strokeWidth="1.5" strokeLinecap="round">
              <line
                x1="1" y1="8" x2="15" y2="8"
                style={{
                  transform: mobileMenu ? "rotate(45deg)" : "translateY(-4px)",
                  transformOrigin: "center",
                  transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
              <line
                x1="1" y1="8" x2="15" y2="8"
                style={{ opacity: mobileMenu ? 0 : 1, transition: "opacity 200ms ease" }}
              />
              <line
                x1="1" y1="8" x2="15" y2="8"
                style={{
                  transform: mobileMenu ? "rotate(-45deg)" : "translateY(4px)",
                  transformOrigin: "center",
                  transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </svg>
          </button>
        </header>

        {/* freeform is full-screen — this floating button is the only way back */}
        <button
          onClick={() => setView("grid")}
          aria-hidden={!freeform}
          tabIndex={freeform ? 0 : -1}
          className={`absolute left-5 top-5 z-30 flex cursor-pointer items-center gap-2 bg-white/85 px-3 py-2 text-xs font-medium text-zinc-900 backdrop-blur transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] hover:opacity-60 md:left-8 md:top-8 ${
            freeform ? "translate-x-0 opacity-100 delay-150" : "pointer-events-none -translate-x-3 opacity-0 delay-0"
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
            <rect x="1.5" y="1.5" width="5" height="5" />
            <rect x="9.5" y="1.5" width="5" height="5" />
            <rect x="1.5" y="9.5" width="5" height="5" />
            <rect x="9.5" y="9.5" width="5" height="5" />
          </svg>
          Grid
        </button>

        <main
          className={`relative transition-opacity duration-700 ease-out ${
            mounted && !gridDimmed ? "opacity-100" : "opacity-0"
          } ${view === "freeform" ? "min-h-0 flex-1" : "px-5 py-6 sm:px-8 sm:py-8"}`}
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
          ) : view === "grid" ? (
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
          ) : (
            <>
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
            </>
          )}
        </main>
      </div>

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
          onCollectionsChanged={loadCollections}
        />
      )}
    </div>
  );
}
