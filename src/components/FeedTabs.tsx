"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/types";
import { useUnread } from "@/lib/unread";

/**
 * The Home feed switcher — For You / Friends / Explore — living next to the
 * mark in the top bar (not on its own line), so signed-in Home is one band of
 * chrome, not two. Which feed is showing rides in the URL (`?feed=…`), so a
 * feed is linkable and the back button works. Desktop renders the three as
 * icons (home, bell, search); on phones they collapse into a dropdown
 * labelled with the current feed.
 *
 * Friends doubles as the notifications tab, so it wears the unread badge the
 * bell used to carry.
 *
 * `useSearchParams` makes this a CSR-bailout island: every caller must wrap it
 * in <Suspense> (see AppShell / the Home page).
 */
export type Feed = "foryou" | "following" | "explore";

// every tab is an explicit param change — a bare "/" for For You made
// switching back a same-URL-ish navigation the router cache could swallow.
// the `following` key predates the Friends rename; it stays for old links.
export const FEEDS: { key: Feed; label: string; href: string }[] = [
  { key: "foryou", label: "For You", href: "/?feed=foryou" },
  { key: "explore", label: "Explore", href: "/?feed=explore" },
  { key: "following", label: "Friends", href: "/?feed=following" },
];

export function feedFromParam(param: string | null | undefined): Feed {
  return param === "following" ? "following" : param === "explore" ? "explore" : "foryou";
}

/** the page reads the active feed the same way the switcher does */
export function useFeed(): Feed {
  return feedFromParam(useSearchParams().get("feed"));
}

/** one glyph per feed, stroke-drawn on the chrome's 1.4px hairline */
function FeedIcon({ feed }: { feed: Feed }) {
  if (feed === "foryou") {
    // home — For You is the front door
    return (
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2.5 6.5L8 2l5.5 4.5V14h-4v-4h-3v4h-4V6.5z" />
      </svg>
    );
  }
  if (feed === "following") {
    // a person — Friends is the people tab (it still wears the unread badge).
    // head + shoulders drawn to the home icon's footprint (x 2.25–13.75) so
    // the three glyphs read as one weight.
    return (
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="8" cy="5" r="3" />
        <path d="M2.25 13.75c.75-3.3 3-5 5.75-5s5 1.7 5.75 5" />
      </svg>
    );
  }
  // magnifier — Explore is the search
  return (
    <svg width="16" height="16" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <circle cx="5" cy="5" r="4" />
      <path d="M8 8l3 3" />
    </svg>
  );
}

/** the red count — same mark whether it sits on the icon or a dropdown row */
function UnreadBadge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`notif-badge save-appear flex h-[11px] min-w-[11px] items-center justify-center rounded-full bg-[#e53935] px-[3px] text-[7px] font-semibold leading-none text-white tabular-nums ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export default function FeedTabs({ viewer = null }: { viewer?: Profile | null }) {
  const active = feedFromParam(useSearchParams().get("feed"));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeLabel = FEEDS.find((f) => f.key === active)!.label;
  const unread = useUnread(viewer?.id);

  // outside-click closes the phone dropdown
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

  // making a choice (the feed changed) closes the menu
  useEffect(() => setOpen(false), [active]);

  return (
    <>
      {/* desktop: three icons, beside the mark */}
      <nav className="hidden items-center gap-1.5 sm:flex">
        {FEEDS.map((f) => (
          <Link
            key={f.key}
            href={f.href}
            title={f.label}
            aria-label={
              f.key === "following" && unread > 0 ? `${f.label}, ${unread} unread` : f.label
            }
            className={`relative flex h-8 w-8 items-center justify-center transition-colors ${
              active === f.key ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
            }`}
          >
            <FeedIcon feed={f.key} />
            {f.key === "following" && (
              <UnreadBadge count={unread} className="absolute right-0 top-0.5" />
            )}
          </Link>
        ))}
      </nav>

      {/* phones: the current feed as a dropdown */}
      <div ref={rootRef} className="relative sm:hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="relative flex cursor-pointer items-center gap-1 text-xs font-medium text-zinc-900"
        >
          {activeLabel}
          <svg
            width="9"
            height="9"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path d="M2.5 4.5L6 8l3.5-3.5" />
          </svg>
          {/* unseen notifications peek through even while another feed shows */}
          {active !== "following" && unread > 0 && (
            <span className="absolute -right-2 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#e53935]" />
          )}
        </button>
        {open && (
          <div className="save-appear absolute left-0 top-full z-40 mt-3 flex w-44 flex-col border border-zinc-900/[0.06] bg-white/90 p-1.5 shadow-2xl backdrop-blur-xl">
            {FEEDS.map((f) => (
              <Link
                key={f.key}
                href={f.href}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-xs transition-colors ${
                  active === f.key
                    ? "bg-zinc-900/[0.05] font-medium text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-900/[0.04] hover:text-zinc-900"
                }`}
              >
                <FeedIcon feed={f.key} />
                {f.label}
                {f.key === "following" && <UnreadBadge count={unread} className="ml-auto" />}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
