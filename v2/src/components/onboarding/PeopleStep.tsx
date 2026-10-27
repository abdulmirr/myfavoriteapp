"use client";

import { useEffect, useState } from "react";
import type { Profile } from "@/lib/types";
import { fetchSuggestions } from "@/lib/social";
import { useViewer } from "@/lib/viewer";
import Avatar from "../ui/Avatar";
import { FollowButton } from "../profile/ProfileActions";
import { card, cn, primaryButton, quietButton } from "../ui/styles";
import BeatHeader from "./BeatHeader";

/**
 * Beat 4 — a few people worth following, so the feed's Following view has
 * faces on day one. Profiles open in a new tab; the flow stays put.
 */
export default function PeopleStep({ profile, onNext }: { profile: Profile; onNext: () => void }) {
  const v = useViewer();
  const [people, setPeople] = useState<Profile[] | null>(null);

  useEffect(() => {
    let stale = false;
    fetchSuggestions(profile.id)
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
    <div className="mx-auto w-full max-w-md">
      <BeatHeader
        title="Taste is better shared"
        sub="Follow a few people — what they favorite and save shows up in your feed."
      />
      <ul className={cn(card, "mt-6 divide-y divide-gray-100 overflow-hidden dark:divide-neutral-700")}>
        {people === null
          ? [0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3" aria-hidden>
                <span className="size-10 animate-pulse rounded-[30%] bg-gray-200 dark:bg-neutral-700" />
                <span className="h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
              </li>
            ))
          : people.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <a href={`/${p.username}`} target="_blank" rel="noopener" className="shrink-0">
                  <Avatar p={p} className="size-10 text-base" />
                </a>
                <div className="min-w-0 flex-1">
                  <a
                    href={`/${p.username}`}
                    target="_blank"
                    rel="noopener"
                    className="block truncate text-sm font-semibold text-gray-900 hover:underline dark:text-neutral-100"
                  >
                    {p.display_name || `@${p.username}`}
                  </a>
                  <p className="truncate text-xs text-gray-500 dark:text-neutral-400">{p.bio || `@${p.username}`}</p>
                </div>
                <FollowButton profile={p} small />
              </li>
            ))}
      </ul>
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={onNext}
          className={cn(followed ? primaryButton : quietButton, "min-w-32")}
        >
          {followed ? "Continue" : "Skip"}
        </button>
      </div>
    </div>
  );
}
