"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";
import Notifications from "./Notifications";

/**
 * The persistent chrome every signed-in page lives inside: a left rail on
 * desktop (Home / Explore / Favorite / Notifications / You, Settings at the
 * bottom), a slim top bar + bottom tab bar on phones. The content area is a
 * stage — pages only ever swap what renders inside it.
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

  const rowClass = (active: boolean) =>
    `flex w-full cursor-pointer items-center gap-3 py-1.5 transition-colors ${
      active ? "font-medium text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
    }`;

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

  return (
    <div className="min-h-dvh md:flex">
      {/* ── desktop rail ─────────────────────────────────────────────────── */}
      <aside
        className={`hidden shrink-0 border-r border-zinc-100 bg-white transition-[margin,visibility] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] md:sticky md:top-0 md:flex md:h-screen md:w-52 md:flex-col md:gap-1 md:px-6 md:py-8 ${
          collapsed ? "md:invisible md:-ml-52" : "md:visible md:ml-0"
        }`}
      >
        <Link href="/" aria-label="Home" className="mb-8 w-fit transition-opacity hover:opacity-70">
          <img src="/favicon.svg" alt="Favorites" className="h-6 w-auto" />
        </Link>

        <nav className="flex flex-col gap-1 text-[13px]">
          <Link href="/" className={rowClass(isHome)}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
                <path d="M2.5 6.5 8 2l5.5 4.5V14h-4v-4h-3v4h-4V6.5z" />
              </svg>
            </span>
            Home
          </Link>
          <Link href="/explore" className={rowClass(isExplore)}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
                <circle cx="8" cy="8" r="6.3" />
                <path d="m10.5 5.5-1.6 3.4-3.4 1.6 1.6-3.4 3.4-1.6z" />
              </svg>
            </span>
            Explore
          </Link>
          {signedIn && (
            <Link href="/add" className={rowClass(pathname.startsWith("/add"))}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <rect x="1.5" y="1.5" width="13" height="13" />
                  <path d="M8 5v6M5 8h6" />
                </svg>
              </span>
              Favorite
            </Link>
          )}
          {viewer && (
            <div className="py-1.5">
              <Notifications viewer={viewer} align="left" label="Notifications" />
            </div>
          )}
          {viewer && (
            <Link href={`/${viewer.username}`} className={rowClass(isYou)}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                {avatar("h-5 w-5", "text-[9px]")}
              </span>
              You
            </Link>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-1 text-[13px]">
          {signedIn ? (
            <Link href="/profile" className={rowClass(pathname === "/profile")}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </span>
              Settings
            </Link>
          ) : (
            <Link
              href={`/signin?next=${encodeURIComponent(pathname)}`}
              className="flex h-9 w-full cursor-pointer items-center justify-center bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Start curating
            </Link>
          )}
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
        <Link href="/explore" aria-label="Explore" className={`flex flex-1 items-center justify-center ${isExplore ? "text-zinc-900" : "text-zinc-400"}`}>
          <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6.3" />
            <path d="m10.5 5.5-1.6 3.4-3.4 1.6 1.6-3.4 3.4-1.6z" />
          </svg>
        </Link>
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
