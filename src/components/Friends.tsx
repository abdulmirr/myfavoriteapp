"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Item, Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  fetchDiscover,
  fetchFollowing,
  fetchShowcases,
  type DiscoverProfile,
  type Showcase,
} from "@/lib/social";
import { TileMedia } from "./Tile";

function Avatar({ p, size }: { p: Profile; size: string }) {
  return (
    <div
      className={`flex ${size} shrink-0 items-center justify-center overflow-hidden bg-zinc-100`}
    >
      {p.avatar_url ? (
        <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-semibold text-zinc-300">
          {(p.display_name || p.username).slice(0, 1)}
        </span>
      )}
    </div>
  );
}

/**
 * Strip-sized tile. TileMedia's coverless fallback sets 11px type that
 * overflows these ~70px squares, so imageless items get a label card sized
 * for the strip instead.
 */
function MiniTile({ item }: { item: Item }) {
  if (item.image_url) return <TileMedia item={item} />;
  return (
    <div className="flex aspect-square w-full items-center justify-center overflow-hidden border border-zinc-200 p-1.5">
      <span className="line-clamp-3 text-center text-[9px] leading-tight text-zinc-500">
        {item.title}
      </span>
    </div>
  );
}

/**
 * One friend, at a glance: who they are, what they say about themselves, and
 * the strip that stands in for their taste — their pinned Top 4, or their
 * latest saves until they pin one. The whole card is a door to their library.
 */
