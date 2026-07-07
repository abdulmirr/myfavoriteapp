"use client";

import { useLayoutEffect, useRef } from "react";
import type { Item } from "@/lib/types";
import Tile from "./Tile";

/**
 * The NS grid: CSS-var driven columns, square tiles, FLIP animation when the
 * order changes (each tile animates from its previous rect to the new one).
 */
export default function Grid({
  items,
  matches,
  hiddenId,
  cols,
  onOpen,
}: {
  items: Item[];
  matches: (item: Item) => boolean;
  hiddenId: string | null;
  cols: number;
  onOpen: (item: Item, rect: DOMRect) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevRects = useRef<Map<string, DOMRect>>(new Map());
  const orderKey = items.map((i) => i.id).join(",");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const tiles = container.querySelectorAll<HTMLElement>("[data-item-id]");
    tiles.forEach((el) => {
      const id = el.dataset.itemId!;
      const now = el.getBoundingClientRect();
      const prev = prevRects.current.get(id);
      if (prev && (prev.left !== now.left || prev.top !== now.top)) {
        el.animate(
          [
            { transform: `translate(${prev.left - now.left}px, ${prev.top - now.top}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: 400, easing: "cubic-bezier(0.2, 0, 0, 1)" }
        );
      }
      prevRects.current.set(id, now);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  return (
    <div className="hover-fx">
      <div
        ref={containerRef}
        className="fav-grid grid"
        style={
          {
            // size slider overrides the responsive default; gap shrinks as
            // density rises so small tiles don't drown in whitespace
            "--grid-cols": cols,
            "--grid-gap": `${Math.max(8, 44 - cols * 2)}px`,
            gridTemplateColumns: "repeat(var(--grid-cols, 6), minmax(0, 1fr))",
            columnGap: "var(--grid-gap, 36px)",
            rowGap: "calc(var(--grid-gap, 36px) * var(--row-ratio, 0.5))",
          } as React.CSSProperties
        }
      >
        {items.map((item, i) => (
          <Tile
            key={item.id}
            item={item}
            dimmed={!matches(item)}
            hidden={hiddenId === item.id}
            // first two rows are above the fold — load them eagerly (LCP)
            eager={i < cols * 2}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
