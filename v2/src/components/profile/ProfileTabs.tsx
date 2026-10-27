"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, List } from "lucide-react";
import Star from "../ui/Star";
import { cn, drawer } from "../ui/styles";

/** antislop's segmented profile nav, tucked under the header card. */
export default function ProfileTabs({ username }: { username: string }) {
  const pathname = usePathname();
  const base = `/${username}`;
  const tabs = [
    { href: base, label: "Favorites", icon: <Star className="size-4 text-star" /> },
    { href: `${base}/lists`, label: "Lists", icon: <List className="size-4" /> },
    { href: `${base}/activity`, label: "Activity", icon: <History className="size-4" /> },
  ];
  return (
    <nav aria-label="Profile" className={cn(drawer, "px-2 pt-6 pb-2")}>
      <div className="flex items-center gap-1">
        {tabs.map((t) => {
          const on = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              prefetch={true}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 border border-transparent px-2 py-2 text-sm font-semibold transition-colors sm:py-1.5",
                on
                  ? "rounded-xl bg-gray-200 text-gray-900 dark:bg-neutral-700 dark:text-neutral-100"
                  : "rounded-full text-gray-500 hover:rounded-xl hover:bg-gray-200 hover:text-gray-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
              )}
            >
              {t.icon}
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
