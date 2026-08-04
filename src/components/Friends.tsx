"use client";

import { memo, useEffect, useState } from "react";
import Link from "next/link";
import type { Item, Profile } from "@/lib/types";
import {
  fetchDiscover,
  fetchFollowing,
  type DiscoverProfile,
} from "@/lib/social";
import { TileMedia, coverTone } from "./Tile";

/**
 * Avatar with a voice. Hovering the pfp raises a small speech bubble of the
 * person's bio — tail anchored at their chin, drifting up on the app's
 * signature ease. The bubble hugs short bios and wraps long ones (capped at
 * ~4.5 covers wide), so it always reads balanced. Pure CSS, so it costs
 * nothing when nobody's hovering; pointer-events-none keeps the card click.
 */
function Avatar({ p, size = "h-10 w-10" }: { p: Profile; size?: string }) {
  const bio = p.bio?.trim();
  return (
    <div className="group/pfp relative shrink-0">
      <div className={`flex ${size} items-center justify-center overflow-hidden bg-zinc-100`}>
        {p.avatar_url ? (
          <img
            src={p.avatar_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
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
          <div className="border border-zinc-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-zinc-700 shadow-lg">
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
        {/* ~70px slots — fetch the 200px CDN variant, not the 600px cover */}
        <TileMedia item={item} thumb={200} />
      </div>
    );
  }
  return (
    <div
      className="item-media-img aspect-square w-full overflow-hidden p-[8cqw] text-left [container-type:inline-size]"
      style={{ background: coverTone(item.title) }}
    >
      <span className="line-clamp-4 block text-[10cqw] font-medium leading-[1.2] text-[#22211fd9]">
        {item.title}
      </span>
    </div>
  );
});

/**
 * One person, one row — identity first: a full-size avatar and the name at
 * reading size, never squeezed (the counts fold into the byline instead of
 * competing for the row's right edge). Their taste rides along as four small
 * covers on the right — a hint, not the headline. The hover is one quiet
 * gesture, not per-cover theatrics: the row's ground tints and the strip
 * drifts up a breath, all as a single object.
 */
function PersonCard({ p, strip, meta }: { p: Profile; strip: Item[]; meta?: string }) {
  return (
    <Link
      href={`/${p.username}`}
      className="group -mx-3 flex items-center gap-3.5 px-3 py-2 transition-colors duration-200 hover:bg-zinc-900/[0.03]"
    >
      <Avatar p={p} size="h-11 w-11" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium leading-snug text-zinc-900">
          {p.display_name || `@${p.username}`}
        </div>
        <div className="truncate text-[11px] text-zinc-400">
          @{p.username}
          {meta && <span className="text-zinc-400"> · {meta}</span>}
        </div>
      </div>
      {strip.length > 0 && (
        <div className="grid w-[7.5rem] shrink-0 grid-cols-4 gap-1 transition-transform duration-200 ease-[var(--ease-drift,ease-out)] group-hover:-translate-y-0.5">
          {strip.map((it) => (
            <MiniTile key={it.id} item={it} />
          ))}
        </div>
      )}
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
    // two columns, not three — the names get the room; the covers are the garnish
    <div className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
      {others.map((p) => (
        <PersonCard
          key={p.id}
          p={p}
          strip={p.preview}
          meta={
            p.shared > 0
              ? `${p.shared} shared`
              : `${p.count} favorite${p.count === 1 ? "" : "s"}`
          }
        />
      ))}
    </div>
  );
}
