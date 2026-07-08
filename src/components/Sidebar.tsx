"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import { CATEGORIES, type Category } from "@/lib/categories";
import { REPORT_EMAIL, socialHref } from "@/lib/social";

export type SortMode = "default" | "latest" | "oldest";
export type ViewMode = "grid" | "freeform";

export const MIN_COLS = 3;
export const MAX_COLS = 20;

/** Hairline slider (NS price-slider visuals): 1px track, 8×8 square handle. */
function SizeSlider({ cols, onCols }: { cols: number; onCols: (c: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // left = small items (many columns), right = large items (few columns)
  const pct = ((MAX_COLS - cols) / (MAX_COLS - MIN_COLS)) * 100;

  const set = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const p = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onCols(Math.round(MAX_COLS - p * (MAX_COLS - MIN_COLS)));
    },
    [onCols]
  );

  return (
    <div>
      <div
        ref={trackRef}
        className="relative mx-1 flex h-5 cursor-pointer touch-none items-center select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          set(e.clientX);
        }}
        onPointerMove={(e) => dragging && set(e.clientX)}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
        }}
      >
        <div className="absolute inset-x-0 h-px bg-zinc-400" />
        <div className="absolute h-px bg-zinc-900" style={{ left: 0, right: `${100 - pct}%` }} />
        <div
          className="absolute h-2 w-2 -translate-x-1/2 cursor-grab bg-zinc-900 active:cursor-grabbing"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-zinc-400">
        <span>Small</span>
        <span>Large</span>
      </div>
    </div>
  );
}

/** Share this page — native share sheet on touch, clipboard everywhere else. */
export function ShareButton({ username }: { username: string }) {
  const [done, setDone] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/${username}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <button
      onClick={share}
      aria-label="Copy link to this page"
      title={done ? "Copied" : "Copy link"}
      className={`cursor-pointer transition-colors ${
        done ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
      }`}
    >
      {done ? (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
      ) : (
        /* two sheets — copy, same mark as the piece overlay */
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
          <rect x="5.5" y="5.5" width="8" height="8" />
          <path d="M10.5 3.5v-1h-8v8h1" />
        </svg>
      )}
    </button>
  );
}

/** Minimal line icons for known social platforms; falls back to a text label. */
export function SocialIcon({ label }: { label: string }) {
  const key = label.trim().toLowerCase();
  if (key === "x" || key.includes("twitter")) {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M12.6 1h2.2L9.9 6.6 15.7 15h-4.6L7.6 9.9 3.5 15H1.3l5.3-6L1 1h4.7l3.2 4.6L12.6 1zm-.8 12.7h1.2L4.9 2.2H3.6l8.2 11.5z" />
      </svg>
    );
  }
  if (key.includes("instagram") || key === "ig") {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
        <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" />
        <circle cx="8" cy="8" r="3" />
        <circle cx="11.8" cy="4.2" r="0.4" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (key.includes("spotify")) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    );
  }
  if (key.includes("apple") || key.includes("music")) {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 12.5V4l7.5-1.7v8.5" />
        <circle cx="4" cy="12.5" r="1.9" />
        <circle cx="11.6" cy="10.8" r="1.9" />
      </svg>
    );
  }
  if (key.includes("pinterest")) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z" />
      </svg>
    );
  }
  if (key.includes("website") || key.includes("site")) {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
        <circle cx="8" cy="8" r="6.3" />
        <ellipse cx="8" cy="8" rx="2.8" ry="6.3" />
        <path d="M1.7 8h12.6" />
      </svg>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-[0.08em]">{label}</span>
  );
}

