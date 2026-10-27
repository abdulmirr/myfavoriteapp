"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "./ui/styles";

const REDUCED = "(prefers-reduced-motion: reduce)";
function onReducedChange(cb: () => void) {
  const mq = matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** antislop's typing effect: one character per tick once `start` is true. */
export function useTypewriter(text: string, start: boolean, speed = 45) {
  const reduced = useSyncExternalStore(onReducedChange, () => matchMedia(REDUCED).matches, () => false);
  // how much of which text is showing; a new text starts over from nothing
  const [shown, setShown] = useState({ text, n: 0 });
  if (shown.text !== text) setShown({ text, n: 0 });
  useEffect(() => {
    if (!start || !text || reduced) return;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setShown({ text, n: i });
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, start, speed, reduced]);
  if (start && reduced) return { typed: text, done: !!text };
  const n = shown.text === text ? shown.n : 0;
  return { typed: text.slice(0, n), done: !!text && n >= text.length };
}

/**
 * A typed page title. The full text is always in the accessible name; on
 * phones the font steps down until it fits one line (antislop does the same).
 */
export function TypedTitle({
  text,
  start = true,
  speed = 75,
  caret = false,
  className,
  onDone,
}: {
  text: string;
  start?: boolean;
  speed?: number;
  /** blinking caret while typing */
  caret?: boolean;
  className?: string;
  onDone?: () => void;
}) {
  const { typed, done } = useTypewriter(text, start, speed);
  const ref = useRef<HTMLHeadingElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (done && !fired.current) {
      fired.current = true;
      onDone?.();
    }
  }, [done, onDone]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      if (!matchMedia("(max-width: 639px)").matches) return;
      let size = 32;
      el.style.fontSize = `${size}px`;
      // measure against the full text so the size doesn't jitter while typing
      const probe = el.cloneNode(true) as HTMLElement;
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.width = `${el.clientWidth}px`;
      probe.textContent = text;
      el.parentElement?.appendChild(probe);
      while (probe.scrollWidth > probe.clientWidth && size > 18) {
        size -= 1;
        probe.style.fontSize = `${size}px`;
      }
      probe.remove();
      el.style.fontSize = `${size}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [text]);

  return (
    <h1 ref={ref} aria-label={text} className={cn("whitespace-nowrap sm:whitespace-normal", className)}>
      <span aria-hidden>{typed}</span>
      {caret && !done && (
        <span aria-hidden className="animate-caret font-normal text-gray-400 dark:text-neutral-500">
          |
        </span>
      )}
    </h1>
  );
}

/** A typed subtitle that waits for the title to finish. */
export function TypedLine({
  text,
  start,
  speed = 55,
  className,
}: {
  text: string;
  start: boolean;
  speed?: number;
  className?: string;
}) {
  const { typed } = useTypewriter(text, start, speed);
  return (
    <p aria-label={text} className={className}>
      <span aria-hidden>{typed}</span>
    </p>
  );
}
