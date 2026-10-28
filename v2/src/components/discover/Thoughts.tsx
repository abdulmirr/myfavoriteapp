"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { DiscoverThought } from "@/lib/types";
import { thumbCover } from "@/lib/img";
import { itemHref, timeAgo } from "@/lib/work";
import Avatar from "../ui/Avatar";
import { cn } from "../ui/styles";
import { SectionHead } from "./Shelf";

const noop = () => () => {};

/** The newest favorites that came with a few words — the words first, then what and who. */
export default function Thoughts({ thoughts }: { thoughts: DiscoverThought[] }) {
  // "3d ago" reads the clock, so it only shows in the browser — the page is prerendered
  const live = useSyncExternalStore(noop, () => true, () => false);
  return (
    <section>
      <SectionHead title="Fresh thoughts" sub="Favorites that came with a few words." />
      <ul className="mt-4 grid gap-x-10 sm:grid-cols-2 xl:grid-cols-3">
        {thoughts.slice(0, 6).map((t, i) => {
          const href = itemHref(t.work) ?? `/${t.by.username}`;
          return (
            <li
              key={t.work.item_id}
              className={cn(
                "flex flex-col border-t border-gray-200 py-5 dark:border-neutral-800",
                i === 3 && "max-sm:hidden",
                i >= 4 && "hidden xl:flex"
              )}
            >
              <Link href={href} className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-neutral-400">
                <p className="line-clamp-4 whitespace-pre-line text-[15px] leading-relaxed text-gray-900 dark:text-neutral-100">
                  &ldquo;{t.text}&rdquo;
                </p>
              </Link>
              <div className="mt-auto flex items-center gap-3 pt-4">
                {t.work.image_url && (
                  <Link href={href} aria-hidden tabIndex={-1} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbCover(t.work.image_url, 120)}
                      alt=""
                      loading="lazy"
                      className="obj-shadow h-11 w-auto max-w-14 bg-gray-200 object-contain dark:bg-neutral-800"
                    />
                  </Link>
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    href={href}
                    className="block truncate text-sm font-semibold text-gray-900 hover:underline dark:text-neutral-100"
                  >
                    {t.work.title}
                  </Link>
                  <Link
                    href={`/${t.by.username}`}
                    className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                  >
                    <Avatar p={t.by} className="size-4 text-[8px]" />
                    <span className="truncate">
                      {t.by.display_name || `@${t.by.username}`}
                      {live && ` · ${timeAgo(t.at)}`}
                    </span>
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