/** "⋯" — block/report tucked behind one quiet icon; the menu makes you choose. */
export function MoreButton({
  username,
  blocked,
  blockBusy,
  onToggleBlock,
}: {
  username: string;
  blocked: boolean;
  blockBusy: boolean;
  onToggleBlock: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // click-away or escape closes
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More options"
        title="More"
        className={`cursor-pointer transition-colors ${
          open ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
        }`}
      >
        {/* three dots */}
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="3" cy="8" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="13" cy="8" r="1.3" />
        </svg>
      </button>
      {open && (
        <div className="save-appear absolute left-0 top-full z-20 mt-2 flex w-28 flex-col border border-zinc-200 bg-white py-1 shadow-xl">
          <button
            onClick={() => {
              setOpen(false);
              onToggleBlock();
            }}
            disabled={blockBusy}
            className="cursor-pointer px-3 py-1.5 text-left text-xs text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-red-500 disabled:cursor-wait"
          >
            {blocked ? "Unblock" : "Block"}
          </button>
          <a
            href={`mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(
              `Report: @${username}`
            )}`}
            onClick={() => setOpen(false)}
            className="px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
          >
            Report
          </a>
        </div>
      )}
    </div>
  );
}

/** In-sidebar followers/following list, one tab at a time. */
function PeoplePanel({
  closing,
  followerCount,
  followingCount,
  followers,
  following,
  onClose,
}: {
  closing: boolean;
  followerCount: number;
  followingCount: number;
  followers: Profile[];
  following: Profile[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"followers" | "following">("followers");

  const people = tab === "followers" ? followers : following;
  const empty = tab === "followers" ? "No followers yet." : "Not following anyone yet.";

  return (
    <div
      className={`absolute inset-0 z-10 flex flex-col bg-white px-5 pb-4 pt-6 md:px-8 md:py-8 ${
        closing ? "people-out" : "people-in"
      }`}
    >
      {/* the X gets the header row to itself — same corner as the copy icon */}
      <div className="flex h-6 items-center justify-end">
        <button
          onClick={onClose}
          aria-label="Close"
          className="cursor-pointer text-zinc-400 transition-colors hover:text-zinc-900"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M2 2l8 8M10 2L2 10" />
          </svg>
        </button>
      </div>

      {/* count toggle — same idiom as the Latest/Oldest switch */}
      <div className="mt-6 flex gap-4 text-xs">
        <button
          onClick={() => setTab("followers")}
          className={`cursor-pointer whitespace-nowrap transition-colors ${
            tab === "followers" ? "font-medium text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
          }`}
        >
          {followerCount} Follower{followerCount === 1 ? "" : "s"}
        </button>
        <button
          onClick={() => setTab("following")}
          className={`cursor-pointer whitespace-nowrap transition-colors ${
            tab === "following" ? "font-medium text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
          }`}
        >
          {followingCount} Following
        </button>
      </div>

      {people.length === 0 ? (
        <p className="mt-6 text-xs text-zinc-400">{empty}</p>
      ) : (
        <ul className="mt-5 flex-1 overflow-y-auto overscroll-contain">
          {people.map((f) => (
            <li key={f.id}>
              <Link
                href={`/${f.username}`}
                onClick={onClose}
                className="flex min-w-0 items-center gap-3 py-2 transition-opacity hover:opacity-60"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden bg-zinc-100">
                  {f.avatar_url ? (
                    <img src={f.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-semibold text-zinc-300">
                      {(f.display_name || f.username).slice(0, 1)}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs text-zinc-900">{f.display_name}</div>
                  <div className="truncate text-[11px] text-zinc-400">@{f.username}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Sidebar({
  profile,
  itemsCount,
  counts,
  followerCount,
  followingCount,
  onPeople,
  peopleOpen,
  onClosePeople,
  followers,
  following,
  canFollow,
  isFollowing,
  followBusy,
  onToggleFollow,
  blocked,
  blockBusy,
  onToggleBlock,
  isOwner,
  signedIn,
  search,
  onSearch,
  category,
  onCategory,
  sort,
  onSort,
  view,
  onView,
  cols,
  onCols,
  collapsed,
  mobileOpen,
  onCloseMobile,
}: {
  profile: Profile;
  itemsCount: number;
  counts: Record<Category, number>;
  followerCount: number;
  followingCount: number;
  onPeople: () => void;
  peopleOpen: boolean;
  onClosePeople: () => void;
  followers: Profile[];
  following: Profile[];
  canFollow: boolean;
  isFollowing: boolean;
  followBusy: boolean;
  onToggleFollow: () => void;
  blocked: boolean;
  blockBusy: boolean;
  onToggleBlock: () => void;
  isOwner: boolean;
  signedIn: boolean;
  search: string;
  onSearch: (v: string) => void;
  category: Category;
  onCategory: (c: Category) => void;
  sort: SortMode;
  onSort: (s: SortMode) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  cols: number;
  onCols: (c: number) => void;
  /** freeform full-screen — slides the whole sidebar off-canvas */
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const [searchFocused, setSearchFocused] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  // people panel stays mounted through its fade-out, then unmounts
  const [peopleShown, setPeopleShown] = useState(peopleOpen);
  useEffect(() => {
    if (peopleOpen) {
      setPeopleShown(true);
      return;
    }
    const t = setTimeout(() => setPeopleShown(false), 160);
    return () => clearTimeout(t);
  }, [peopleOpen]);

  // people panel: esc or a click anywhere outside the sidebar closes it
  useEffect(() => {
    if (!peopleOpen) return;
    asideRef.current?.scrollTo({ top: 0 });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClosePeople();
    const onDown = (e: PointerEvent) => {
      if (asideRef.current && !asideRef.current.contains(e.target as Node)) onClosePeople();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [peopleOpen, onClosePeople]);

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Close menu"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 cursor-default bg-zinc-900/20 backdrop-blur-[1px] md:hidden"
        />
      )}
      <aside
        ref={asideRef}
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-60 max-w-[72vw] shrink-0 flex-col gap-6 overscroll-contain bg-white px-5 pb-4 pt-6 shadow-xl transition-[transform,margin,visibility] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] md:relative md:z-auto md:w-64 md:max-w-none md:translate-x-0 md:px-8 md:py-8 md:shadow-none ${
          peopleShown ? "overflow-hidden" : "overflow-y-auto"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"} ${
          collapsed ? "md:invisible md:-ml-64" : "md:visible md:ml-0"
        }`}
      >
        {/* the mark goes home — the one nav convention nobody has to learn */}
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Home" className="w-fit transition-opacity hover:opacity-70">
            <img src="/favicon.svg" alt="Favorites" className="h-6 w-auto" />
          </Link>
          <ShareButton username={profile.username} />
        </div>

        {/* profile */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden bg-zinc-100">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-sm font-semibold text-zinc-300">
                  {(profile.display_name || profile.username).slice(0, 1)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold leading-tight tracking-tight text-zinc-900">
                {profile.display_name}
              </h1>
              <p className="truncate text-xs text-zinc-400">@{profile.username}</p>
            </div>
          </div>
          {profile.bio && (
            <p className="text-xs leading-relaxed text-zinc-500">{profile.bio}</p>
          )}
          <button
            onClick={onPeople}
            className="w-fit cursor-pointer text-left text-xs text-zinc-400 transition-colors hover:text-zinc-900"
          >
            <span className="whitespace-nowrap">
              {followerCount} Follower{followerCount === 1 ? "" : "s"}
            </span>
            {" · "}
            <span className="whitespace-nowrap">{followingCount} Following</span>
          </button>
          {/* actions live in the text column, left-aligned like everything else.
              action row: follow (solid, same language as Favorite) + ⋯
              (block/report); socials get their own line below. */}
          {(canFollow || (profile.socials?.length ?? 0) > 0) && (
          <div className="mt-1 flex flex-col gap-2">
            {canFollow && (
              <div className="flex items-center gap-x-3">
                {!blocked && (
                  <button
                    onClick={onToggleFollow}
                    disabled={followBusy}
                    className={`flex h-7 shrink-0 cursor-pointer items-center whitespace-nowrap px-3 text-xs font-medium transition-colors disabled:cursor-wait ${
                      isFollowing
                        ? "border border-zinc-200 text-zinc-400 hover:text-zinc-900"
                        : "bg-zinc-900 text-white hover:bg-zinc-700"
                    }`}
                  >
                    {isFollowing ? "Following ✓" : "Follow"}
                  </button>
                )}
                <MoreButton
                  username={profile.username}
                  blocked={blocked}
                  blockBusy={blockBusy}
                  onToggleBlock={onToggleBlock}
                />
              </div>
            )}
            {(profile.socials?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {profile.socials?.map((s) => (
                  <a
                    key={s.url}
                    href={socialHref(s.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="text-zinc-400 transition-colors hover:text-zinc-900"
                  >
                    <SocialIcon label={s.label} />
                  </a>
                ))}
              </div>
            )}
          </div>
          )}
        </div>

        {/* library controls — separated from the profile zone by extra whitespace */}
        <div className="flex flex-col gap-6 pt-6">
        {/* search */}
        <div>
          <div className="group flex items-start gap-1.5 border-b border-zinc-400 pb-1.5 focus-within:border-zinc-900">
            <svg
              className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400 group-focus-within:text-zinc-900"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="5" cy="5" r="4" />
              <path d="M8 8l3 3" />
            </svg>
            <textarea
              rows={1}
              value={search}
              placeholder="Search"
              onChange={(e) => onSearch(e.target.value.replace(/\n/g, ""))}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full resize-none overflow-hidden bg-transparent text-xs leading-4 text-zinc-900 outline-none placeholder:text-zinc-400"
            />
          </div>
          <div
            className={`grid transition-all duration-200 ${
              searchFocused ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden">
              <p className="pt-1.5 text-xs text-zinc-400">Filters as you type</p>
            </div>
          </div>
        </div>

        {/* categories with live counts */}
        <nav className="flex flex-col gap-1 text-xs">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => onCategory(c)}
              className={`w-fit cursor-pointer text-left transition-colors ${
                category === c
                  ? "font-medium text-zinc-900"
                  : "text-zinc-400 hover:text-zinc-900"
              }`}
            >
              {c === "All" ? "All" : `${counts[c] ?? 0} ${c}`}
            </button>
          ))}
        </nav>

        {/* sort + view — one tight group, matching row rhythm */}
        <div className="flex flex-col gap-1 text-xs">
          {/* one word that cycles: my order → latest → oldest → my order */}
          <button
            onClick={() =>
              onSort(sort === "default" ? "latest" : sort === "latest" ? "oldest" : "default")
            }
            className={`w-fit cursor-pointer text-left transition-colors ${
              sort === "default"
                ? "text-zinc-400 hover:text-zinc-900"
                : "font-medium text-zinc-900"
            }`}
          >
            {sort === "oldest" ? "Oldest" : "Latest"}
          </button>
          <div className="flex gap-3">
            {(["grid", "freeform"] as const).map((v) => (
              <button
                key={v}
                onClick={() => onView(v)}
                className={`cursor-pointer transition-colors ${
                  view === v ? "font-medium text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
                }`}
              >
                {v === "grid" ? "Grid" : "Freeform"}
              </button>
            ))}
          </div>
        </div>

        {/* size — on phones the grid is locked to two columns (globals.css),
            so the slider only shows there when it still does something */}
        <div className={view === "grid" ? "hidden md:block" : undefined}>
          <SizeSlider cols={cols} onCols={onCols} />
        </div>
        </div>

        {/* favorite — pinned to the bottom edge, its own action zone */}
        {isOwner && (
          <Link
            href="/add"
            className="mt-auto flex h-9 w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            <img src="/favicon.svg" alt="" className="h-4 w-auto" />
            Favorite
          </Link>
        )}


        {peopleShown && (
          <PeoplePanel
            closing={!peopleOpen}
            followerCount={followerCount}
            followingCount={followingCount}
            followers={followers}
            following={following}
            onClose={onClosePeople}
          />
        )}

        {/* footer — signed-out visitors get the same action bar as owners */}
        {!signedIn && (
          <Link
            href={`/signin?next=/${profile.username}`}
            className="mt-auto flex h-9 w-full shrink-0 cursor-pointer items-center justify-center bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Start curating
          </Link>
        )}
      </aside>
    </>
  );
}
