"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";

function ProfileList({
  people,
  empty,
  onClose,
  viewer,
  followingIds,
}: {
  people: Profile[];
  empty: string;
  onClose: () => void;
  viewer?: Profile | null;
  followingIds?: Set<string>;
}) {
  // local overrides so rows flip instantly without refetching the panel
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());

  const isFollowing = (id: string) =>
    overrides.get(id) ?? followingIds?.has(id) ?? false;

  const toggle = async (p: Profile) => {
    if (!viewer) return;
    const db = supabase();
    if (isFollowing(p.id)) {
      const { error } = await db
        .from("follows")
        .delete()
        .eq("follower_id", viewer.id)
        .eq("followee_id", p.id);
      if (!error) setOverrides((prev) => new Map(prev).set(p.id, false));
    } else {
      const { error } = await db
        .from("follows")
        .insert({ follower_id: viewer.id, followee_id: p.id });
      if (!error) setOverrides((prev) => new Map(prev).set(p.id, true));
    }
  };

  if (people.length === 0) return <p className="px-5 py-6 text-xs text-zinc-400">{empty}</p>;
  return (
    <ul className="max-h-96 overflow-y-auto">
      {people.map((f) => (
        <li key={f.id} className="flex items-center">
          <Link
            href={`/${f.username}`}
            onClick={onClose}
            className="flex min-w-0 flex-1 items-center gap-3 px-5 py-2.5 transition-colors hover:bg-zinc-50"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden bg-zinc-100">
              {f.avatar_url ? (
                <img src={f.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs font-semibold text-zinc-300">
                  {(f.display_name || f.username).slice(0, 1)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs text-zinc-900">{f.display_name}</div>
              <div className="truncate text-[11px] text-zinc-400">@{f.username}</div>
            </div>
          </Link>
          {viewer && f.id !== viewer.id && (
            <button
              onClick={() => toggle(f)}
              className={`shrink-0 cursor-pointer px-5 py-2.5 text-[10px] uppercase tracking-[0.08em] transition-colors ${
                isFollowing(f.id)
                  ? "text-zinc-900 hover:text-zinc-400"
                  : "text-zinc-400 hover:text-zinc-900"
              }`}
            >
              {isFollowing(f.id) ? "Following ✓" : "+ Follow"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Profile list popup. Two shapes:
 * - followers/following → tabbed people panel (profile sidebar)
 * - friends + title     → single list (e.g. "Favorited by" in the detail view)
 * Pass `viewer` + `viewerFollowing` to put a follow toggle on every row.
 */
export default function FriendsPanel({
  friends,
  followers,
  following,
  onClose,
  title,
  viewer,
  viewerFollowing,
}: {
  friends?: Profile[];
  followers?: Profile[];
  following?: Profile[];
  onClose: () => void;
  title?: string;
  viewer?: Profile | null;
  viewerFollowing?: Profile[];
}) {
  const tabbed = followers !== undefined || following !== undefined;
  const [tab, setTab] = useState<"followers" | "following">("followers");
  const followingIds = useMemo(
    () => new Set((viewerFollowing ?? []).map((p) => p.id)),
    [viewerFollowing]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto" role="dialog" aria-modal="true">
      <motion.button
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-white/35 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      />
      <div className="pointer-events-none relative flex min-h-full items-start justify-center px-4 pt-[22vh] pb-16">
        <motion.div
          className="pointer-events-auto w-full max-w-sm border border-zinc-200 bg-white shadow-2xl"
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
        >
          {tabbed ? (
            <>
              <div className="flex gap-5 border-b border-zinc-100 px-5 py-3">
                {(
                  [
                    { key: "followers", label: `Followers (${followers?.length ?? 0})` },
                    { key: "following", label: `Following (${following?.length ?? 0})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`cursor-pointer text-xs transition-colors ${
                      tab === t.key
                        ? "font-semibold text-zinc-900"
                        : "text-zinc-400 hover:text-zinc-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <ProfileList
                people={(tab === "followers" ? followers : following) ?? []}
                empty={tab === "followers" ? "No followers yet." : "Not following anyone yet."}
                onClose={onClose}
                viewer={viewer}
                followingIds={followingIds}
              />
            </>
          ) : (
            <>
              <h2 className="border-b border-zinc-100 px-5 py-3 text-sm font-semibold tracking-tight text-zinc-900">
                {title ?? "People"}
              </h2>
              <ProfileList
                people={friends ?? []}
                empty="No one yet."
                onClose={onClose}
                viewer={viewer}
                followingIds={followingIds}
              />
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
