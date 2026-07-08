"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";
import Notifications from "./Notifications";

/**
 * The persistent chrome every signed-in page lives inside — mounted once by
 * ShellProvider, above the pages, so navigation only swaps the content and the
 * rail never remounts. Desktop: an icons-only left rail that widens to labels
 * on hover, the primary action (Favorite) the one solid button below the nav.
 * Mobile: a slim top bar + bottom tab bar.
 *
 * Hover is JS-driven, not CSS `:hover`, for two reasons: clicking a nav item
 * collapses the rail and keeps it collapsed until you leave and re-enter (so it
 * doesn't snap back open under the cursor after navigating), and it stays flat
 * — a hairline edge, no shadow.
 *
 * `collapsed` slides all chrome away (freeform view is full-screen).
 */
export default function AppShell({
  viewer,
  signedIn,
  collapsed = false,
  children,
}: {
  /** the signed-in viewer's profile — null while loading or signed out */
  viewer: Profile | null;
  signedIn: boolean;
  collapsed?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isHome = pathname === "/";
  const isExplore = pathname.startsWith("/explore");
  const isYou = !!viewer && pathname === `/${viewer.username}`;

  // hover-intent: expand on enter, collapse on leave — but a click (which
  // navigates) collapses and suppresses re-expansion until the pointer
  // actually leaves and returns, so the rail never pops open under the cursor.
  const [expanded, setExpanded] = useState(false);
  const suppressed = useRef(false);
  const onNav = () => {
    setExpanded(false);
    suppressed.current = true;
  };

  const rowClass = (active: boolean) =>
    `flex w-full cursor-pointer items-center py-2 transition-colors ${
      active ? "font-medium text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
    }`;

  // labels ride along hidden; the rail's expansion reveals them
  const labelClass = `ml-3 whitespace-nowrap transition-opacity duration-200 ${
    expanded ? "opacity-100" : "opacity-0"
  }`;

  const iconBox = "flex h-8 w-8 shrink-0 items-center justify-center";

  const avatar = (size: string, text: string) => (
    <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden bg-zinc-100`}>
      {viewer?.avatar_url ? (
        <img src={viewer.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className={`${text} font-semibold text-zinc-300`}>
          {(viewer?.display_name || viewer?.username || "?").slice(0, 1)}
        </span>
      )}
    </span>
  );

   const homeIcon = (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 6.5 8 2l5.5 4.5V14h-4v-4h-3v4h-4V6.5z" />
    </svg>
  );

  const exploreIcon = (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="8" r="6.3" />
      <path d="m10.5 5.5-1.6 3.4-3.4 1.6 1.6-3.4 3.4-1.6z" />
    </svg>
  );

  return (
    <div className="min-h-dvh md:flex">
      {/* ── desktop rail: icons at rest, labels on hover ─────────────────── */}
      {/* z-50 must sit on the aside itself: sticky elements form their own
          stacking context, so an inner z-index can never beat the page's
          sticky headers or transformed tiles from inside it */}
      <aside
        className={`relative z-50 hidden shrink-0 transition-[margin,visibility] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] md:sticky md:top-0 md:block md:h-screen md:w-16 ${
          collapsed ? "md:invisible md:-ml-16" : "md:visible md:ml-0"
        }`}
      >
        <div
          onMouseEnter={() => {
            if (!suppressed.current) setExpanded(true);
          }}
          onMouseLeave={() => {
            suppressed.current = false;
            setExpanded(false);
          }}
          className={`absolute inset-y-0 left-0 z-50 flex flex-col overflow-hidden border-r border-zinc-100 bg-white px-4 py-8 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            expanded ? "w-56" : "w-16"
          }`}
        >
          <Link href="/" aria-label="Home" onClick={onNav} className="mb-8 flex h-8 w-8 shrink-0 items-center justify-center transition-opacity hover:opacity-70">
            <img src="/favicon.svg" alt="Favorites" className="h-6 w-auto" />
          </Link>

          <nav className="flex flex-col gap-1 text-sm">
            <Link href="/" onClick={onNav} className={rowClass(isHome)} title="Home">
              <span className={iconBox}>{homeIcon}</span>
              <span className={labelClass}>Home</span>
            </Link>
            {/* signed-out visitors get Explore here — their door into the
                network; signed in, it lives as a tab on Home */}
            {!signedIn && (
              <Link href="/explore" onClick={onNav} className={rowClass(isExplore)} title="Explore">
                <span className={iconBox}>{exploreIcon}</span>
                <span className={labelClass}>Explore</span>
              </Link>
            )}
            {viewer && (
              <div className="py-2">
                <Notifications viewer={viewer} align="left" label="Notifications" labelShown={expanded} />
              </div>
            )}
            {viewer && (
              <Link href={`/${viewer.username}`} onClick={onNav} className={rowClass(isYou)} title="Your library">
                <span className={iconBox}>{avatar("h-6 w-6", "text-[10px]")}</span>
                <span className={labelClass}>You</span>
              </Link>
            )}
          </nav>

          {/* the primary action — the one solid thing in the rail */}
          {signedIn && (
            <Link
              href="/add"
              onClick={onNav}
              title="Add a favorite"
              className="mt-4 flex h-10 w-full shrink-0 cursor-pointer items-center bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              <span className="flex h-10 w-8 shrink-0 items-center justify-center">
                <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
                  <rect x="1.5" y="1.5" width="13" height="13" />
                  <path d="M8 5v6M5 8h6" />
                </svg>
              </span>
              <span className={labelClass}>Favorite</span>
            </Link>
          )}

          <div className="mt-auto flex flex-col text-sm">
            {signedIn ? (
              <Link href="/profile" onClick={onNav} className={rowClass(pathname === "/profile")} title="Settings">
                <span className={iconBox}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </span>
                <span className={labelClass}>Settings</span>
              </Link>
            ) : (
              <Link
                href={`/signin?next=${encodeURIComponent(pathname)}`}
                onClick={onNav}
                title="Start curating"
                className="flex h-10 w-full cursor-pointer items-center bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
              >
                <span className="flex h-10 w-8 shrink-0 items-center justify-center">
                  <img src="/favicon.svg" alt="" className="h-4 w-auto" />
                </span>
                <span className={labelClass}>Start curating</span>
              </Link>
            )}
          </div>
        </div>
      </aside>

      {/* ── mobile top bar ───────────────────────────────────────────────── */}
      <header
        className={`sticky top-0 z-30 flex h-14 items-center justify-between bg-white/85 px-5 backdrop-blur transition-[margin,opacity] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] md:hidden ${
          collapsed ? "pointer-events-none -mt-14 opacity-0" : ""
        }`}
      >
        <Link href="/" aria-label="Home" className="w-fit transition-opacity hover:opacity-70">
          <img src="/favicon.svg" alt="Favorites" className="h-6 w-auto" />
        </Link>
        {viewer ? (
          <Notifications viewer={viewer} />
        ) : (
          !signedIn && (
            <Link
              href={`/signin?next=${encodeURIComponent(pathname)}`}
              className="text-xs font-medium text-zinc-900 transition-colors hover:text-zinc-500"
            >
              Sign in
            </Link>
          )
        )}
      </header>

      {/* ── the stage ────────────────────────────────────────────────────── */}
      <main className={`min-w-0 flex-1 ${collapsed ? "" : "pb-16 md:pb-0"}`}>{children}</main>

      {/* ── mobile bottom tabs ───────────────────────────────────────────── */}
      <nav
        className={`fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch justify-around border-t border-zinc-100 bg-white/85 backdrop-blur transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] md:hidden ${
          collapsed ? "pointer-events-none translate-y-full opacity-0" : ""
        }`}
      >
        <Link href="/" aria-label="Home" className={`flex flex-1 items-center justify-center ${isHome ? "text-zinc-900" : "text-zinc-400"}`}>
          <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
            <path d="M2.5 6.5 8 2l5.5 4.5V14h-4v-4h-3v4h-4V6.5z" />
          </svg>
        </Link>
        {!signedIn && (
          <Link href="/explore" aria-label="Explore" className={`flex flex-1 items-center justify-center ${isExplore ? "text-zinc-900" : "text-zinc-400"}`}>
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6.3" />
              <path d="m10.5 5.5-1.6 3.4-3.4 1.6 1.6-3.4 3.4-1.6z" />
            </svg>
          </Link>
        )}
        {signedIn && (
          <Link href="/add" aria-label="Add a favorite" className={`flex flex-1 items-center justify-center ${pathname.startsWith("/add") ? "text-zinc-900" : "text-zinc-400"}`}>
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="1.5" y="1.5" width="13" height="13" />
              <path d="M8 5v6M5 8h6" />
            </svg>
          </Link>
        )}
        {viewer && (
          <Link href={`/${viewer.username}`} aria-label="Your library" className="flex flex-1 items-center justify-center">
            <span className={isYou ? "outline outline-1 outline-offset-2 outline-zinc-900" : ""}>
              {avatar("h-6 w-6", "text-[10px]")}
            </span>
          </Link>
        )}
      </nav>
    </div>
  );
}
