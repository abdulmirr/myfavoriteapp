"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { List } from "lucide-react";
import Star from "../ui/Star";
import { cn } from "../ui/styles";

/** Favorites · Lists, underlined — a hairline across, the open tab marked in ink. */
export default function ProfileTabs({ username }: { username: string }) {
  const pathname = usePathname();
  const base = `/${username}`;
  const tabs = [
    { href: base, label: "Favorites", icon: <Star className="size-4 text-star" /> },
    { href: `${base}/lists`, label: "Lists", icon: <List className="size-4" /> },
  ];
  return (
    <nav aria-label="Profile" className="mt-7 flex gap-7 border-b border-gray-200 sm:mt-8 dark:border-neutral-800">
      {tabs.map((t) => {
        const on = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={true}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 pb-3 text-[15px] font-semibold outline-none transition-colors focus-visible:text-gray-900",
              on
                ? "border-gray-900 text-gray-900 dark:border-neutral-100 dark:text-neutral-100"
                : "border-transparent text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            )}
          >
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
