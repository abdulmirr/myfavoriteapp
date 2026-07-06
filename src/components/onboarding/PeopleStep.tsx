"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { fetchSuggestions } from "@/lib/social";
import { playUi } from "@/lib/sfx";
import { RevealWords, Rise } from "./bits";

/**
 * Beat 4 — a few libraries worth following, so Home's Following tab isn't
 * empty on day one. Skippable.
 */
export default function PeopleStep({
  viewer,
  onNext,
}: {
  viewer: Profile;
  onNext: () => void;
}) {
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSuggestions(viewer.id).then(setPeople);
  }, [viewer.id]);

  // nothing to suggest (fresh network) — don't strand the user on a blank beat
  useEffect(() => {
    if (people && people.length === 0) onNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people]);

  const inFlight = useRef(new Set<string>());
  const follow = async (p: Profile) => {
    // rapid double-clicks would insert duplicate follow rows
    if (followed.has(p.id) || inFlight.current.has(p.id)) return;
    inFlight.current.add(p.id);
    const { error } = await supabase()
      .from("follows")
      .insert({ follower_id: viewer.id, followee_id: p.id });
    inFlight.current.delete(p.id);
    if (!error) {
      playUi("confirm");
      setFollowed((prev) => new Set(prev).add(p.id));
    }
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="text-2xl font-semibold leading-snug tracking-tight text-zinc-900 sm:text-3xl">
        <RevealWords text="Taste is meant to be shared." delay={0.1} />
      </h1>
      <Rise delay={0.35}>
        <p className="mt-2 text-xs text-zinc-400">
          Follow a few libraries and what they favorite shows up in your Following feed.
        </p>
      </Rise>

      <Rise delay={0.5} className="mt-8">
        {people === null ? (
          <p className="text-xs text-zinc-400 [animation:smart-search-wave_1.6s_ease-in-out_infinite]">
            Finding libraries…
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {people.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <Link
                  href={`/${p.username}`}
                  target="_blank"
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden bg-zinc-100 transition-opacity hover:opacity-80"
                >
                  {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
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
                    target="_blank"
                    className="text-[13px] font-medium text-zinc-900 transition-colors hover:text-zinc-400"
                  >
                    {p.display_name || `@${p.username}`}
                  </Link>
                  {p.bio && <p className="truncate text-xs text-zinc-400">{p.bio}</p>}
                </div>
                {followed.has(p.id) ? (
                  <span className="save-appear shrink-0 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
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
        )}
      </Rise>

      <Rise delay={0.6} className="mt-10 flex items-center gap-4">
        <button
          onClick={onNext}
          className="h-9 cursor-pointer bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Continue
        </button>
        {followed.size === 0 && (
          <button
            onClick={onNext}
            className="cursor-pointer text-xs text-zinc-400 transition-colors hover:text-zinc-900"
          >
            Skip
          </button>
        )}
      </Rise>
    </div>
  );
}
