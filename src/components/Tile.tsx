"use client";

import { memo } from "react";
import type { Item } from "@/lib/types";
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
}: {
  item: Item;
  tilted?: boolean;
  /** above-the-fold tiles load immediately at high priority (LCP) */
  eager?: boolean;
}) {
  const polaroid = item.media_type === "photo";
  const imgPerf = {
    loading: eager ? ("eager" as const) : ("lazy" as const),
    fetchPriority: eager ? ("high" as const) : undefined,
    decoding: "async" as const,
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
              src={item.image_url}
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
            ? "screenframe"
            : null;

  return (
    <div className="item-media relative flex aspect-square w-full items-center justify-center [container-type:inline-size]">
      {item.image_url ? (
        deco ? (
          <div className={`${deco} item-media-img`} style={tiltStyle}>
            <img
              src={item.image_url}
              alt={item.title}
              {...imgPerf}
              className={`block ${
                deco === "vinylframe" ? "max-h-[86cqw] max-w-[86cqw]" : "max-h-[92cqw] max-w-[88cqw]"
              }`}
            />
          </div>
        ) : (
          <img
            src={item.image_url}
            alt={item.title}
            {...imgPerf}
            style={tiltStyle}
            className={`item-media-img object-contain ${
              squareArt ? "max-h-[86%] max-w-[86%]" : "max-h-full max-w-full"
            }`}
          />
        )
      ) : (
        /* the typographic cover — fixed ink on the tone (an object like the
           polaroid, it doesn't follow the theme). all text equal size and
           weight: hierarchy lives in the label below the tile, not here. */
        <div
          style={{ ...tiltStyle, background: coverTone(item.title) }}
          className="item-media-img flex h-full w-full flex-col justify-end p-3"
        >
          <span className="text-[11px] font-medium leading-snug text-[#22211fcc]">
            {item.title}
          </span>
          {item.creator && (
            <span className="mt-0.5 text-[11px] font-medium leading-snug text-[#22211f80]">
              {item.creator}
            </span>
          )}
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
