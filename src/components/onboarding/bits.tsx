"use client";

import { motion } from "framer-motion";
import { hashRange } from "@/lib/rand";
import type { MediaType } from "@/lib/types";

/** Shared motion + frame primitives for the /welcome flow — the same
 *  choreography language as the landing page and library tiles. */

export const EASE_SNAP = [0.2, 0, 0, 1] as const; // --ease-snap
export const EASE_DRIFT = [0.16, 1, 0.3, 1] as const; // --ease-drift

/** Headline words rise out of an overflow-hidden slot, one after another. */
export function RevealWords({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <>
      {text.split(" ").map((word, i, words) => (
        <span
          key={i}
          className={`inline-block overflow-hidden align-bottom ${
            i < words.length - 1 ? "mr-[0.3em]" : ""
          }`}
        >
          <motion.span
            className="inline-block"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.75, delay: delay + i * 0.06, ease: EASE_DRIFT }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </>
  );
}

/** Quiet rise-in for subheads and controls under a headline. */
export function Rise({
  delay = 0,
  children,
  className,
}: {
  delay?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: EASE_DRIFT }}
    >
      {children}
    </motion.div>
  );
}

/** Object-on-a-wall frame per media type (mirrors TileMedia / Landing). */
const FRAME: Record<MediaType, string | null> = {
  book: "bookframe",
  movie: "posterframe",
  tv: "posterframe",
  music: "vinylframe",
  video: "screenframe",
  photo: "polaroid",
  podcast: null,
  article: null,
  other: null,
};

/** Same whisper-of-a-tilt rule as the library tiles. */
function tiltOf(id: string): number {
  const h = hashRange(id);
  return Math.abs(h) < 0.6 ? 0 : h * 1.2;
}

export function FramedCover({
  type,
  src,
  title,
  eager,
}: {
  type: MediaType;
  src: string;
  title: string;
  eager?: boolean;
}) {
  const frame = FRAME[type];
  const style = { "--tilt": `${tiltOf(src)}deg` } as React.CSSProperties;
  return (
    <div className="item-media relative flex aspect-square w-full items-center justify-center [container-type:inline-size]">
      {frame ? (
        <div className={`${frame} item-media-img`} style={style}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={title}
            loading={eager ? "eager" : "lazy"}
            className={`block ${
              frame === "vinylframe" ? "max-h-[86cqw] max-w-[86cqw]" : "max-h-[92cqw] max-w-[88cqw]"
            }`}
          />
        </div>
      ) : (
        <div className="item-media-img" style={style}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={title}
            loading={eager ? "eager" : "lazy"}
            className="block max-h-[86cqw] max-w-[86cqw] object-contain"
          />
        </div>
      )}
    </div>
  );
}
