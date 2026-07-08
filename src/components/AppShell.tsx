"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";
import Notifications from "./Notifications";

/**
 * The persistent chrome every signed-in page lives inside. Desktop: an
 * icons-only left rail that expands to labels on hover (IG-style), with the
 * primary action — Favorite — as the one solid button below the nav. Mobile:
 * a slim top bar + bottom tab bar. The content area is a stage — pages only
 * ever swap what renders inside it.
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
  const isFriends = pathname.startsWith("/friends");
  const isYou = !!viewer && pathname === `/${viewer.username}`;

  const rowClass = (active: boolean) =>
    `flex w-full cursor-pointer items-center py-1.5 transition-colors ${
      active ? "font-medium text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
    }`;

  // labels ride along hidden; the rail's hover reveals them
  const labelClass =
    "ml-3 whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100";

  const iconBox = "flex h-7 w-7 shrink-0 items-center justify-center";

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

  const friendsIcon = (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
      <circle cx="6" cy="5.5" r="2.3" />
      <path d="M2 13.5c0-2.5 1.8-4.1 4-4.1s4 1.6 4 4.1" />
      <circle cx="11.6" cy="6.2" r="1.8" />
      <path d="M12.3 9.8c1.6.4 2.7 1.7 2.7 3.5" />
    </svg>
  );

  const homeIcon = (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 6.5 8 2l5.5 4.5V14h-4v-4h-3v4h-4V6.5z" />
    </svg>
  );

  const exploreIcon = (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="8" r="6.3" />
      <path d="m10.5 5.5-1.6 3.4-3.4 1.6 1.6-3.4 3.4-1.6z" />
    </svg>
  );

  return (
    <div className="min-h-dvh md:flex">
      {/* ── desktop rail: icons at rest, labels on hover ─────────────────── */}
      <aside
        className={`relative hidden shrink-0 transition-[margin,visibility] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] md:sticky md:top-0 md:block md:h-screen md:w-16 ${
          collapsed ? "md:invisible md:-ml-16" : "md:visible md:ml-0"
        }`}
      >
        <div className="group absolute inset-y-0 left-0 z-40 flex w-16 flex-col overflow-hidden border-r border-zinc-100 bg-white px-[18px] py-8 transition-[width,padding,box-shadow] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:w-56 hover:px-6 hover:shadow-2xl">
          <Link href="/" aria-label="Home" className="mb-8 flex h-7 w-7 shrink-0 items-center justify-center transition-opacity hover:opacity-70">
            <img src="/favicon.svg" alt="Favorites" className="h-6 w-auto" />
          </Link>

          <nav className="flex flex-col gap-1 text-[13px]">
            <Link href="/" className={rowClass(isHome)} title="Home">
              <span className={iconBox}>{homeIcon}</span>
              <span className={labelClass}>Home</span>
            </Link>
            {/* signed-out visitors get Explore here — their door into the
                network; signed in, it lives as a tab on Home */}
            {!signedIn && (
              <Link href="/explore" className={rowClass(isExplore)} title="Explore">
                <span className={iconBox}>{exploreIcon}</span>
                <span className={labelClass}>Explore</span>
              </Link>
            )}
            {viewer && (
              <Link href="/friends" className={rowClass(isFriends)} title="Friends">
                <span className={iconBox}>{friendsIcon}</span>
                <span className={labelClass}>Friends</span>
              </Link>
            )}
            {viewer && (
              <div className="py-1.5">
                <Notifications viewer={viewer} align="left" label="Notifications" />
              </div>
            )}
            {viewer && (
              <Link href={`/${viewer.username}`} className={rowClass(isYou)} title="Your library">
                <span className={iconBox}>{avatar("h-5 w-5", "text-[9px]")}</span>
                <span className={labelClass}>You</span>
              </Link>
            )}
          </nav>

          {/* the primary action — the one solid thing in the rail */}
          {signedIn && (
            <Link
              href="/add"
              title="Add a favorite"
              className="mt-4 flex h-9 w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              <img src="/favicon.svg" alt="" className="h-4 w-auto" />
              <span className="hidden whitespace-nowrap group-hover:inline">Favorite</span>
            </Link>
          )}

          <div className="mt-auto flex flex-col text-[13px]">
            {signedIn ? (
              <Link href="/profile" className={rowClass(pathname === "/profile")} title="Settings">
                <span className={iconBox}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </span>
                <span className={labelClass}>Settings</span>
              </Link>
            ) : (
              <Link
                href={`/signin?next=${encodeURIComponent(pathname)}`}
                title="Start curating"
                className="flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
              >
                <img src="/favicon.svg" alt="" className="h-4 w-auto" />
                <span className="hidden whitespace-nowrap group-hover:inline">Start curating</span>
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
        {viewer && (
          <Link href="/friends" aria-label="Friends" className={`flex flex-1 items-center justify-center ${isFriends ? "text-zinc-900" : "text-zinc-400"}`}>
            <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <circle cx="6" cy="5.5" r="2.3" />
              <path d="M2 13.5c0-2.5 1.8-4.1 4-4.1s4 1.6 4 4.1" />
              <circle cx="11.6" cy="6.2" r="1.8" />
              <path d="M12.3 9.8c1.6.4 2.7 1.7 2.7 3.5" />
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
