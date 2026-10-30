"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchDiscover, type DiscoverProfile } from "@/lib/social";
import { thumbCover } from "@/lib/img";
import { useViewer } from "@/lib/viewer";
import { FollowButton } from "../profile/ProfileActions";
import Avatar from "../ui/Avatar";

/**
 * People you don't follow yet, ranked by how much of your library they share
 * (then by library size). Loaded once per visit; following someone keeps them
 * on the card — the button flips to "Following" — so nothing jumps.
 */
export function useDiscover(): DiscoverProfile[] | null {
  const v = useViewer();
  const meId = v.status === "signed-in" ? (v.profile?.id ?? null) : null;
  const [people, setPeople] = useState<{ for: string; list: DiscoverProfile[] } | null>(null);
  useEffect(() => {
    if (!meId || v.stale) return;
    let stale = false;
    fetchDiscover(meId, [...v.followingIds])
      .then((list) => !stale && setPeople({ for: meId, list }))
      .catch(() => !stale && setPeople({ for: meId, list: [] }));
    return () => {
      stale = true;
    };
    // only on arrival (and a different account) — a fresh follow shouldn't reshuffle the card
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId, v.stale]);
  return people && people.for === meId ? people.list : null;
}

export default function PeopleToFollow({ people, limit = 5 }: { people: DiscoverProfile[] | null; limit?: number }) {
  if (people !== null && people.length === 0) return null;
  return (
    <section aria-label="People with your taste">
      <h2 className="border-b border-gray-200 pb-3 text-sm font-semibold tracking-tight text-gray-900 dark:border-neutral-800 dark:text-neutral-100">
        People with your taste
      </h2>
      <ul className="divide-y divide-gray-200 dark:divide-neutral-800">
        {people === null
          ? [0, 1, 2].map((i) => (
              <li key={i} aria-hidden className="py-5">
                <div className="flex items-center gap-3">
                  <span className="size-10 animate-pulse rounded-[30%] bg-gray-200 dark:bg-neutral-800" />
                  <span className="h-3 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                </div>
                <div className="mt-2.5 ml-[52px] flex gap-1">
                  {[0, 1, 2, 3, 4, 5].map((j) => (
                    <span key={j} className="size-8 animate-pulse rounded-[3px] bg-gray-200 dark:bg-neutral-800" />
                  ))}
                </div>
              </li>
            ))
          : people.slice(0, limit).map((p) => {
              const covers = p.preview.filter((it) => it.image_url).slice(0, 6);
              return (
                <li key={p.id} className="py-5">
                  <div className="flex items-center gap-3">
                    <Link href={`/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3 outline-none">
                      <Avatar p={p} className="size-10" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-900 hover:underline dark:text-neutral-100">
                          {p.display_name || `@${p.username}`}
                        </span>
                        <span className="block truncate text-xs text-gray-500 dark:text-neutral-400">
                          {p.shared > 0 ? `${p.shared} in common` : `${p.count} ${p.count === 1 ? "favorite" : "favorites"}`}
                        </span>
                      </span>
                    </Link>
                    <FollowButton profile={p} chip />
                  </div>
                  {/* their taste, small and under the name — the person leads */}
                  {covers.length > 0 && (
                    <Link href={`/${p.username}`} aria-hidden tabIndex={-1} className="mt-2.5 ml-[52px] flex w-fit gap-1">
                      {covers.map((it) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={it.id}
                          src={thumbCover(it.image_url!, 100)}
                          alt=""
                          loading="lazy"
                          className="size-8 rounded-[3px] bg-gray-200 object-cover transition-opacity hover:opacity-90 dark:bg-neutral-800"
                        />
                      ))}
                    </Link>
                  )}
                </li>
              );
            })}
      </ul>
    </section>
  );
}
