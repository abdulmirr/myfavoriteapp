"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import type { Profile } from "@/lib/types";
import Notifications from "./Notifications";
import FeedTabs from "./FeedTabs";

/**
 * The persistent chrome — one top bar, the same on desktop and phones,
 * mounted once by ShellProvider so navigation never remounts it. Star → home
 * on the left, with Home's feed switcher (For You / Following / Explore) beside
 * it so signed-in Home is one band of chrome, not two; add / bell / your avatar
 * on the right.
 *
 * `minimal` strips the actions for focused tasks (/add) — just the way home.
 * `collapsed` slides the bar away entirely (freeform view is full-screen).
 */
export default function AppShell({
  viewer,
  signedIn,
  collapsed = false,
  minimal = false,
  children,
}: {
  /** the signed-in viewer's profile — null while loading or signed out */
  viewer: Profile | null;
  signedIn: boolean;
  collapsed?: boolean;
  minimal?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isYou = !!viewer && pathname === `/${viewer.username}`;
  const isExplore = pathname.startsWith("/explore");
  // the feed switcher belongs to Home, and only to a signed-in viewer
  const showFeeds = signedIn && !minimal && pathname === "/";

  return (
    <div className="min-h-dvh">
      <header
        className={`sticky top-0 z-50 flex h-14 items-center justify-between border-b border-zinc-100 bg-white/85 px-5 backdrop-blur transition-[margin,opacity] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] sm:px-8 ${
          collapsed ? "pointer-events-none -mt-14 opacity-0" : ""
        }`}
      >
        <div className="flex items-center gap-5 sm:gap-7">
          {/* the mark goes home — the one nav convention nobody has to learn */}
          <Link href="/" aria-label="Home" className="w-fit transition-opacity hover:opacity-70">
            <img src="/favicon.svg" alt="Favorites" className="h-6 w-auto" />
          </Link>
          {showFeeds && (
            <Suspense fallback={null}>
              <FeedTabs />
            </Suspense>
          )}
        </div>

        {!minimal && (
          <div className="flex items-center gap-4 sm:gap-5">
            {signedIn && (
              <Link
                href="/add"
                title="Add a favorite"
                aria-label="Add a favorite"
                className="flex h-7 w-7 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-900"
              >
                <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
                  <rect x="1.5" y="1.5" width="13" height="13" />
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
                className="transition-opacity hover:opacity-80"
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center overflow-hidden bg-zinc-100 ${
                    isYou ? "outline outline-1 outline-offset-2 outline-zinc-900" : ""
                  }`}
                >
                  {viewer.avatar_url ? (
                    <img src={viewer.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[11px] font-semibold text-zinc-300">
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
                  className="text-xs font-medium text-zinc-900 transition-colors hover:text-zinc-500"
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
