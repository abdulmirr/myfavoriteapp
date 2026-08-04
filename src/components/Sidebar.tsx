"use client";

import Star from "./Star";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import { CATEGORIES, type Category } from "@/lib/categories";
import { REPORT_EMAIL, socialHref } from "@/lib/social";

export type SortMode = "default" | "latest" | "oldest";
export type ViewMode = "grid" | "freeform";

/** media_type → the word the taste-match line uses */
export const MATCH_TYPE: Record<string, string> = {
  book: "books", movie: "films", tv: "shows", music: "music",
  podcast: "podcasts", video: "videos", article: "reads", photo: "photos", other: "pieces",
};

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
        <div className="absolute inset-x-0 h-px bg-zinc-300" />
        <div className="absolute h-px bg-zinc-900" style={{ left: 0, right: `${100 - pct}%` }} />
        <div
          className="absolute h-3 w-3 -translate-x-1/2 cursor-grab bg-zinc-900 shadow-sm active:cursor-grabbing"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.06em] text-zinc-400">
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
      {/* blocked hides Follow + approve, leaving ⋯ at the row's left edge —
          hang the menu from whichever side keeps it inside the sidebar */}
      {open && (
        <div className={`save-appear absolute top-full z-20 mt-2 flex w-32 flex-col border border-zinc-900/[0.06] bg-white/95 p-1 shadow-xl backdrop-blur-xl ${blocked ? "left-0" : "right-0"}`}>
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

/**
 * The moment after "Approve taste" lands: a one-time nudge to attach a short
 * note — the ice-breaker the receiver reads in their notifications. Optional
 * by design (nudge, don't gate); dismissing it loses nothing.
 */
export function TasteNoteNudge({
  onSend,
  onDismiss,
}: {
  onSend: (note: string) => Promise<void>;
  onDismiss: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const note = value.trim();
    if (!note || busy) return;
    setBusy(true);
    try {
      await onSend(note);
    } catch (e) {
      console.error("taste note failed:", e instanceof Error ? e.message : e);
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  return (
    <div className="save-appear">
      <div className="flex items-center gap-1.5 border-b border-zinc-300 pb-1 focus-within:border-zinc-900">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
            if (e.key === "Escape") onDismiss();
          }}
          maxLength={140}
          placeholder="Add a note (optional)"
          className="w-full bg-transparent text-[11px] text-zinc-900 outline-none placeholder:text-zinc-400"
        />
        {value.trim() ? (
          <button
            onClick={send}
            disabled={busy}
            className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-zinc-900 transition-colors hover:text-zinc-400 disabled:cursor-wait"
          >
            Send
          </button>
        ) : (
          <button
            onClick={onDismiss}
            aria-label="Skip the note"
            className="cursor-pointer text-zinc-400 transition-colors hover:text-zinc-900"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M2 2l8 8M10 2L2 10" />
            </svg>
          </button>
        )}
      </div>
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
  initialTab,
  onClose,
}: {
  closing: boolean;
  followerCount: number;
  followingCount: number;
  followers: Profile[];
  following: Profile[];
  /** which list the opener asked for — the two counts are separate doors */
  initialTab: "followers" | "following";
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"followers" | "following">(initialTab);
  // reopening from the other count lands on that list
  useEffect(() => setTab(initialTab), [initialTab]);

  const people = tab === "followers" ? followers : following;
  const empty = tab === "followers" ? "No followers yet." : "Not following anyone yet.";

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-white px-5 pb-4 pt-6 md:absolute md:z-10 md:px-8 md:py-8 ${
        closing ? "people-out" : "people-in"
      }`}
    >
      {/* one header row: the count toggle left, the X right — the list starts
          where the sidebar's own content does, no dead band above it */}
      <div className="flex h-6 items-center justify-between">
        <div className="flex gap-4 text-xs">
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

      {people.length === 0 ? (
        <p className="mt-5 text-xs text-zinc-400">{empty}</p>
      ) : (
        <ul className="mt-4 flex-1 overflow-y-auto overscroll-contain">
          {people.map((f) => (
            <li key={f.id}>
              <Link
                href={`/${f.username}`}
                onClick={onClose}
                className="flex min-w-0 items-center gap-3 py-2 transition-opacity hover:opacity-60"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden bg-zinc-100">
                  {f.avatar_url ? (
                    <img
                      src={f.avatar_url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-semibold text-zinc-400">
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
  counts,
  followers,
  following,
  canFollow,
  isFollowing,
  followBusy,
  onToggleFollow,
  tasteCount,
  socialError,
  approved,
  approveBusy,
  onToggleApprove,
  noteOpen,
  onDismissNote,
  onSendTasteNote,
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
  savedShelf = false,
}: {
  profile: Profile;
  counts: Record<Category, number>;
  followers: Profile[];
  following: Profile[];
  canFollow: boolean;
  isFollowing: boolean;
  followBusy: boolean;
  onToggleFollow: () => void;
  tasteCount: number;
  /** transient failure from follow/block — cleared by the caller */
  socialError: string;
  approved: boolean;
  approveBusy: boolean;
  onToggleApprove: () => void;
  /** the optional-note nudge, shown only right after approving */
  noteOpen: boolean;
  onDismissNote: () => void;
  onSendTasteNote: (note: string) => Promise<void>;
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
  /** the Saved queue is showing — the wall's instruments step aside */
  savedShelf?: boolean;
}) {
  const [searchFocused, setSearchFocused] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleTab, setPeopleTab] = useState<"followers" | "following">("followers");
  const openPeople = (tab: "followers" | "following") => {
    setPeopleTab(tab);
    setPeopleOpen(true);
  };
  const onClosePeople = useCallback(() => setPeopleOpen(false), []);
  const asideRef = useRef<HTMLElement>(null);
  const followerCount = followers.length;
  const followingCount = following.length;

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
      <aside
        ref={asideRef}
        className={`relative flex w-full flex-col gap-6 overscroll-contain px-5 pb-4 pt-6 md:h-full md:px-8 md:py-8 ${
          peopleShown ? "md:overflow-hidden" : "md:overflow-y-auto"
        }`}
      >
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
                <span className="text-sm font-semibold text-zinc-400">
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
          {/* two counts, two doors — each highlights and opens on its own */}
          <div className="flex gap-3 font-mono text-[11px] text-zinc-400">
            <button
              onClick={() => openPeople("followers")}
              className="cursor-pointer whitespace-nowrap transition-[color,transform] duration-150 hover:-translate-y-px hover:text-zinc-900"
            >
              {followerCount} Follower{followerCount === 1 ? "" : "s"}
            </button>
            <button
              onClick={() => openPeople("following")}
              className="cursor-pointer whitespace-nowrap transition-[color,transform] duration-150 hover:-translate-y-px hover:text-zinc-900"
            >
              {followingCount} Following
            </button>
          </div>
          {socialError && (
            <p className="save-appear text-[11px] text-red-500">{socialError}</p>
          )}
          {/* actions live in the text column, left-aligned like everything else.
              action row: follow (solid, same language as Favorite) + approve
              taste (quiet sibling) + ⋯ (block/report); socials get their own
              line below, on the same rhythm. */}
          <div className="mt-1.5 flex flex-col gap-3">
            {/* one action row: your page → edit; theirs → follow + approve +
                block/report; copy-link rides along in both */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {isOwner && (
                <Link
                  href="/profile"
                  className="flex h-8 shrink-0 items-center whitespace-nowrap border border-zinc-200 px-3.5 text-xs font-medium text-zinc-500 shadow-[0_1px_2px_rgb(16_16_16/0.04)] transition hover:border-zinc-300 hover:text-zinc-900"
                >
                  Edit profile
                </Link>
              )}
              {canFollow && !blocked && (
                <>
                  <button
                    onClick={onToggleFollow}
                    disabled={followBusy}
                    className={`flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap px-3.5 text-xs font-medium transition disabled:cursor-wait ${
                      isFollowing
                        ? "border border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-900"
                        : "bg-zinc-900 text-white hover:bg-zinc-700"
                    }`}
                  >
                    {isFollowing ? "Following ✓" : "Follow"}
                  </button>
                  <button
                    onClick={onToggleApprove}
                    disabled={approveBusy}
                    aria-label={approved ? "Approved — tap to undo" : "Approve taste"}
                    title={approved ? "Approved" : "Approve taste"}
                    className={`flex h-7 shrink-0 cursor-pointer items-center transition-colors disabled:cursor-wait ${
                      approved ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill={approved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
                      <path d="M2.5 7.5h2v6h-2z" />
                      <path d="M4.5 12.7c.4.5 1 .8 1.7.8h4.7c.6 0 1.1-.4 1.2-1l.9-4.2c.1-.7-.4-1.3-1.1-1.3H8.7l.6-2.6c.1-.6-.2-1.2-.8-1.4-.5-.2-1 0-1.2.5L4.5 7.5" />
                    </svg>
                  </button>
                </>
              )}
              <ShareButton username={profile.username} />
              {canFollow && (
                <MoreButton
                  username={profile.username}
                  blocked={blocked}
                  blockBusy={blockBusy}
                  onToggleBlock={onToggleBlock}
                />
              )}
            </div>
            {canFollow && !blocked && noteOpen && (
              <TasteNoteNudge onSend={onSendTasteNote} onDismiss={onDismissNote} />
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
          {/* taste stats — the footnote of the profile zone, below the actions
              and socials so the identity → actions → metadata order holds */}
          {tasteCount > 0 && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400/90">
              {`${tasteCount} approve${tasteCount === 1 ? "s" : ""} ${isOwner ? "your" : "their"} taste`}
            </p>
          )}
        </div>

        {/* library controls — separated from the profile zone by extra
            whitespace. phones get the visitor's essentials only: search and
            the category row; sort, grid ⇄ freeform and the size slider are
            desktop instruments (the phone grid is locked to two columns and
            custom order is already the best default). the Saved queue keeps
            the two *narrowing* controls (search + categories) but drops the
            *arranging* ones — a queue has no curated order to sort or shape. */}
        <div className="flex flex-col gap-5 pt-2 md:gap-6 md:pt-6">
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

        {/* categories with live counts — a sticky tab row on phones (re-filter
            from anywhere in the wall), a vertical list on desktop */}
        <nav className="sticky top-14 z-20 -mx-5 flex gap-x-5 overflow-x-auto bg-white/85 px-5 py-2.5 text-xs backdrop-blur [scrollbar-width:none] md:static md:z-auto md:mx-0 md:flex-col md:gap-1 md:overflow-visible md:bg-transparent md:p-0 md:backdrop-blur-none">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => onCategory(c)}
              className={`w-fit cursor-pointer whitespace-nowrap text-left transition-colors ${
                category === c
                  ? "font-medium text-zinc-900"
                  : "text-zinc-400 hover:text-zinc-900"
              }`}
            >
              {c === "All" ? (
                "All"
              ) : (
                <>
                  {/* the count gets the data whisper — mono against the grotesk */}
                  <span className="font-mono text-[11px]">{counts[c] ?? 0}</span> {c}
                </>
              )}
            </button>
          ))}
        </nav>

        {/* sort + view — one tight group, matching row rhythm. desktop-only:
            phones are for visiting, not curating. gone on the Saved queue —
            these arrange the wall, and a queue isn't arranged. */}
        {!savedShelf && (
        <>
        <div className="hidden flex-col gap-1 text-xs md:flex">
          {/* one word that cycles: custom (your order) → latest → oldest */}
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
            {sort === "default" ? "Custom" : sort === "latest" ? "Latest" : "Oldest"}
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
        </>
        )}
        </div>

        {/* favorite — pinned to the bottom edge, its own action zone. desktop
            only: on phones the top bar's ＋ carries adding */}
        {isOwner && (
          <Link
            href="/add"
            className="mt-auto hidden h-10 w-full shrink-0 cursor-pointer items-center justify-center gap-2 bg-zinc-900 text-sm font-medium text-white shadow-lg shadow-zinc-900/10 transition hover:bg-zinc-700 md:flex"
          >
            <Star className="h-4 w-4 text-[#f7a71e]" />
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
            initialTab={peopleTab}
            onClose={onClosePeople}
          />
        )}

        {/* footer — signed-out visitors get the same action bar as owners */}
        {!signedIn && (
          <Link
            href={`/signin?next=/${profile.username}`}
            className="mt-auto hidden h-10 w-full shrink-0 cursor-pointer items-center justify-center bg-zinc-900 text-sm font-medium text-white shadow-lg shadow-zinc-900/10 transition hover:bg-zinc-700 md:flex"
          >
            Start curating
          </Link>
        )}
      </aside>
    </>
  );
}
