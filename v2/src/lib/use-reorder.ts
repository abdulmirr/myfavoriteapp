"use client";

import { useEffect, useRef, useState } from "react";

type Geometry = {
  id: string;
  from: number;
  /** row centers in page coordinates, measured once at pickup */
  mids: number[];
  /** the dragged row's slot (its height plus the gap to the next row) */
  slot: number;
  startY: number;
  lastClientY: number;
  /** the drop slot so far (state can lag a pointer event behind) */
  to: number;
};

export type DragState = { id: string; from: number; to: number; dy: number; slot: number };

/**
 * Drag-to-reorder for a vertical list, by pointer (mouse, pen, touch) on a
 * handle, plus ArrowUp/ArrowDown on the focused handle. Rows stay in the DOM
 * where they are while dragging; `offset(i)` gives each one its transform, so
 * the dragged row follows the pointer and the others slide aside. The page
 * scrolls itself near the top and bottom edges. `onMove(id, to)` fires once
 * on drop — order in the caller's state is the only thing that changes.
 */
export function useReorder(ids: string[], onMove: (id: string, to: number) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const geo = useRef<Geometry | null>(null);
  const raf = useRef<number | null>(null);

  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  };

  // where the pointer is now, in page coordinates → the drop slot
  const track = (clientY: number) => {
    const g = geo.current;
    if (!g) return;
    g.lastClientY = clientY;
    const dy = clientY + window.scrollY - g.startY;
    const center = g.mids[g.from] + dy;
    let to = 0;
    g.mids.forEach((m, i) => {
      if (i !== g.from && m < center) to++;
    });
    g.to = to;
    setDrag((d) => (d ? { ...d, dy, to } : d));
  };

  // near the viewport's edges, keep scrolling while the pointer rests there
  const autoScroll = () => {
    const g = geo.current;
    if (!g) return;
    const edge = 72;
    const y = g.lastClientY;
    const speed = y < edge ? -Math.ceil((edge - y) / 6) : y > window.innerHeight - edge ? Math.ceil((y - (window.innerHeight - edge)) / 6) : 0;
    if (speed) {
      window.scrollBy(0, speed);
      track(y);
    }
    raf.current = requestAnimationFrame(autoScroll);
  };

  const stop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    geo.current = null;
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("-webkit-user-select");
  };

  useEffect(() => stop, []);

  const handleProps = (id: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || geo.current) return;
      const from = ids.indexOf(id);
      if (from < 0) return;
      e.preventDefault();
      const rects = ids.map((x) => els.current.get(x)?.getBoundingClientRect());
      if (rects.some((r) => !r)) return;
      const rs = rects as DOMRect[];
      const mids = rs.map((r) => r.top + window.scrollY + r.height / 2);
      const next = rs[from + 1];
      const slot = next ? next.top - rs[from].top : rs[from].height;
      e.currentTarget.setPointerCapture(e.pointerId);
      geo.current = { id, from, mids, slot, startY: e.clientY + window.scrollY, lastClientY: e.clientY, to: from };
      document.body.style.setProperty("user-select", "none");
      document.body.style.setProperty("-webkit-user-select", "none");
      setDrag({ id, from, to: from, dy: 0, slot });
      raf.current = requestAnimationFrame(autoScroll);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (geo.current) track(e.clientY);
    },
    onPointerUp: () => {
      const g = geo.current;
      stop();
      setDrag(null);
      if (g && g.to !== g.from) onMove(g.id, g.to);
    },
    onPointerCancel: () => {
      stop();
      setDrag(null);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      const i = ids.indexOf(id);
      if (e.key === "ArrowUp" && i > 0) {
        e.preventDefault();
        onMove(id, i - 1);
      } else if (e.key === "ArrowDown" && i >= 0 && i < ids.length - 1) {
        e.preventDefault();
        onMove(id, i + 1);
      }
    },
    style: { touchAction: "none" as const },
  });

  /** The transform for row i while a drag is on. */
  const offset = (i: number): number => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -drag.slot;
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return drag.slot;
    return 0;
  };

  return { drag, register, handleProps, offset };
}
