"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchDiscover, type DiscoverProfile } from "@/lib/social";
import { thumbCover } from "@/lib/img";
import { useViewer } from "@/lib/viewer";
import { FollowButton } from "../profile/ProfileActions";
import Avatar from "../ui/Avatar";
import { card, cn } from "../ui/styles";

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
      <h2 className="px-1 text-sm font-semibold tracking-tight text-gray-900 dark:text-neutral-100">People with your taste</h2>
      <ul className={cn(card, "mt-2.5 divide-y divide-gray-100 overflow-hidden dark:divide-neutral-700")}>
        {people === null
          ? [0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3" aria-hidden>
                <span className="size-10 animate-pulse rounded-[30%] bg-gray-200 dark:bg-neutral-700" />
                <span className="h-3 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
              </li>
            ))
          : people.slice(0, limit).map((p) => {
              const covers = p.preview.filter((it) => it.image_url).slice(0, 4);
              return (
                <li key={p.id} className="flex gap-3 px-4 py-3.5">
                  <Link href={`/${p.username}`} className="shrink-0 rounded-[30%] outline-none focus-visible:ring-2 focus-visible:ring-gray-900">
                    <Avatar p={p} className="size-10" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/${p.username}`} className="min-w-0 flex-1 outline-none">
                        <span className="block truncate text-sm font-semibold text-gray-900 hover:underline dark:text-neutral-100">
                          {p.display_name || `@${p.username}`}
                        </span>
                        <span className="block truncate text-xs text-gray-500 dark:text-neutral-400">
                          {p.shared > 0 ? `${p.shared} in common` : `${p.count} ${p.count === 1 ? "favorite" : "favorites"}`}
                        </span>
                      </Link>
                      <FollowButton profile={p} chip />
                    </div>
                    {covers.length > 0 && (
                      <Link href={`/${p.username}`} aria-hidden tabIndex={-1} className="mt-2.5 flex gap-1.5">
                        {covers.map((it) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={it.id}
                            src={thumbCover(it.image_url!, 100)}
                            alt=""
                            loading="lazy"
                            className="size-11 rounded-[4px] bg-gray-200 object-cover dark:bg-neutral-700"
                          />
                        ))}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
      </ul>
    </section>
  );
}
