"use client";

import { useEffect, useState } from "react";
import type { Profile } from "@/lib/types";
import { fetchDiscover, type DiscoverProfile } from "@/lib/social";
import { thumbCover } from "@/lib/img";
import { useViewer } from "@/lib/viewer";
import Avatar from "../ui/Avatar";
import { FollowButton } from "../profile/ProfileActions";
import InviteButton from "../friends/InviteButton";
import { bigButton, cn } from "../ui/styles";
import BeatHeader from "./BeatHeader";

/** Skip, the size of Continue (so the button doesn't jump when the first follow lands) */
const quietBig =
  "inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-gray-200 px-6 text-base font-semibold text-gray-900 outline-none transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:ring-gray-900 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700";

/**
 * Beat 4 — people whose walls look like the one just started (ranked by the
 * favorites you now share), so Friends has faces on day one — and the invite,
 * for the people who aren't here yet. Profiles open in a new tab; the flow
 * stays put.
 */
export default function PeopleStep({ profile, onNext }: { profile: Profile; onNext: () => void }) {
  const v = useViewer();
  const [people, setPeople] = useState<DiscoverProfile[] | null>(null);

  useEffect(() => {
    let stale = false;
    fetchDiscover(profile.id, [])
      .then((p) => !stale && setPeople(p.slice(0, 5)))
      .catch(() => !stale && setPeople([]));
    return () => {
      stale = true;
    };
  }, [profile.id]);

  // nobody to suggest yet (a young network) — never strand anyone on an empty beat
  useEffect(() => {
    if (people && !people.length) onNext();
  }, [people, onNext]);

  const followed = people?.filter((p) => v.followingIds.has(p.id)).length ?? 0;

  return (
    <div className="mx-auto w-full max-w-xl">
      <BeatHeader
        title="Taste is better shared"
        sub="People whose walls look like yours. Follow a few — what they love and save shows up on Friends."
      />
      <ul className="mt-10 divide-y divide-gray-200 border-y border-gray-200 dark:divide-neutral-800 dark:border-neutral-800">
        {people === null
          ? [0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 py-5" aria-hidden>
                <span className="size-11 animate-pulse rounded-[30%] bg-gray-200 dark:bg-neutral-800" />
                <span className="h-4 w-40 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
              </li>
            ))
          : people.map((p) => {
              const covers = p.preview.filter((it) => it.image_url).slice(0, 6);
              return (
                <li key={p.id} className="py-5">
                  <div className="flex items-center gap-3">
                    <a href={`/${p.username}`} target="_blank" rel="noopener" className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar p={p} className="size-11 text-base" />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold text-gray-900 hover:underline dark:text-neutral-100">
                          {p.display_name || `@${p.username}`}
                        </span>
                        <span className="block truncate text-[13px] text-gray-500 dark:text-neutral-400">
                          {p.shared > 0
                            ? `${p.shared} ${p.shared === 1 ? "favorite" : "favorites"} in common`
                            : p.bio || `${p.count} favorites`}
                        </span>
                      </span>
                    </a>
                    <FollowButton profile={p} chip />
                  </div>
                  {covers.length > 0 && (
                    <div className="mt-3 grid grid-cols-6 gap-1.5" aria-hidden>
                      {covers.map((it) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={it.id}
                          src={thumbCover(it.image_url!, 100)}
                          alt=""
                          loading="lazy"
                          className="aspect-square w-full rounded-[3px] bg-gray-200 object-cover dark:bg-neutral-800"
                        />
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
      </ul>
      <div className="mt-8 flex flex-col items-center gap-2 text-center">
        <p className="text-sm text-gray-500 dark:text-neutral-400">Your friends aren&apos;t here yet?</p>
        <InviteButton quiet />
      </div>
      <div className="mt-10 flex justify-center">
        <button type="button" onClick={onNext} className={cn(followed ? bigButton : quietBig, "min-w-48")}>
          {followed ? "Continue" : "Skip"}
        </button>
      </div>
    </div>
  );
}
