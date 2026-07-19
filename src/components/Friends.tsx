"use client";

import { memo, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Item, Profile } from "@/lib/types";
import {
  fetchDiscover,
  fetchFollowing,
  type DiscoverProfile,
} from "@/lib/social";
import { TileMedia } from "./Tile";

/**
 * Avatar with a voice. Hovering the pfp raises a small speech bubble of the
 * person's bio — tail anchored at their chin, drifting up on the app's
 * signature ease. The bubble hugs short bios and wraps long ones (capped at
 * ~4.5 covers wide), so it always reads balanced. Pure CSS, so it costs
 * nothing when nobody's hovering; pointer-events-none keeps the card click.
 */
function Avatar({ p }: { p: Profile }) {
  const bio = p.bio?.trim();
  return (
    <div className="group/pfp relative shrink-0">
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-zinc-100">
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs font-semibold text-zinc-300">
            {(p.display_name || p.username).slice(0, 1)}
          </span>
        )}
      </div>
      {bio && (
        <div
          role="tooltip"
          className="pointer-events-none invisible absolute bottom-full left-0 z-20 mb-2.5 w-max max-w-56 origin-bottom-left translate-y-1.5 scale-90 opacity-0 transition-[opacity,transform,visibility] duration-200 ease-[var(--ease-drift)] group-hover/pfp:visible group-hover/pfp:translate-y-0 group-hover/pfp:scale-100 group-hover/pfp:opacity-100 group-hover/pfp:delay-75"
        >
          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-zinc-700 shadow-lg">
            {bio}
          </div>
          {/* the tail: a rotated square sharing the bubble's border, pointing
              at the pfp — same hairline language as everything else here */}
          <div className="absolute -bottom-[5px] left-[15px] h-2.5 w-2.5 rotate-45 border-b border-r border-zinc-200 bg-white" />
        </div>
      )}
    </div>
  );
}

/**
 * Hands the invite text to Messages on Apple devices (sms: opens
 * Messages.app on macOS too), the share sheet on other phones, and
 * falls back to copying the message elsewhere.
 */
export function InviteFriendButton() {
  const [copied, setCopied] = useState(false);

  const invite = async () => {
    const text = `been putting all my favorite movies + music into this app. make yours, i'll show you mine ${window.location.origin}`;
    if (/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)) {
      window.location.href = `sms:&body=${encodeURIComponent(text)}`;
      return;
    }
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <button
      onClick={invite}
      className="flex h-9 shrink-0 cursor-pointer items-center gap-2 bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
    >
      {copied ? "Invite copied ✓" : "+ Invite a friend"}
    </button>
  );
}

/**
 * Strip-sized tile. TileMedia's coverless fallback sets 11px type that
 * overflows these ~70px squares, so imageless items get a label card sized
 * for the strip instead — and a cover that 404s (dead CDN link) falls back
 * to the same card rather than the browser's broken-image glyph.
 */
const MiniTile = memo(function MiniTile({ item }: { item: Item }) {
  const [broken, setBroken] = useState(false);
  if (item.image_url && !broken) {
    return (
      <div onErrorCapture={() => setBroken(true)}>
        <TileMedia item={item} />
      </div>
    );
  }
  return (
    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-zinc-200 p-1.5">
      <span className="line-clamp-3 text-center text-[9px] leading-tight text-zinc-500">
        {item.title}
      </span>
    </div>
  );
});

/**
 * One person, one card, one rhythm for both shelves: identity, a full strip
 * of four covers (framed, like everything on a wall here), and a quiet gray
 * footer — the bio for friends, the overlap numbers for strangers. The whole
 * card is a door to their library.
 */
function PersonCard({
  p,
  strip,
  footer,
}: {
  p: Profile;
  strip: Item[];
  footer?: ReactNode;
}) {
  return (
    <Link
      href={`/${p.username}`}
      className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300"
    >
      <div className="flex items-center gap-3">
        <Avatar p={p} />
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-zinc-900">
            {p.display_name || `@${p.username}`}
          </div>
          <div className="truncate text-[11px] text-zinc-400">@{p.username}</div>
        </div>
      </div>
      <div className="mt-3.5">
        {strip.length > 0 ? (
          <div className="grid grid-cols-4 gap-1.5">
            {strip.map((it) => (
              <MiniTile key={it.id} item={it} />
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-zinc-300">Nothing favorited yet.</p>
        )}
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </Link>
  );
}

/**
 * Your circle at a glance: a horizontal strip of the people you follow —
 * avatar (with the bio speech-bubble), name below, each a door to their
 * library. Sits at the top of the Friends tab; the activity feed follows.
 */
export function FriendsStrip({ friends }: { friends: Profile[] }) {
  if (friends.length === 0) return null;
  // a strip, not a feed — stable alphabetical order
  const sorted = [...friends].sort((a, b) =>
    (a.display_name || a.username).localeCompare(b.display_name || b.username)
  );
  return (
    <div className="flex gap-5 overflow-x-auto pb-2 [scrollbar-width:none]">
      {sorted.map((f) => (
        <Link key={f.id} href={`/${f.username}`} className="flex w-14 shrink-0 flex-col items-center gap-1.5 transition-opacity hover:opacity-80">
          <Avatar p={f} />
          <span className="w-full truncate text-center text-[10px] text-zinc-500">
            {f.display_name || f.username}
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * People you don't know yet, ranked by how much of your library they share —
 * the discovery half of the old directory, now living on Explore. Cards keep
 * the Top-4 cover strips and the shared/favorites footer.
 */
export function DiscoverPeople({ viewer }: { viewer: Profile }) {
  const [others, setOthers] = useState<DiscoverProfile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const flw = await fetchFollowing(viewer.id);
      if (cancelled) return;
      const disc = await fetchDiscover(viewer.id, flw.map((f) => f.id));
      if (!cancelled) setOthers(disc);
    })();
    return () => {
      cancelled = true;
    };
  }, [viewer]);

  if (others === null) return null;
  if (others.length === 0) {
    return <p className="text-xs text-zinc-400">No one new right now — you already know everyone here.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {others.map((p) => (
        <PersonCard
          key={p.id}
          p={p}
          strip={p.preview}
          footer={
            <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
              {p.shared > 0 && (
                <>
                  <span className="font-medium text-zinc-900">{p.shared} shared</span>
                  <span> · </span>
                </>
              )}
              {p.count} favorite{p.count === 1 ? "" : "s"}
            </p>
          }
        />
      ))}
    </div>
  );
}
