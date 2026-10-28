"use client";

import Link from "next/link";
import type { TastePerson } from "@/lib/types";
import { thumbCover } from "@/lib/img";
import { itemHref } from "@/lib/work";
import { FollowButton } from "../profile/ProfileActions";
import Avatar from "../ui/Avatar";
import { cn } from "../ui/styles";
import { SectionHead } from "./Shelf";

/**
 * People who share the most of your taste and whom you don't follow yet —
 * how much you share, six things they love that you don't have, Follow.
 * Three on phones, four on tablets, six on wide screens.
 */
export default function TastePeople({ people }: { people: TastePerson[] }) {
  return (
    <section>
      <SectionHead title="People with your taste" sub="They love what you love. Here’s what they have that you don’t." />
      <ul className="mt-4 grid gap-x-10 sm:grid-cols-2 xl:grid-cols-3">
        {people.slice(0, 6).map((p, i) => (
          <li
            key={p.profile.id}
            className={cn(
              "border-t border-gray-200 py-5 dark:border-neutral-800",
              i === 3 && "max-sm:hidden",
              i >= 4 && "hidden xl:block"
            )}
          >
            <div className="flex items-center gap-3">
              <Link href={`/${p.profile.username}`} className="flex min-w-0 flex-1 items-center gap-3 outline-none">
                <Avatar p={p.profile} className="size-10" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-gray-900 hover:underline dark:text-neutral-100">
                    {p.profile.display_name || `@${p.profile.username}`}
                  </span>
                  <span className="block truncate text-xs text-gray-500 dark:text-neutral-400">
                    {p.shared} {p.shared === 1 ? "favorite" : "favorites"} in common
                  </span>
                </span>
              </Link>
              <FollowButton profile={p.profile} chip />
            </div>
            <ul className="mt-3.5 grid grid-cols-6 gap-1.5">
              {p.works.slice(0, 6).map((w) => (
                <li key={w.work_key}>
                  <Link
                    href={itemHref(w) ?? `/${p.profile.username}`}
                    title={w.creator ? `${w.title} — ${w.creator}` : w.title}
                    className="block rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-neutral-400"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbCover(w.image_url!, 200)}
                      alt={w.title}
                      loading="lazy"
                      className="aspect-square w-full rounded-[3px] bg-gray-200 object-cover transition-opacity hover:opacity-90 dark:bg-neutral-800"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
