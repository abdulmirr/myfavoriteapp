"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { fetchSuggestions } from "@/lib/social";
import { playUi } from "@/lib/sfx";

/* ── cold start: libraries worth following ─────────────────────────────────── */

export default function Suggestions({ viewer, lead }: { viewer: Profile | null; lead?: string }) {
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSuggestions(viewer?.id ?? null).then(setPeople);
  }, [viewer]);

  const follow = async (p: Profile) => {
    if (!viewer) return;
    const { error } = await supabase()
      .from("follows")
      .insert({ follower_id: viewer.id, followee_id: p.id });
    if (!error) {
      playUi("confirm");
      setFollowed((prev) => new Set(prev).add(p.id));
    }
  };

  if (people === null) {
    return lead ? null : <p className="pt-12 text-center text-xs text-zinc-400">Loading…</p>;
  }
  if (people.length === 0) {
    // with a custom lead this is an add-on section, so vanish quietly
    return lead ? null : (
      <p className="pt-12 text-center text-xs text-zinc-400">
        You aren’t following anyone yet — find people with the search above.
      </p>
    );
  }
  return (
    <div className="pt-4">
      <p className="text-xs text-zinc-400">
        {lead ?? "You aren’t following anyone yet. Some libraries worth a look:"}
      </p>
      <ul className="mt-6 flex flex-col gap-4">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-3">
            <Link
              href={`/${p.username}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100 transition-opacity hover:opacity-80"
            >
              {p.avatar_url ? (
                <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs font-semibold text-zinc-300">
                  {(p.display_name || p.username).slice(0, 1)}
                </span>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/${p.username}`}
                className="text-[13px] font-medium text-zinc-900 transition-colors hover:text-zinc-400"
              >
                {p.display_name || `@${p.username}`}
              </Link>
              {p.bio && <p className="truncate text-xs text-zinc-400">{p.bio}</p>}
            </div>
            {followed.has(p.id) ? (
              <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                Following ✓
              </span>
            ) : (
              <button
                onClick={() => follow(p)}
                className="shrink-0 cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
              >
                + Follow
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
