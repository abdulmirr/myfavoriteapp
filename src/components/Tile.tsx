"use client";

import { memo } from "react";
import type { Item } from "@/lib/types";
import { coverSrcSet, thumbCover } from "@/lib/img";
import { hashRange } from "@/lib/rand";
import { playSfx } from "@/lib/sfx";

/** Deterministic whisper of a tilt (max 1.2°), stable per item; most stay vertical. */
function tiltOf(id: string): number {
  const h = hashRange(id);
  if (Math.abs(h) < 0.6) return 0;
  return h * 1.2;
}

/* ── typographic cover for imageless items ──
   When there's no artwork, typography is the artwork: a quiet tone field with
   the words set plainly. The tone derives from the title, so the same item is
   always the same color — intentional, not random. Muted and desaturated so a
   cluster of them stays calm on the wall. */
const COVER_TONES = ["#e9e4d8", "#dde4dc", "#dbe1e7", "#e7dde1", "#e8e1d2", "#e0e0e4"];
export function coverTone(seed: string): string {
  return COVER_TONES[Math.floor(((hashRange(seed) + 1) / 2) * COVER_TONES.length) % COVER_TONES.length];
}

/**
 * Videos wear YouTube's mark only when the link agrees — the /api/og oEmbed
 * branch uses this same host test, and Vimeo links go through it too.
 */
export function isYouTube(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return /(^|\.)(youtube\.com|youtu\.be)$/i.test(new URL(url).hostname);
  } catch {
    return false; // not a parseable URL — no badge
  }
}

/** Screen bezel, plus the YouTube mark when the video is hosted there. */
export function screenFrame(viewUrl: string | null | undefined): string {
  return isYouTube(viewUrl) ? "screenframe screenframe--yt" : "screenframe";
}

/**
 * Square media tile. Each medium keeps the same object-on-a-wall language
 * (soft shadow, whisper of tilt) with one distinguishing cue:
 *   photo → polaroid · video → paused-player screen bezel · book → fore-edge
 *   of pages · movie/tv → one-sheet in a snap frame · music → vinyl peeking
 *   from the sleeve · podcast → bare album art
 * Frames shrink-wrap the image's natural aspect ratio, capped in container
 * units so frame plus chin/sprockets/mat always fits the square tile.
 */
export function TileMedia({
  item,
  tilted = true,
  eager = false,
  thumb,
}: {
  item: Item;
  tilted?: boolean;
  /** above-the-fold tiles load immediately at high priority (LCP) */
  eager?: boolean;
  /** small-slot mode (feed thumbs, cover strips): fetch a ~thumb-px CDN
      variant instead of the full 500-600px cover */
  thumb?: number;
}) {
  const polaroid = item.media_type === "photo";
  // grid tiles get a responsive srcset (the browser downloads the smallest
  // variant that fills the slot); thumb slots pin one small variant directly
  const imgPerf = {
    loading: eager ? ("eager" as const) : ("lazy" as const),
    fetchPriority: eager ? ("high" as const) : undefined,
    decoding: "async" as const,
    ...(item.image_url
      ? thumb
        ? { src: thumbCover(item.image_url, thumb) }
        : coverSrcSet(item.image_url)
      : null),
  };
  const tiltStyle = tilted
    ? ({ "--tilt": `${tiltOf(item.id)}deg` } as React.CSSProperties)
    : undefined;

  // square album art fills the whole tile while portrait covers don't —
  // pull music/podcasts in slightly so widths read consistent across a row
  const squareArt = item.media_type === "music" || item.media_type === "podcast";

  if (polaroid) {
    return (
      <div className="item-media relative flex aspect-square w-full items-center justify-center [container-type:inline-size]">
        <div className="polaroid item-media-img" style={tiltStyle}>
          {item.image_url ? (
            <img
              alt={item.title}
              {...imgPerf}
              className="block max-h-[75cqw] max-w-[75cqw] bg-zinc-100"
            />
          ) : (
            <div className="h-[75cqw] w-[75cqw] bg-zinc-100" />
          )}
        </div>
      </div>
    );
  }

  const deco =
    item.media_type === "book"
      ? "bookframe"
      : item.media_type === "movie" || item.media_type === "tv"
        ? "posterframe"
        : item.media_type === "music"
          ? "vinylframe"
          : item.media_type === "video"
            ? screenFrame(item.view_url)
            : null;

  return (
    <div className="item-media relative flex aspect-square w-full items-center justify-center [container-type:inline-size]">
      {item.image_url ? (
        deco ? (
          <div className={`${deco} item-media-img`} style={tiltStyle}>
            <img
              alt={item.title}
              {...imgPerf}
              className={`block ${
                deco === "vinylframe" ? "max-h-[86cqw] max-w-[86cqw]" : "max-h-[92cqw] max-w-[88cqw]"
              }`}
            />
          </div>
        ) : (
          <img
            alt={item.title}
            {...imgPerf}
            style={tiltStyle}
            className={`item-media-img object-contain ${
              squareArt ? "max-h-[86%] max-w-[86%]" : "max-h-full max-w-full"
            }`}
          />
        )
      ) : (
        /* the typographic cover — title only, set large and top-left like a
           printed jacket (the byline lives in the label below the tile).
           Sized in container units so the type scales with the cover. Fixed
           ink on the tone: an object like the polaroid, it ignores the theme. */
        <div
          style={{ ...tiltStyle, background: coverTone(item.title) }}
          className="item-media-img h-full w-full overflow-hidden p-[8cqw] text-left"
        >
          <span className="line-clamp-5 block text-[9.5cqw] font-medium leading-[1.2] tracking-[-0.01em] text-[#22211fd9]">
            {item.title}
          </span>
        </div>
      )}
    </div>
  );
}

function Tile({
  item,
  dimmed,
  hidden,
  eager,
  lifted = false,
  onOpen,
}: {
  item: Item;
  dimmed: boolean;
  hidden: boolean;
  eager?: boolean;
  /** mid-drag: the picked-up tile reads lifted while the wall shuffles under it */
  lifted?: boolean;
  onOpen: (item: Item, rect: DOMRect) => void;
}) {
  return (
    <div
      data-item-id={item.id}
      className={`transition-[opacity,transform] duration-300 ${
        dimmed ? "opacity-25" : "opacity-100"
      } ${lifted ? "z-10 scale-[1.05] opacity-80" : ""}`}
      style={hidden ? { visibility: "hidden" } : undefined}
    >
      <button
        aria-label={`View ${item.title}`}
        className="block w-full cursor-pointer"
        onClick={(e) => {
          const media = e.currentTarget.querySelector(".item-media");
          if (media) {
            playSfx(item.media_type);
            onOpen(item, media.getBoundingClientRect());
          }
        }}
      >
        <div className="item-tile relative block">
          <TileMedia item={item} eager={eager} />
          <div className="item-label flex justify-center">
            <div className="item-label-inner text-center">
              <span className="item-name">{item.title}</span>
              {item.creator && <span className="item-sub">{item.creator}</span>}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

// search keystrokes and the size slider re-render the whole grid; memo keeps
// unchanged tiles (stable item refs + useCallback'd onOpen) from re-rendering
export default memo(Tile);
