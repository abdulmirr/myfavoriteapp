"use client";

import Star from "./Star";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import type { Profile } from "@/lib/types";
import type { ProfileBar } from "./ShellProvider";
import FeedTabs from "./FeedTabs";
import ShelfTabs from "./ShelfTabs";

/**
 * The persistent chrome — one top bar, the same on desktop and phones,
 * mounted once by ShellProvider so navigation never remounts it. Three zones:
 * identity left (star → home), place center (Home's feed switcher — the center
 * simply empties on other pages), tools right (search → Explore's bar, add,
 * bell, your avatar).
 *
 * The feed switcher is icons (home / bell / search) — Friends wears the
 * unread badge, so there's no separate bell. The right zone is the Favorite
 * pill and your avatar.
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
          {/* the mark goes home — the star alone, the one nav convention
              nobody has to learn */}
          <Link
            href="/"
            aria-label="Home"
            className="flex w-fit items-center transition-opacity hover:opacity-70"
          >
            <Star className="h-[21px] w-[21px] text-[#f7a71e]" />
          </Link>
          {/* on phones the slot beside the mark is the page's title: Home's
              feed dropdown, your profile's shelf dropdown, or their handle
              (the switchers show only their dropdown skins below sm) */}
          {showFeeds && (
            <div className="sm:hidden">
              <Suspense fallback={null}>
                <FeedTabs viewer={viewer} />
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
        </div>

        {/* on wide screens the bar's center answers "where are you within this
            place": Home's feeds, or your library's shelves (someone else's
            profile keeps it empty — their identity is already on the page) */}
        {showFeeds && (
          <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block">
            <Suspense fallback={null}>
              <FeedTabs viewer={viewer} />
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
          <div className="flex items-center gap-3 sm:gap-4">
            {signedIn && (
              /* the primary act, worn as a pill — plus + word, right beside
                 your avatar and sized to it (the avatar is 28px; the pill
                 matches, so the pair reads as one weight). On your own wall
                 the sidebar already carries Favorite, so the pill steps aside
                 on desktop and stays only where the sidebar's button isn't. */
              <Link
                href="/add"
                title="Add a favorite"
                className={`h-[30px] shrink-0 items-center gap-1.5 border border-zinc-300 pl-3 pr-3.5 text-[11px] font-medium leading-none text-zinc-900 transition-colors hover:border-zinc-900 ${
                  isYou ? "flex md:hidden" : "flex"
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <path d="M6 1.5v9M1.5 6h9" />
                </svg>
                Favorite
              </Link>
            )}
            {/* on your own wall the sidebar already carries your identity —
                the avatar door only shows everywhere else */}
            {viewer && !isYou && (
              <Link
                href={`/${viewer.username}`}
                title="Your library"
                aria-label="Your library"
                className="transition hover:opacity-80"
              >
                <span className="flex h-7 w-7 items-center justify-center overflow-hidden bg-zinc-100">
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
                  className="bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700"
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
