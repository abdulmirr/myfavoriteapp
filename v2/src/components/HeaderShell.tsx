"use client";

import { useEffect, useState } from "react";
import { cn } from "./ui/styles";

/** The sticky band; its hairline only appears once the page scrolls under it. */
export default function HeaderShell({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div
      className={cn(
        "sticky top-0 z-40 border-b bg-gray-100 transition-colors duration-200 dark:bg-neutral-900",
        scrolled ? "border-gray-200 dark:border-neutral-800" : "border-transparent"
      )}
    >
      <div className="px-4 py-4 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}
