"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * The Home feed switcher — For You / Following / Explore — living next to the
 * mark in the top bar (not on its own line), so signed-in Home is one band of
 * chrome, not two. Which feed is showing rides in the URL (`?feed=…`), so a
 * feed is linkable and the back button works. On phones the three collapse
 * into a dropdown labelled with the current feed.
 *
 * `useSearchParams` makes this a CSR-bailout island: every caller must wrap it
 * in <Suspense> (see AppShell / the Home page).
 */
export type Feed = "foryou" | "following" | "explore";

export const FEEDS: { key: Feed; label: string; href: string }[] = [
  { key: "foryou", label: "For You", href: "/" },
  { key: "following", label: "Following", href: "/?feed=following" },
  { key: "explore", label: "Explore", href: "/?feed=explore" },
];

export function feedFromParam(param: string | null | undefined): Feed {
  return param === "following" ? "following" : param === "explore" ? "explore" : "foryou";
}

/** the page reads the active feed the same way the switcher does */
export function useFeed(): Feed {
  return feedFromParam(useSearchParams().get("feed"));
}

export default function FeedTabs() {
  const active = feedFromParam(useSearchParams().get("feed"));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeLabel = FEEDS.find((f) => f.key === active)!.label;

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
      {/* desktop: the three inline, beside the mark */}
      <nav className="hidden items-center gap-5 text-xs sm:flex">
        {FEEDS.map((f) => (
          <Link
            key={f.key}
            href={f.href}
            className={`transition-colors ${
              active === f.key ? "font-medium text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {/* phones: the current feed as a dropdown */}
      <div ref={rootRef} className="relative sm:hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex cursor-pointer items-center gap-1 text-xs font-medium text-zinc-900"
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
        </button>
        {open && (
          <div className="save-appear absolute left-0 top-full z-40 mt-3 flex w-40 flex-col border border-zinc-200 bg-white py-1 shadow-2xl">
            {FEEDS.map((f) => (
              <Link
                key={f.key}
                href={f.href}
                className={`px-4 py-2.5 text-xs transition-colors ${
                  active === f.key
                    ? "font-medium text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
