"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@/lib/types";
import Tile from "./Tile";

/**
 * The NS grid: CSS-var driven columns, square tiles, FLIP animation when the
 * order changes (each tile animates from its previous rect to the new one).
 *
 * With `onReorderCommit` set (owner, "my order", nothing filtered), tiles are
 * draggable: pick one up and the wall live-reshuffles under the pointer —
 * the same FLIP animation carries the shuffle, so drag needs no ghost layer.
 * Order is committed once, on release.
 */
export default function Grid({
  items,
  matches,
  hiddenId,
  cols,
  onOpen,
  onReorderCommit,
}: {
  items: Item[];
  matches: (item: Item) => boolean;
  hiddenId: string | null;
  cols: number;
  onOpen: (item: Item, rect: DOMRect) => void;
  /** present = drag-to-reorder enabled; receives the full new id order */
  onReorderCommit?: (ids: string[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevRects = useRef<Map<string, DOMRect>>(new Map());

  // during a drag the grid renders its own order; null = mirror props.
  // orderRef mirrors it as the mutable working copy so pointer handlers never
  // need side effects inside React state updaters (updaters must stay pure).
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const orderRef = useRef<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    active: boolean;
    /** grid slot centers — FLIP animates the tiles, but the slots never move,
        so hit-testing against them is animation-proof. Re-snapshotted on
        scroll: they're viewport coordinates, and mid-drag scrolling moves
        every slot. */
    slots: { x: number; y: number }[];
    /** distance between adjacent slot centers — beyond ~one pitch of any slot
        the pointer is off the wall and the drag parks instead of reshuffling */
    pitch: number;
  } | null>(null);
  // a completed drag must swallow the click that follows pointerup
  const suppressClick = useRef(false);

  const ordered = useMemo(() => {
    if (!dragOrder) return items;
    const byId = new Map(items.map((i) => [i.id, i]));
    return dragOrder.map((id) => byId.get(id)).filter((i): i is Item => !!i);
  }, [items, dragOrder]);

  const orderKey = ordered.map((i) => i.id).join(",");

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

  // ── drag-to-reorder (pointer-based; only wired when the callback exists) ──
  useEffect(() => {
    if (!onReorderCommit) return;
    const container = containerRef.current;
    if (!container) return;

    const snapshotSlots = () => {
      // slot k = the k-th grid cell; whichever item currently occupies it,
      // its rect IS the cell's rect, so re-snapshotting mid-drag is safe
      const slots = [...container.querySelectorAll<HTMLElement>("[data-item-id]")].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      const pitch =
        slots.length > 1
          ? Math.hypot(slots[1].x - slots[0].x, slots[1].y - slots[0].y)
          : Number.MAX_SAFE_INTEGER;
      return { slots, pitch };
    };

    const onDown = (e: PointerEvent) => {
      // primary button, and never during a pinch/scroll gesture on touch
      if (e.button !== 0 || e.pointerType === "touch") return;
      const tile = (e.target as HTMLElement).closest<HTMLElement>("[data-item-id]");
      if (!tile) return;
      drag.current = {
        id: tile.dataset.itemId!,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        ...snapshotSlots(),
      };
    };

    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 8) return;
        d.active = true;
        orderRef.current = items.map((i) => i.id);
        setDraggingId(d.id);
        setDragOrder(orderRef.current);
        document.body.style.cursor = "grabbing";
      }
      e.preventDefault();
      const order = orderRef.current;
      if (!order) return;
      let to = -1;
      let best = Infinity;
      for (let i = 0; i < d.slots.length; i++) {
        const dist = Math.hypot(e.clientX - d.slots[i].x, e.clientY - d.slots[i].y);
        if (dist < best) {
          best = dist;
          to = i;
        }
      }
      // beyond a slot's own neighborhood the pointer has left the wall —
      // park (keep the current order) instead of snapping to the nearest edge
      if (to < 0 || best > d.pitch * 1.1) return;
      const from = order.indexOf(d.id);
      if (from < 0 || from === to) return;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, d.id);
      orderRef.current = next;
      setDragOrder(next);
    };

    // mid-drag scrolling moves every slot's viewport position — re-measure
    const onScroll = () => {
      const d = drag.current;
      if (!d?.active) return;
      Object.assign(d, snapshotSlots());
    };

    const endDrag = (commit: boolean) => {
      const d = drag.current;
      drag.current = null;
      document.body.style.cursor = "";
      if (!d?.active) return;
      // the drag's own click (if the browser fires one — it may not, when
      // down/up hit different tiles) dispatches before timers run; anything
      // after the next tick is a fresh, legitimate click
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      setDraggingId(null);
      if (commit && orderRef.current) {
        // committed from the event handler, never from a state updater —
        // dragOrder keeps rendering this order until props catch up
        onReorderCommit(orderRef.current);
      } else if (!commit) {
        orderRef.current = null;
        setDragOrder(null);
      }
    };

    const onUp = () => endDrag(true);
    // browser took the pointer stream away (native drag, alt-tab, touch takeover)
    const onCancel = () => endDrag(false);
    // image/native drag would swallow pointer events mid-gesture (Firefox)
    const onDragStart = (e: Event) => {
      if (drag.current) e.preventDefault();
    };

    container.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    container.addEventListener("dragstart", onDragStart);
    return () => {
      container.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("scroll", onScroll, { capture: true });
      container.removeEventListener("dragstart", onDragStart);
    };
  }, [onReorderCommit, items]);

  // hand rendering back to props once they deliver the committed order — or
  // immediately if the item SET changed (add/delete), where holding a stale
  // order would silently hide the new item
  useEffect(() => {
    if (!dragOrder || draggingId) return;
    const propsIds = items.map((i) => i.id);
    const caughtUp = propsIds.join(",") === dragOrder.join(",");
    const sameSet =
      propsIds.length === dragOrder.length &&
      new Set([...propsIds, ...dragOrder]).size === propsIds.length;
    if (!caughtUp && sameSet) return; // props still catching up — keep waiting
    let stale = false;
    queueMicrotask(() => {
      if (!stale) {
        orderRef.current = null;
        setDragOrder(null);
      }
    });
    return () => {
      stale = true;
    };
  }, [items, dragOrder, draggingId]);

  return (
    <div className="hover-fx">
      <div
        ref={containerRef}
        className="fav-grid grid"
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
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
        {ordered.map((item, i) => (
          <Tile
            key={item.id}
            item={item}
            dimmed={!matches(item)}
            hidden={hiddenId === item.id}
            lifted={draggingId === item.id}
            // first two rows are above the fold — load them eagerly (LCP)
            eager={i < cols * 2}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
