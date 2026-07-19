"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import type { Profile } from "@/lib/types";
import type { ProfileBar } from "./ShellProvider";
import Notifications from "./Notifications";
import FeedTabs from "./FeedTabs";
import ShelfTabs from "./ShelfTabs";

/**
 * The persistent chrome — one top bar, the same on desktop and phones,
 * mounted once by ShellProvider so navigation never remounts it. Three zones:
 * identity left (star → home), place center (Home's feed switcher — the center
 * simply empties on other pages), tools right (search → Explore's bar, add,
 * bell, your avatar).
 *
 * `minimal` strips the actions for focused tasks (/add) — just the way home.
 * `collapsed` slides the bar away entirely (freeform view is full-screen).
 */
export default function AppShell({
  viewer,
  signedIn,
  collapsed = false,
  minimal = false,
  profileBar = null,
  children,
}: {
  /** the signed-in viewer's profile — null while loading or signed out */
  viewer: Profile | null;
  signedIn: boolean;
  collapsed?: boolean;
  minimal?: boolean;
  /** set by profile pages: whose wall the bar is sitting over */
  profileBar?: ProfileBar;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isYou = !!viewer && pathname === `/${viewer.username}`;
  const isExplore = pathname.startsWith("/explore");
  // the feed switcher belongs to Home, and only to a signed-in viewer
  const showFeeds = signedIn && !minimal && pathname === "/";
  // the profile-page slot: your own wall gets the shelf switcher, someone
  // else's gets their handle (only trust it while actually on that page)
  const onProfile = !!profileBar && pathname === `/${profileBar.handle}`;
  const showShelves = onProfile && profileBar!.own && !minimal;
  const showHandle = onProfile && !profileBar!.own && !minimal;

  return (
    <div className="min-h-dvh">
      <header
        className={`sticky top-0 z-50 flex h-14 items-center justify-between border-b border-zinc-900/[0.06] bg-white/70 px-5 backdrop-blur-xl transition-[margin,opacity] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] sm:px-8 ${
          collapsed ? "pointer-events-none -mt-14 opacity-0" : ""
        }`}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          {/* the mark goes home — star + wordmark, the one nav convention
              nobody has to learn */}
          <Link
            href="/"
            aria-label="Home"
            className="flex w-fit items-center gap-2 transition-opacity hover:opacity-70 active:scale-95"
          >
            <img src="/favicon.svg" alt="" className="h-[22px] w-auto" />
            <span className="hidden text-[15px] font-semibold tracking-[-0.02em] text-zinc-900 md:block">
              Favorites
            </span>
          </Link>
          {/* on phones the slot beside the mark is the page's title: Home's
              feed dropdown, your profile's shelf dropdown, or their handle
              (the switchers show only their dropdown skins below sm) */}
          {showFeeds && (
            <div className="sm:hidden">
              <Suspense fallback={null}>
                <FeedTabs />
              </Suspense>
            </div>
          )}
          {showShelves && (
            <div className="sm:hidden">
              <Suspense fallback={null}>
                <ShelfTabs base={`/${profileBar!.handle}`} />
              </Suspense>
            </div>
          )}
          {showHandle && (
            <span className="truncate text-xs font-medium text-zinc-900 sm:hidden">
              @{profileBar!.handle}
            </span>
          )}
          {signedIn && !minimal && (
            <Link
              href="/?feed=explore&search=1"
              title="Search"
              aria-label="Search"
              className="hidden h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-900/[0.05] hover:text-zinc-900 active:scale-95 sm:flex"
            >
              {/* a door, not a field — the real search bar lives on Explore */}
              <svg width="15" height="15" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                <circle cx="5" cy="5" r="4" />
                <path d="M8 8l3 3" />
              </svg>
            </Link>
          )}
        </div>

        {/* on wide screens the bar's center answers "where are you within this
            place": Home's feeds, or your library's shelves (someone else's
            profile keeps it empty — their identity is already on the page) */}
        {showFeeds && (
          <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block">
            <Suspense fallback={null}>
              <FeedTabs />
            </Suspense>
          </div>
        )}
        {showShelves && (
          <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block">
            <Suspense fallback={null}>
              <ShelfTabs base={`/${profileBar!.handle}`} />
            </Suspense>
          </div>
        )}

        {!minimal && (
          <div className="flex items-center gap-4 sm:gap-5">
            {signedIn && (
              <Link
                href="/add"
                title="Add a favorite"
                aria-label="Add a favorite"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-900/[0.05] hover:text-zinc-900 active:scale-95"
              >
                <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="1.5" y="1.5" width="13" height="13" rx="4" />
                  <path d="M8 5v6M5 8h6" />
                </svg>
              </Link>
            )}
            {viewer && <Notifications viewer={viewer} />}
            {viewer && (
              <Link
                href={`/${viewer.username}`}
                title="Your library"
                aria-label="Your library"
                className="transition hover:opacity-80 active:scale-95"
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-zinc-100 ${
                    isYou ? "outline outline-2 outline-offset-2 outline-zinc-900/80" : ""
                  }`}
                >
                  {viewer.avatar_url ? (
                    <img src={viewer.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[11px] font-semibold text-zinc-400">
                      {(viewer.display_name || viewer.username).slice(0, 1)}
                    </span>
                  )}
                </span>
              </Link>
            )}
            {!signedIn && (
              <>
                {/* the signed-out visitor's door into the network */}
                <Link
                  href="/explore"
                  className={`text-xs transition-colors ${
                    isExplore ? "font-medium text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
                  }`}
                >
                  Explore
                </Link>
                <Link
                  href={`/signin?next=${encodeURIComponent(pathname)}`}
                  className="rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 active:scale-95"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        )}
      </header>

      {/* the stage — pages center their own content */}
      <main className="min-w-0">{children}</main>
    </div>
  );
}
