"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { ProfilePageData } from "@/lib/data";
import { fetchTasteMatch, tasteApprovalCount, type TasteMatch } from "@/lib/social";
import { useViewer } from "@/lib/viewer";
import { TYPE_PLURAL } from "@/lib/work";
import type { MediaType } from "@/lib/types";
import Star from "../ui/Star";

const PeopleDialog = dynamic(() => import("./PeopleDialog"));

/** "213 favorites · 16 followers · 17 following" — the counts open the people list. */
export default function ProfileStats({ profile }: { profile: ProfilePageData }) {
  const [people, setPeople] = useState<"followers" | "following" | null>(null);

  const { favorites, followers, following } = profile.counts;
  const btn =
    "cursor-pointer rounded-md text-gray-500 underline-offset-2 transition-colors hover:text-gray-900 hover:underline dark:text-neutral-400 dark:hover:text-neutral-100";
  const num = (n: number) => (
    <span className="font-semibold text-gray-900 dark:text-neutral-100">{n.toLocaleString()}</span>
  );

  return (
    <>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-neutral-400">
        <span>
          {num(favorites)} {favorites === 1 ? "favorite" : "favorites"}
        </span>
        <button type="button" className={btn} onClick={() => setPeople("followers")}>
          {num(followers)} {followers === 1 ? "follower" : "followers"}
        </button>
        <button type="button" className={btn} onClick={() => setPeople("following")}>
          {num(following)} following
        </button>
      </p>
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

const pill =
  "inline-flex items-center gap-1.5 rounded-full bg-gray-900/[0.05] px-3 py-1 text-[13px] text-gray-700 dark:bg-white/[0.07] dark:text-neutral-300";

/**
 * The quiet social signals, as pills under the links: what you share with
 * this person ("36 favorites in common · mostly films", visitors only) and
 * how many approve their taste. Nothing renders until there's something.
 */
export function TasteBadges({ profile }: { profile: ProfilePageData }) {
  const v = useViewer();
  const me = v.profile?.id;
  const [match, setMatch] = useState<TasteMatch | null>(null);
  const [approvals, setApprovals] = useState(0);

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

  const shared = me && me !== profile.id && match ? match.shared : 0;
  if (!shared && !approvals) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {shared > 0 && (
        <span className={pill}>
          <Star className="size-3.5 text-star" />
          {shared.toLocaleString()} {shared === 1 ? "favorite" : "favorites"} in common
          {match?.top_type && <span className="text-gray-500 dark:text-neutral-400">· mostly {TYPE_PLURAL[match.top_type as MediaType] ?? match.top_type}</span>}
        </span>
      )}
      {approvals > 0 && (
        <span className={pill}>
          {approvals.toLocaleString()} {approvals === 1 ? "approves" : "approve"} {me === profile.id ? "your" : "their"} taste
        </span>
      )}
    </div>
  );
}
