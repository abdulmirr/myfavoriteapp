"use client";

import { useEffect, useRef } from "react";

/**
 * Lets the landing's covers lean with the mouse: writes the pointer's
 * position (−1…1) to --mx / --my on this element, once a frame at most;
 * each cover moves by its own depth (.landing-depth). Mouse only — touch
 * screens and reduced motion leave everything still. Decoration, so hidden
 * from screen readers.
 */
export default function Drift({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      el.style.setProperty("--mx", x.toFixed(3));
      el.style.setProperty("--my", y.toFixed(3));
    };
    const move = (e: PointerEvent) => {
      x = (e.clientX / innerWidth - 0.5) * 2;
      y = (e.clientY / innerHeight - 0.5) * 2;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const rest = () => {
      x = 0;
      y = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", rest);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", rest);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div ref={ref} aria-hidden className={className}>
      {children}
    </div>
  );
}