function FriendCard({ p, showcase }: { p: Profile; showcase?: Showcase }) {
  const strip = showcase?.items ?? [];
  return (
    <Link
      href={`/${p.username}`}
      className="group flex flex-col border border-zinc-200 p-5 transition-colors hover:bg-zinc-50"
    >
      <div className="flex items-center gap-3">
        <Avatar p={p} size="h-12 w-12" />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-zinc-900">
            {p.display_name || `@${p.username}`}
          </div>
          <div className="truncate text-[11px] text-zinc-400">@{p.username}</div>
        </div>
      </div>
      {p.bio && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-zinc-500">{p.bio}</p>
      )}
      <div className="mt-auto pt-4">
        {strip.length > 0 ? (
          <>
            <div className="mb-2 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
              {showcase?.pinned ? "Top 4" : "Latest"}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {strip.map((it) => (
                <MiniTile key={it.id} item={it} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-zinc-300">Nothing favorited yet.</p>
        )}
      </div>
    </Link>
  );
}

/** A compact discover row: identity + the one number that matters (overlap). */
function OtherRow({
  p,
  followed,
  onToggle,
}: {
  p: DiscoverProfile;
  followed: boolean;
  onToggle: (p: DiscoverProfile) => void;
}) {
  return (
    <li className="flex items-center border-b border-zinc-100">
      <Link
        href={`/${p.username}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 transition-opacity hover:opacity-70"
      >
        <Avatar p={p} size="h-9 w-9" />
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-zinc-900">
            {p.display_name || `@${p.username}`}
          </div>
          <div className="truncate text-[11px] text-zinc-400">
            @{p.username}
            {/* overlap is the ranking signal — it goes before the count so a
                long username can't truncate it away */}
            {p.shared > 0 && <span className="text-zinc-500"> · {p.shared} shared</span>}
            {" · "}
            {p.count} favorite{p.count === 1 ? "" : "s"}
          </div>
        </div>
      </Link>
      <button
        onClick={() => onToggle(p)}
        className={`shrink-0 cursor-pointer py-3 pl-3 text-[10px] uppercase tracking-[0.08em] transition-colors ${
          followed ? "text-zinc-900 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-900"
        }`}
      >
        {followed ? "Following ✓" : "+ Follow"}
      </button>
    </li>
  );
}

/**
 * /friends — the people directory. Two shelves: the people you follow, each a
 * card with their pinned Top 4 (one good look at every friend's taste), and
 * below it everyone else on the app ranked by how much of your library they
 * share — the place to wander into new people.
 */
export default function Friends() {
  const router = useRouter();
  const [viewer, setViewer] = useState<Profile | null>(null);
  // null = loading; [] = follows nobody (the two states render differently)
  const [friends, setFriends] = useState<Profile[] | null>(null);
  const [showcases, setShowcases] = useState<Map<string, Showcase>>(new Map());
  const [others, setOthers] = useState<DiscoverProfile[] | null>(null);
  // rows followed/unfollowed in place, so the list doesn't reshuffle mid-read
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    (async () => {
      const db = supabase();
      const { data } = await db.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) {
        router.replace("/signin");
        return;
      }
      // the claim trigger runs on email confirm — brief retry covers the race
      // (same shape as Home and /add)
      let prof: Profile | null = null;
      for (let i = 0; i < 5 && !cancelled; i++) {
        const { data: p } = await db
          .from("profiles")
          .select("id, user_id, username, display_name, bio, avatar_url, socials")
          .eq("user_id", userId)
          .maybeSingle();
        if (p) {
          prof = p as Profile;
          break;
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      if (cancelled) return;
      if (!prof) {
        router.replace("/");
        return;
      }
      setViewer(prof);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    (async () => {
      const flw = await fetchFollowing(viewer.id);
      if (cancelled) return;
      // a directory, not a feed — stable alphabetical order
      flw.sort((a, b) =>
        (a.display_name || a.username).localeCompare(b.display_name || b.username)
      );
      setFriends(flw);
      const ids = flw.map((f) => f.id);
      const [sc, disc] = await Promise.all([
        fetchShowcases(ids),
        fetchDiscover(viewer.id, ids),
      ]);
      if (cancelled) return;
      setShowcases(sc);
      setOthers(disc);
    })();
    return () => {
      cancelled = true;
    };
  }, [viewer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.push("/");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const isFollowed = (id: string) => overrides.get(id) ?? false;

  const toggle = async (p: DiscoverProfile) => {
    if (!viewer) return;
    const db = supabase();
    if (isFollowed(p.id)) {
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

  return (
    <div
      className={`min-h-screen bg-white transition-opacity duration-700 ease-out ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
    >
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-5 py-5 sm:px-8">
          <Link
            href="/"
            title="Back to home"
            aria-label="Back to home"
            className="flex h-7 w-7 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-900"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 3 5 8l5 5" />
            </svg>
          </Link>
          <h1 className="text-sm font-semibold tracking-tight text-zinc-900">Friends</h1>
          {viewer && (
            <Link
              href={`/${viewer.username}`}
              title="Your library"
              aria-label="Your library"
              className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden bg-zinc-100 transition-opacity hover:opacity-80"
            >
              {viewer.avatar_url ? (
                <img
                  src={viewer.avatar_url}
                  alt={viewer.display_name || viewer.username}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[11px] font-semibold text-zinc-300">
                  {(viewer.display_name || viewer.username).slice(0, 1)}
                </span>
              )}
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 pb-24 pt-6 sm:px-8">
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
            Your friends{friends && friends.length > 0 ? ` — ${friends.length}` : ""}
          </h2>
          {friends === null ? null : friends.length === 0 ? (
            <p className="mt-4 text-xs leading-relaxed text-zinc-400">
              You&apos;re not following anyone yet — the people below are a good place to
              start.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {friends.map((f) => (
                <FriendCard key={f.id} p={f} showcase={showcases.get(f.id)} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-14">
          <h2 className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
            Other users
          </h2>
          <p className="mt-1.5 text-xs text-zinc-400">
            People with taste like yours — ranked by the favorites you share.
          </p>
          {others === null ? null : others.length === 0 ? (
            <p className="mt-4 text-xs text-zinc-400">
              No one new right now — you already know everyone here.
            </p>
          ) : (
            <ul className="mt-3 grid sm:grid-cols-2 sm:gap-x-10">
              {others.map((p) => (
                <OtherRow key={p.id} p={p} followed={isFollowed(p.id)} onToggle={toggle} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
