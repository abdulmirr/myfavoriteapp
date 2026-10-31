"use client";

import { useEffect, useRef } from "react";

/** how quickly the scene follows the mouse: a spring that settles in about a second */
const STIFF = 6;

/**
 * Lets the landing's covers lean with the mouse: writes where the scene
 * leans (−1…1) to --mx / --my on this element, and each cover moves by its
 * own depth (.landing-depth). The lean follows the pointer on a critically
 * damped spring, frame by frame: it starts gently, keeps its speed when the
 * pointer keeps moving, and never overshoots — so a mouse that enters the
 * window, leaves it, or darts across glides the scene instead of jolting it.
 * Mouse only — touch screens and reduced motion leave everything still.
 * Decoration, so hidden from screen readers.
 */
export default function Drift({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // where the scene leans now, how fast it's moving, and where the pointer wants it
    const at = { x: 0, y: 0 };
    const speed = { x: 0, y: 0 };
    const goal = { x: 0, y: 0 };
    let frame = 0;
    let last = 0;
    const step = (now: number) => {
      const dt = last ? Math.min(Math.max((now - last) / 1000, 0), 1 / 30) : 1 / 60;
      last = now;
      for (const k of ["x", "y"] as const) {
        speed[k] += (STIFF * STIFF * (goal[k] - at[k]) - 2 * STIFF * speed[k]) * dt;
        at[k] += speed[k] * dt;
      }
      el.style.setProperty("--mx", at.x.toFixed(4));
      el.style.setProperty("--my", at.y.toFixed(4));
      const still =
        Math.abs(goal.x - at.x) + Math.abs(goal.y - at.y) < 1e-3 && Math.abs(speed.x) + Math.abs(speed.y) < 1e-3;
      frame = still ? 0 : requestAnimationFrame(step);
      if (still) last = 0;
    };
    const aim = (x: number, y: number) => {
      goal.x = x;
      goal.y = y;
      if (!frame) frame = requestAnimationFrame(step);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "mouse") aim((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
    };
    // the pointer left the window: settle back to the middle
    const out = (e: MouseEvent) => {
      if (!e.relatedTarget) aim(0, 0);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("mouseout", out);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("mouseout", out);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div ref={ref} aria-hidden className={className}>
      {children}
    </div>
  );
}
