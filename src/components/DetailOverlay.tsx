"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Item, Profile } from "@/lib/types";
import {
  addToRadar,
  copyItem,
  createCollection,
  fetchCollections,
  fetchItemCollectionIds,
  setItemInCollection,
  whoSaved,
  favoritedCount,
  PROFILE_COLS,
  REPORT_EMAIL,
  type Collection,
} from "@/lib/social";
import { supabase } from "@/lib/supabase";
import { playUi } from "@/lib/sfx";
import dynamic from "next/dynamic";

// opens on click only — its chunk (with framer-motion) loads on demand
const FriendsPanel = dynamic(() => import("./FriendsPanel"));
import Hint, { markHintSeen } from "./Hint";

const EASE_MORPH = "cubic-bezier(0.1, 0, 0, 1)";
const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MORPH_IN_MS = () => (reduceMotion() ? 1 : 560);
const MORPH_OUT_MS = () => (reduceMotion() ? 1 : 336);

/**
 * Full-screen white overlay with a shared-element morph from the grid tile
 * (NS ProductDetail pattern): image morphs from the tile rect, white fades in
 * beneath, info column rises in ~100ms later. Close reverses the morph.
 */
function themeBg(alpha: number) {
  const dark = document.documentElement.classList.contains("dark");
  return dark ? `rgba(14, 14, 15, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
}

export default function DetailOverlay({
  item,
  sourceRect,
  getSourceRect,
  isOwner,
  viewerProfile,
  viewerFollowing,
  onClose,
  onCloseStart,
  onSave,
  onDelete,
  onFavorited,
  startFavoriting,
  onTogglePin,
  shareUrl,
  onCollectionsChanged,
}: {
  item: Item;
  sourceRect: DOMRect;
  getSourceRect: () => DOMRect | null;
  isOwner: boolean;
  viewerProfile: Profile | null;
  viewerFollowing: Profile[];
  onClose: () => void;
  onCloseStart: () => void;
  onSave: (patch: Partial<Item>) => Promise<void>;
  onDelete: () => Promise<void>;
  /** lets the opener (e.g. the Friends feed) mirror a favorite made in here */
  onFavorited?: (item: Item) => void;
  /** open with the favorite-thoughts prompt already up (feed's Favorite button) */
  startFavoriting?: boolean;
  /** owner: pin/unpin this item on the Top 4 hero row */
  onTogglePin?: () => Promise<void>;
  /** permalink path for the copy-link action (e.g. /abdulmir?item=…) */
  shareUrl?: string;
  /** owner: lets the library refresh sidebar collection counts after shelving */
  onCollectionsChanged?: () => void;
}) {
  const bgRef = useRef<HTMLDivElement>(null);
  const imgBoxRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [creator, setCreator] = useState(item.creator);
  const [description, setDescription] = useState(item.description);
  const [savedBy, setSavedBy] = useState<Profile[]>([]);
  const [showSavedBy, setShowSavedBy] = useState(false);
  const [savedByMe, setSavedByMe] = useState<boolean | null>(null); // null = still checking
  const [favBusy, setFavBusy] = useState(false);
  // favoriting still opens a thoughts prompt first — the note is encouraged
  // (it's what makes the copy yours) but never required
  const [favOpen, setFavOpen] = useState(startFavoriting ?? false);
  const [favThoughts, setFavThoughts] = useState("");
  const [actionError, setActionError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  // the private shelf: null = still checking; the row id doubles as "on radar"
  const [radarId, setRadarId] = useState<string | null>(null);
  const [radarChecked, setRadarChecked] = useState(false);
  const [radarBusy, setRadarBusy] = useState(false);
  // owner shelving: collections + this item's memberships, loaded on first open
  const [collectOpen, setCollectOpen] = useState(false);
  const [ownerCollections, setOwnerCollections] = useState<Collection[] | null>(null);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [collectBusy, setCollectBusy] = useState<Set<string>>(new Set());
  const [newShelf, setNewShelf] = useState("");
  const [newShelfBusy, setNewShelfBusy] = useState(false);

  // who in the viewer's circle (and the viewer) also favorited this,
  // plus the network-wide count and the "via @user" provenance
  const [totalSaves, setTotalSaves] = useState(0);
  const [viaProfile, setViaProfile] = useState<Profile | null>(null);
  useEffect(() => {
    let cancelled = false;
    const candidates = [
      ...viewerFollowing.map((f) => f.id),
      ...(viewerProfile ? [viewerProfile.id] : []),
    ].filter((id) => id !== item.profile_id);
    if (candidates.length) {
      whoSaved(item, candidates).then((ids) => {
        if (cancelled) return;
        setSavedBy(viewerFollowing.filter((f) => ids.has(f.id) && f.id !== item.profile_id));
        setSavedByMe(!!viewerProfile && ids.has(viewerProfile.id));
      });
    } else {
      setSavedBy([]);
      setSavedByMe(viewerProfile ? false : null);
    }
    if (item.profile_id && !item.id.startsWith("discover-")) {
      favoritedCount(item).then((n) => !cancelled && setTotalSaves(n));
    }
    if (item.via_profile_id) {
      supabase()
        .from("profiles")
        .select(PROFILE_COLS)
        .eq("id", item.via_profile_id)
        .maybeSingle()
        .then(({ data }) => !cancelled && setViaProfile((data as Profile) ?? null));
    } else {
      setViaProfile(null);
    }
    if (viewerProfile && viewerProfile.id !== item.profile_id) {
      supabase()
        .from("radar_items")
        .select("id")
        .eq("profile_id", viewerProfile.id)
        .eq("media_type", item.media_type)
        .eq("title", item.title)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return;
          setRadarId(data?.id ?? null);
          setRadarChecked(true);
        });
    } else {
      setRadarId(null);
      setRadarChecked(false);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, viewerProfile, viewerFollowing]);

  // one exit from edit mode — the Cancel button and the mobile X share it,
  // so a new editable field can't be reset in one and forgotten in the other
  const cancelEdit = () => {
    setEditing(false);
    setConfirmDelete(false);
    setActionError("");
    setTitle(item.title);
    setCreator(item.creator);
    setDescription(item.description);
  };

  const openCollect = async () => {
    if (collectOpen) {
      setCollectOpen(false);
      return;
    }
    setCollectOpen(true);
    if (!ownerCollections) {
      const [cols, mine] = await Promise.all([
        fetchCollections(item.profile_id),
        fetchItemCollectionIds(item.id),
      ]);
      setOwnerCollections(cols);
      setMemberOf(mine);
    }
  };

  const toggleMembership = async (collectionId: string) => {
    if (collectBusy.has(collectionId)) return;
    setCollectBusy((s) => new Set(s).add(collectionId));
    const joining = !memberOf.has(collectionId);
    try {
      await setItemInCollection(collectionId, item.id, joining);
      setMemberOf((prev) => {
        const next = new Set(prev);
        if (joining) next.add(collectionId);
        else next.delete(collectionId);
        return next;
      });
      setOwnerCollections((prev) =>
        (prev ?? []).map((c) =>
          c.id === collectionId ? { ...c, count: c.count + (joining ? 1 : -1) } : c
        )
      );
      onCollectionsChanged?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't update the collection.");
    } finally {
      setCollectBusy((s) => {
        const next = new Set(s);
        next.delete(collectionId);
        return next;
      });
    }
  };

  const createShelfWithItem = async () => {
    const name = newShelf.trim();
    if (!name || newShelfBusy) return;
    setNewShelfBusy(true);
    setActionError("");
    try {
      const c = await createCollection(item.profile_id, name);
      await setItemInCollection(c.id, item.id, true);
      setOwnerCollections((prev) => [...(prev ?? []), { ...c, count: 1 }]);
      setMemberOf((prev) => new Set(prev).add(c.id));
      setNewShelf("");
      onCollectionsChanged?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't create that collection.");
    } finally {
      setNewShelfBusy(false);
    }
  };

  const toggleRadar = async () => {
    if (!viewerProfile || radarBusy) return;
    setRadarBusy(true);
    setActionError("");
    try {
      if (radarId) {
        await supabase().from("radar_items").delete().eq("id", radarId);
        setRadarId(null);
      } else {
        await addToRadar(item, viewerProfile.id);
        const { data } = await supabase()
          .from("radar_items")
          .select("id")
          .eq("profile_id", viewerProfile.id)
          .eq("media_type", item.media_type)
          .eq("title", item.title)
          .maybeSingle();
        setRadarId(data?.id ?? null);
        playUi("confirm");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't update your radar.");
    } finally {
      setRadarBusy(false);
    }
  };

  // the canonical work's own page — everyone who loves it, network-wide
  const itemPageHref = item.canonical_id
    ? `/item/${item.canonical_id.split("/").map(encodeURIComponent).join("/")}`
    : null;

  const favorite = async () => {
    if (!viewerProfile || favBusy || savedByMe) return;
    setFavBusy(true);
    try {
      await copyItem(item, viewerProfile.id, favThoughts.trim());
      playUi("confirm");
      setSavedByMe(true);
      setFavOpen(false);
      onFavorited?.(item);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Favorite failed — try again.");
      setFavOpen(false);
    } finally {
      setFavBusy(false);
    }
  };

  const togglePin = async () => {
    if (!onTogglePin || pinBusy) return;
    setPinBusy(true);
    setActionError("");
    try {
      await onTogglePin();
      markHintSeen("pin"); // they've found the feature — retire the hint
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't update the pin.");
    } finally {
      setPinBusy(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setActionError("Couldn't copy the link.");
    }
  };

  // open morph — useLayoutEffect so the start transform is applied BEFORE the
  // first paint; with useEffect the detail flashed at its final position for a
  // frame, which read as a fade instead of a move
  useLayoutEffect(() => {
    const box = imgBoxRef.current;
    const bg = bgRef.current;
    const info = infoRef.current;
    if (!box || !bg || !info) return;

    // measure with any parked transform cleared — StrictMode runs this effect
    // twice, and measuring the already-parked box made target ≈ sourceRect, so
    // the second run computed a zero morph that overrode the real one
    box.style.transform = "";
    const target = box.getBoundingClientRect();
    const scale = sourceRect.width / target.width;
    const startTransform = `translate(${sourceRect.left - target.left}px, ${
      sourceRect.top - target.top
    }px) scale(${scale})`;

    // park everything at its start state for the first paint...
    box.style.transform = startTransform;
    info.style.opacity = "0";

    let cancelled = false;
    const anims: Animation[] = [];
    const begin = () => {
      if (cancelled) return;
      anims.push(
        box.animate(
          [{ transform: startTransform }, { transform: "translate(0, 0) scale(1)" }],
          { duration: MORPH_IN_MS(), easing: EASE_MORPH, fill: "both" }
        ),
        // fade ONLY the backdrop — the morphing image must stay fully opaque
        // while it travels, or the move reads as a crossfade
        bg.animate([{ backgroundColor: themeBg(0) }, { backgroundColor: themeBg(1) }], {
          duration: 360,
          easing: "ease-out",
          fill: "both",
        }),
        info.animate(
          [
            { opacity: 0, transform: "translateY(8px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 150, delay: 100, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "both" }
        )
      );
    };

    // ...and only start the clock once the detail image is decoded — starting
    // immediately let the decode stall eat most of the 560ms, so the morph
    // appeared to teleport
    const img = box.querySelector("img");
    if (img instanceof HTMLImageElement) {
      img.decode().catch(() => {}).then(begin);
    } else {
      begin();
    }

    return () => {
      cancelled = true;
      for (const a of anims) a.cancel();
      box.style.transform = "";
      info.style.opacity = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    onCloseStart(); // grid starts fading back in while we morph out
    const box = imgBoxRef.current;
    const bg = bgRef.current;
    const info = infoRef.current;
    const back = getSourceRect() ?? sourceRect;
    if (box && bg && info) {
      const target = box.getBoundingClientRect();
      const scale = back.width / target.width;
      info.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 90,
        easing: "ease-in",
        fill: "both",
      });
      bg.animate([{ backgroundColor: themeBg(1) }, { backgroundColor: themeBg(0) }], {
        duration: 216,
        delay: Math.max(0, MORPH_OUT_MS() - 216),
        easing: "ease-in",
        fill: "both",
      });
      const anim = box.animate(
        [
          { transform: "translate(0, 0) scale(1)" },
          {
            transform: `translate(${back.left - target.left}px, ${
              back.top - target.top
            }px) scale(${scale})`,
          },
        ],
        { duration: MORPH_OUT_MS(), easing: EASE_MORPH, fill: "both" }
      );
      anim.onfinish = () => onClose();
    } else {
      onClose();
    }
  }, [getSourceRect, onClose, sourceRect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (favOpen) {
        setFavOpen(false);
        return;
      }
      if (!editing && !showSavedBy) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, editing, showSavedBy, favOpen]);

  const save = async () => {
    setBusy(true);
    setActionError("");
    try {
      await onSave({ title, creator, description });
      setEditing(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Save failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteNow = async () => {
    setBusy(true);
    setActionError("");
    try {
      await onDelete();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete failed — try again.");
      setBusy(false);
    }
  };

  // same per-medium frames as TileMedia, so the morph lands on an identical object
  const frame =
    item.media_type === "photo"
      ? "polaroid"
      : item.media_type === "video"
        ? "screenframe"
        : item.media_type === "book"
          ? "bookframe"
          : item.media_type === "movie" || item.media_type === "tv"
            ? "posterframe"
            : item.media_type === "music"
              ? "vinylframe"
              : null;
  const year = item.metadata?.year ? String(item.metadata.year) : "";
  const addedDate = new Date(item.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      ref={bgRef}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      className="fixed inset-0 z-[60] overflow-y-auto"
    >
      <div
        className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-8 px-6 py-16 md:grid-cols-2 md:gap-16 md:px-12"
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          // mirror the Escape handler: a stray backdrop tap must never
          // discard an in-progress edit (or a sub-panel) silently
          if (favOpen) {
            setFavOpen(false);
            return;
          }
          if (editing || showSavedBy) return;
          close();
        }}
      >
        <div
          ref={imgBoxRef}
          className="relative z-10 flex aspect-square w-full max-w-[560px] items-center justify-center [container-type:inline-size]"
          style={{ transformOrigin: "top left" }}
        >
          {item.image_url ? (
            frame ? (
              // shrink-wraps the image's natural aspect, matching TileMedia
              <div className={frame}>
                <img
                  src={item.image_url}
                  alt={item.title}
                  className={`block bg-zinc-100 ${
                    frame === "polaroid"
                      ? "max-h-[75cqw] max-w-[75cqw]"
                      : frame === "vinylframe"
                        ? "max-h-[86cqw] max-w-[86cqw]"
                        : "max-h-[92cqw] max-w-[88cqw]"
                  }`}
                />
              </div>
            ) : (
              <img
                src={item.image_url}
                alt={item.title}
                className="max-h-full max-w-full object-contain"
              />
            )
          ) : (
            <div className="flex h-full w-full flex-col justify-end border border-zinc-200 p-6">
              <span className="text-sm text-zinc-900">{item.title}</span>
              <span className="mt-1 text-xs text-zinc-400">{item.creator}</span>
            </div>
          )}
        </div>

        <div ref={infoRef} className="relative z-0 flex w-full max-w-md flex-col justify-self-start">
          {!editing ? (
            <>
              <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                {item.creator || item.media_type}
              </span>
              <h1 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight text-zinc-900">
                {item.title}
              </h1>
              {year && <p className="mt-1.5 text-sm text-zinc-700">{year}</p>}
              {item.description && (
                <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-zinc-500">
                  {item.description}
                </p>
              )}
              <div className="mt-4 flex items-center gap-4">
                {viewerProfile && !isOwner && savedByMe !== null && (
                  savedByMe ? (
                    <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                      Favorited
                    </span>
                  ) : (
                    <button
                      onClick={() => setFavOpen(true)}
                      className="flex h-7 cursor-pointer items-center gap-1 bg-zinc-900 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
                    >
                      <img src="/favicon.svg" alt="" className="h-3.5 w-auto" />
                      Favorite
                    </button>
                  )
                )}
                {/* the quiet middle gesture — intrigued, not ready to claim it */}
                {viewerProfile && !isOwner && savedByMe === false && radarChecked && (
                  <button
                    onClick={toggleRadar}
                    disabled={radarBusy}
                    title={radarId ? "On your radar — tap to remove" : "Put on your radar (private)"}
                    className={`cursor-pointer text-[10px] uppercase tracking-[0.08em] transition-colors disabled:cursor-wait ${
                      radarId ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
                    }`}
                  >
                    {radarId ? "On radar ✓" : "Radar"}
                  </button>
                )}
                {/* signed-out viewers get the same button — it leads through
                    sign-in and back to this exact item */}
                {!viewerProfile && item.profile_id && !item.id.startsWith("discover-") && (
                  <Link
                    href={`/signin?next=${encodeURIComponent(shareUrl ?? "/")}`}
                    className="flex h-7 cursor-pointer items-center gap-1 bg-zinc-900 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
                  >
                    <img src="/favicon.svg" alt="" className="h-3.5 w-auto" />
                    Favorite
                  </Link>
                )}
                {item.view_url && (
                  <a
                    href={item.view_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] uppercase tracking-[0.08em] text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-900 hover:underline"
                  >
                    View
                  </a>
                )}
                {isOwner && (
                  <button
                    onClick={() => {
                      setActionError("");
                      setEditing(true);
                    }}
                    className="cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
                  >
                    Edit
                  </button>
                )}
                {isOwner && onTogglePin && (
                  <button
                    onClick={togglePin}
                    disabled={pinBusy}
                    aria-label={item.pinned_order ? "Unpin from top four" : "Pin to top four"}
                    title={item.pinned_order ? "Unpin from top four" : "Pin to top four"}
                    className={`cursor-pointer transition-colors disabled:cursor-wait ${
                      item.pinned_order ? "text-zinc-900 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-900"
                    }`}
                  >
                    {/* pushpin — filled while pinned */}
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 16 16"
                      fill={item.pinned_order ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <path d="M6 1.5h4l-.5 4 2.5 3v1.5H4V8.5l2.5-3-.5-4z" />
                      <path d="M8 10v4.5" fill="none" />
                    </svg>
                  </button>
                )}
                {isOwner && item.profile_id && (
                  <button
                    onClick={openCollect}
                    title="Add to a collection"
                    className={`cursor-pointer text-[10px] uppercase tracking-[0.08em] transition-colors ${
                      collectOpen ? "text-zinc-900 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-900"
                    }`}
                  >
                    Collect
                  </button>
                )}
                {shareUrl && (
                  <button
                    onClick={copyLink}
                    aria-label="Copy link"
                    title={copied ? "Copied" : "Copy link"}
                    className={`cursor-pointer transition-colors ${
                      copied ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
                    }`}
                  >
                    {copied ? (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M3 8.5 6.5 12 13 4.5" />
                      </svg>
                    ) : (
                      /* two sheets — copy */
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
                        <rect x="5.5" y="5.5" width="8" height="8" />
                        <path d="M10.5 3.5v-1h-8v8h1" />
                      </svg>
                    )}
                  </button>
                )}
                {!isOwner && item.profile_id && !item.id.startsWith("discover-") && (
                  <a
                    href={`mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(
                      `Report: ${item.title}`
                    )}&body=${encodeURIComponent(
                      typeof window !== "undefined" ? window.location.href : ""
                    )}`}
                    aria-label="Report this favorite"
                    title="Report"
                    className="text-zinc-300 transition-colors hover:text-red-500"
                  >
                    {/* flag */}
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
                      <path d="M3.5 14.5v-13" />
                      <path d="M3.5 2.5h9l-2 3 2 3h-9" />
                    </svg>
                  </a>
                )}
              </div>
              {actionError && (
                <p className="save-appear mt-2 text-[11px] text-red-500">{actionError}</p>
              )}
              {collectOpen && (
                <div className="save-appear mt-3 flex flex-col gap-1.5 border-l border-zinc-100 pl-3">
                  {ownerCollections === null ? (
                    <p className="text-[11px] text-zinc-400">Loading…</p>
                  ) : (
                    <>
                      {ownerCollections.map((c) => {
                        const member = memberOf.has(c.id);
                        return (
                          <button
                            key={c.id}
                            onClick={() => toggleMembership(c.id)}
                            disabled={collectBusy.has(c.id)}
                            className={`w-fit cursor-pointer text-left text-xs transition-colors disabled:cursor-wait ${
                              member ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
                            }`}
                          >
                            {member ? "✓ " : ""}
                            {c.name}
                          </button>
                        );
                      })}
                      <input
                        value={newShelf}
                        maxLength={40}
                        placeholder={
                          ownerCollections.length ? "New collection…" : "Name a collection…"
                        }
                        onChange={(e) => setNewShelf(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && createShelfWithItem()}
                        disabled={newShelfBusy}
                        className="w-full max-w-[200px] border-b border-zinc-200 bg-transparent pb-0.5 text-xs text-zinc-900 outline-none placeholder:text-zinc-300 focus:border-zinc-400 disabled:cursor-wait"
                      />
                    </>
                  )}
                </div>
              )}
              {isOwner && onTogglePin && !item.pinned_order && (
                <Hint id="pin" className="mt-2">
                  Pin — put it in your Top Four.
                </Hint>
              )}
              {item.created_at && (
                <div className="mt-6">
                  <p className="text-[11px] text-zinc-400">Added</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {addedDate}
                    {viaProfile && (
                      <>
                        {" · put on by "}
                        <Link
                          href={`/${viaProfile.username}`}
                          className="text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-900 hover:underline"
                        >
                          @{viaProfile.username}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              )}
              {savedBy.length > 0 ? (
                <div className="save-appear mt-6 flex items-center gap-2.5">
                  <button
                    onClick={() => setShowSavedBy(true)}
                    aria-label="See everyone who favorited this"
                    className="flex cursor-pointer gap-1 transition-opacity hover:opacity-70"
                  >
                    {savedBy.slice(0, 3).map((p) => (
                      <span
                        key={p.id}
                        title={p.display_name || `@${p.username}`}
                        className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden bg-zinc-100"
                      >
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[9px] font-semibold text-zinc-300">
                            {(p.display_name || p.username).slice(0, 1)}
                          </span>
                        )}
                      </span>
                    ))}
                  </button>
                  <span className="text-[11px] text-zinc-400">
                    Favorited by{" "}
                    <Link
                      href={`/${savedBy[0].username}`}
                      className="text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-900 hover:underline"
                    >
                      {savedBy[0].display_name || `@${savedBy[0].username}`}
                    </Link>
                    {totalSaves > savedBy.length
                      ? ` and ${totalSaves - savedBy.length} other${totalSaves - savedBy.length === 1 ? "" : "s"}`
                      : savedBy.length > 1
                        ? ` and ${savedBy.length - 1} other${savedBy.length > 2 ? "s" : ""} you follow`
                        : ""}
                    {itemPageHref && (
                      <>
                        {" · "}
                        <Link
                          href={itemPageHref}
                          className="text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-900 hover:underline"
                        >
                          everyone →
                        </Link>
                      </>
                    )}
                  </span>
                </div>
              ) : totalSaves > 0 ? (
                <p className="save-appear mt-6 text-[11px] text-zinc-400">
                  Favorited by {totalSaves} {totalSaves === 1 ? "person" : "people"}
                  {itemPageHref && totalSaves > 1 && (
                    <>
                      {" · "}
                      <Link
                        href={itemPageHref}
                        className="text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-900 hover:underline"
                      >
                        everyone →
                      </Link>
                    </>
                  )}
                </p>
              ) : null}
            </>
          ) : (
            <div className="save-appear flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                  Creator
                </span>
                <input
                  value={creator}
                  onChange={(e) => setCreator(e.target.value)}
                  className="border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                  Your thoughts
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  placeholder="Why is this a favorite?"
                  className="resize-none border border-zinc-200 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={save}
                  disabled={busy}
                  className="h-9 cursor-pointer bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-wait disabled:bg-zinc-400"
                >
                  {busy ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={cancelEdit}
                  className="cursor-pointer px-2 text-xs text-zinc-400 transition-colors hover:text-zinc-900"
                >
                  Cancel
                </button>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="ml-auto cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-red-500"
                  >
                    Delete
                  </button>
                ) : (
                  <span className="save-appear ml-auto text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                    delete?{" "}
                    <button
                      disabled={busy}
                      onClick={confirmDeleteNow}
                      className="cursor-pointer text-red-500 transition-colors hover:text-red-700"
                    >
                      yes
                    </button>{" "}
                    /{" "}
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="cursor-pointer transition-colors hover:text-zinc-900"
                    >
                      no
                    </button>
                  </span>
                )}
              </div>
              {actionError && (
                <p className="save-appear text-[11px] text-red-500">{actionError}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 hidden text-center text-xs text-zinc-400 md:block">
        Click outside to return
      </div>
      <button
        aria-label={editing ? "Cancel edit" : "Close"}
        onClick={() => {
          // mid-edit, the X backs out of the edit (like Cancel) instead of
          // silently discarding it with the whole overlay — same guard the
          // backdrop and Escape already apply
          if (editing) cancelEdit();
          else close();
        }}
        className="fixed right-6 top-6 z-10 cursor-pointer text-zinc-400 md:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 4l14 14M18 4L4 18" />
        </svg>
      </button>

      {showSavedBy && (
        <FriendsPanel
          title="Favorited by"
          friends={savedBy}
          viewer={viewerProfile}
          viewerFollowing={viewerFollowing}
          onClose={() => setShowSavedBy(false)}
        />
      )}

      {favOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 pt-[26vh]">
          <button
            aria-label="Close"
            onClick={() => setFavOpen(false)}
            className="fixed inset-0 cursor-default bg-white/35 backdrop-blur-[2px]"
          />
          <div className="save-appear relative w-full max-w-md border border-zinc-200 bg-white p-5 shadow-2xl">
            <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">Favoriting</p>
            <p className="mt-1 truncate text-sm font-medium text-zinc-900">
              {item.title}
              {item.creator && <span className="font-normal text-zinc-400"> — {item.creator}</span>}
            </p>
            <textarea
              value={favThoughts}
              onChange={(e) => setFavThoughts(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Your thoughts — why is this a favorite?"
              className="mt-3 w-full resize-none border border-zinc-200 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] text-zinc-400">
              Optional — a line on why makes it yours.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={favorite}
                disabled={favBusy}
                className="flex h-9 cursor-pointer items-center gap-2 bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-default disabled:bg-zinc-400"
              >
                <img src="/favicon.svg" alt="" className="h-4.5 w-auto" />
                {favBusy ? "Saving..." : "Favorite"}
              </button>
              <button
                onClick={() => setFavOpen(false)}
                className="cursor-pointer text-xs text-zinc-400 transition-colors hover:text-zinc-900"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
