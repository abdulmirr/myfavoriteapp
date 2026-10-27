"use client";

import { useEffect } from "react";

/**
 * Follow the system color scheme while the page is mounted — used by the
 * signed-out marketing surfaces (landing, privacy, terms). An explicit
 * in-app choice (fav:theme) always wins; the pre-paint script in layout.tsx
 * handles first paint, this keeps live system switches in sync and restores
 * the saved default when navigating into the app.
 */
export function useSystemTheme() {
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("fav:theme");
    } catch {}
    if (saved) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.documentElement.classList.remove("dark");
    };
  }, []);
}
