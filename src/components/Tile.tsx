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
        <div
          style={tiltStyle}
          className="item-media-img flex h-full w-full flex-col justify-end border border-zinc-200 p-3"
        >
          <span className="text-[11px] leading-tight text-zinc-900">{item.title}</span>
          <span className="mt-1 text-[10px] text-zinc-400">{item.creator}</span>
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
  onOpen,
}: {
  item: Item;
  dimmed: boolean;
  hidden: boolean;
  eager?: boolean;
  onOpen: (item: Item, rect: DOMRect) => void;
}) {
  return (
    <div
      data-item-id={item.id}
      className={`transition-opacity duration-300 ${dimmed ? "opacity-25" : "opacity-100"}`}
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
