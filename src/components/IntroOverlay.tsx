"use client";

import { useEffect, useRef, useState } from "react";

const SWAPS = 10;
const SWAP_MS = 200;
const FADE_MS = 560;

/**
 * First-visit intro: a centered square clip-path-reveals while rapidly cycling
 * through the library's artwork, then the whole overlay fades out.
 * Plain CSS transitions — this renders once per session and shouldn't be the
 * reason framer-motion ships with every library page.
 */
export default function IntroOverlay({ images }: { images: string[] }) {
  const [show, setShow] = useState(false);
  const [fading, setFading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // once this mount claims the intro, effect re-runs (StrictMode's dev
  // double-invoke) must re-arm the timers instead of bailing on the
  // sessionStorage guard — otherwise the overlay shows but never dismisses
  const claimed = useRef(false);

  useEffect(() => {
    if (images.length < 3) return;
    if (!claimed.current && sessionStorage.getItem("intro-seen")) return;
    claimed.current = true;
    sessionStorage.setItem("intro-seen", "1");
    // warm the covers we're about to flash — at 200ms/swap a cold-cache cycle
    // would show mostly blank frames otherwise
    for (const src of images.slice(0, SWAPS)) {
      const img = new Image();
      img.src = src;
    }
    setShow(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)));
    let i = 0;
    let fadeTimer: ReturnType<typeof setTimeout>;
    let goneTimer: ReturnType<typeof setTimeout>;
    const cycle = setInterval(() => {
      i += 1;
      if (i >= SWAPS) {
        clearInterval(cycle);
        fadeTimer = setTimeout(() => setFading(true), SWAP_MS);
        goneTimer = setTimeout(() => setShow(false), SWAP_MS + FADE_MS);
        return;
      }
      setIdx(i % images.length);
    }, SWAP_MS);
    return () => {
      clearInterval(cycle);
      clearTimeout(fadeTimer);
      clearTimeout(goneTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-white"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: "min(46vw, 220px)",
          height: "min(46vw, 220px)",
          clipPath: revealed ? "inset(0 0 0 0)" : "inset(100% 0 0 0)",
          transition: "clip-path 280ms cubic-bezier(0.2, 0, 0, 1)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[idx]}
          alt=""
          decoding="async"
          className="max-h-full max-w-full object-contain"
        />
      </div>
    </div>
  );
}
