"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { ProfilePageData } from "@/lib/data";
import { fetchTasteMatch, tasteApprovalCount, type TasteMatch } from "@/lib/social";
import { useViewer } from "@/lib/viewer";
import { TYPE_PLURAL } from "@/lib/work";
import type { MediaType } from "@/lib/types";

const PeopleDialog = dynamic(() => import("./PeopleDialog"));

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * "213 favorites · 16 followers · 17 following" — the counts open the people
 * list. Visitors also get the taste match ("You share 12 favorites — mostly
 * music") and how many approve this person's taste.
 */
export default function ProfileStats({ profile }: { profile: ProfilePageData }) {
  const v = useViewer();
  const [people, setPeople] = useState<"followers" | "following" | null>(null);
  const [match, setMatch] = useState<TasteMatch | null>(null);
  const [approvals, setApprovals] = useState(0);
  const me = v.profile?.id;

  useEffect(() => {
    let stale = false;
    tasteApprovalCount(profile.id).then((n) => !stale && setApprovals(n));
    return () => {
      stale = true;
    };
  }, [profile.id]);

  useEffect(() => {
    if (!me || me === profile.id) return;
    let stale = false;
    fetchTasteMatch(me, profile.id).then((m) => !stale && setMatch(m));
    return () => {
      stale = true;
    };
  }, [me, profile.id]);

  const { favorites, followers, following } = profile.counts;
  const btn =
    "cursor-pointer rounded-md text-gray-500 underline-offset-2 transition-colors hover:text-gray-900 hover:underline dark:text-neutral-400 dark:hover:text-neutral-100";

  return (
    <>
      <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-gray-500 dark:text-neutral-400">
        <span>{plural(favorites, "favorite")}</span>
        <span aria-hidden>·</span>
        <button type="button" className={btn} onClick={() => setPeople("followers")}>
          {plural(followers, "follower")}
        </button>
        <span aria-hidden>·</span>
        <button type="button" className={btn} onClick={() => setPeople("following")}>
          {following.toLocaleString()} following
        </button>
      </p>
      {(approvals > 0 || (match && match.shared > 0)) && (
        <p className="w-full text-xs text-gray-500 dark:text-neutral-400">
          {match && match.shared > 0 && (
            <>
              You share {plural(match.shared, "favorite")}
              {match.top_type && ` — mostly ${TYPE_PLURAL[match.top_type as MediaType] ?? match.top_type}`}
            </>
          )}
          {match && match.shared > 0 && approvals > 0 && " · "}
          {approvals > 0 && `${approvals} ${approvals === 1 ? "approves" : "approve"} ${me === profile.id ? "your" : "their"} taste`}
        </p>
      )}
      {people && (
        <PeopleDialog
          profile={profile}
          tab={people}
          onTab={setPeople}
          open={!!people}
          onOpenChange={(o) => !o && setPeople(null)}
        />
      )}
    </>
  );
}
