"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Profile } from "@/lib/types";
import { fetchFollowers, fetchFollowing } from "@/lib/social";
import { useViewer } from "@/lib/viewer";
import Dialog from "../ui/Dialog";
import Avatar from "../ui/Avatar";
import { cn, pill, pillActive, pillIdle } from "../ui/styles";
import { FollowButton } from "./ProfileActions";

/** Followers / following, with follow buttons right in the rows. */
export default function PeopleDialog({
  profile,
  tab,
  onTab,
  open,
  onOpenChange,
}: {
  profile: Profile;
  tab: "followers" | "following";
  onTab: (t: "followers" | "following") => void;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const v = useViewer();
  const [lists, setLists] = useState<{ followers: Profile[] | null; following: Profile[] | null }>({
    followers: null,
    following: null,
  });

  useEffect(() => {
    let stale = false;
    Promise.all([fetchFollowers(profile.id), fetchFollowing(profile.id)]).then(([a, b]) => {
      if (!stale) setLists({ followers: a, following: b });
    });
    return () => {
      stale = true;
    };
  }, [profile.id]);

  const rows = lists[tab];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={profile.display_name || `@${profile.username}`}>
      <div className="flex gap-1.5">
        {(["followers", "following"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTab(t)}
            className={cn(pill, tab === t ? pillActive : pillIdle)}
          >
            {t === "followers" ? "Followers" : "Following"}
            {lists[t] && <span className="font-normal opacity-60">{lists[t]!.length}</span>}
          </button>
        ))}
      </div>
      <div className="-mx-2 flex min-h-24 flex-col">
        {rows === null ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <span className="size-9 animate-pulse rounded-[30%] bg-gray-200 dark:bg-neutral-700" />
              <span className="h-3.5 w-32 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-gray-500 dark:text-neutral-400">
            {tab === "followers" ? "No followers yet." : "Not following anyone yet."}
          </p>
        ) : (
          rows.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-neutral-700/40">
              <Link
                href={`/${p.username}`}
                onClick={() => onOpenChange(false)}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <Avatar p={p} className="size-9" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">
                    {p.display_name || p.username}
                  </span>
                  <span className="block truncate text-xs text-gray-500 dark:text-neutral-400">@{p.username}</span>
                </span>
              </Link>
              {v.status === "signed-in" && v.profile?.id !== p.id && <FollowButton profile={p} small />}
            </div>
          ))
        )}
      </div>
    </Dialog>
  );
}
