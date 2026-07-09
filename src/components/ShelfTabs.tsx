"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Your library's two shelves — Favorites (the public wall) and Saved (the
 * private queue of things to dive into) — switched from the top bar, owner
 * only. Same grammar as the Home feed switcher: inline tabs in the bar's
 * center on wide screens, a dropdown beside the mark on phones, state in the
 * URL (`?shelf=saved`) so it's linkable and the back button works.
 *
 * `useSearchParams` makes this a CSR-bailout island: callers wrap it in
 * <Suspense> (AppShell does).
 */
export type Shelf = "favorites" | "saved";

export function shelfFromParam(param: string | null | undefined): Shelf {
  return param === "saved" ? "saved" : "favorites";
}

export default function ShelfTabs({ base }: { base: string }) {
  const active = shelfFromParam(useSearchParams().get("shelf"));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const shelves: { key: Shelf; label: string; href: string }[] = [
    { key: "favorites", label: "Favorites", href: base },
    { key: "saved", label: "Saved", href: `${base}?shelf=saved` },
  ];
  const activeLabel = active === "saved" ? "Saved" : "Favorites";

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

  // making a choice (the shelf changed) closes the menu
  useEffect(() => setOpen(false), [active]);

  return (
    <>
      {/* desktop: the two inline, holding the bar's center */}
      <nav className="hidden items-center gap-5 text-xs sm:flex">
        {shelves.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            className={`transition-colors ${
              active === s.key ? "font-medium text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {/* phones: the current shelf as a dropdown, beside the mark */}
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
            {shelves.map((s) => (
              <Link
                key={s.key}
                href={s.href}
                className={`px-4 py-2.5 text-xs transition-colors ${
                  active === s.key
                    ? "font-medium text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
