"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Item } from "@/lib/types";
import { sr } from "@/lib/rand";
import { playSfx } from "@/lib/sfx";
import { TileMedia } from "./Tile";

// panning/dragging updates state every frame — memo keeps the N image
// subtrees from re-rendering when only the wrapper transforms change
const StaticTileMedia = memo(TileMedia);

// world-space canvas the items live on — big enough to spread out a large
// library; panning is clamped to its edges
const WORLD_W = 6000;
const WORLD_H = 6000;
// items initially scatter in a sunflower spiral around the world center:
// density stays even and new items land on the rim, so the cluster grows
// outward in every direction instead of marching down the page
const GOLDEN_ANGLE = 2.39996; // radians — keeps neighbors from aligning
const SEED_SPACING = 165; // radial constant — ~290px between neighbors

/** Soft thud on drop (tiny synth, no asset). */
function playDrop() {
  try {
    const ctx = new AudioContext();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.22);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
    osc.onended = () => ctx.close();
  } catch {}
}

interface Pos {
  x: number; // world px
  y: number; // world px
  rot: number;
}

/**
 * Freeform view: an infinite pannable world (drag the background to wander,
 * drag an item to move it). Anyone can drag; only the owner's moves persist.
 * 8px movement threshold separates click-to-open from drag.
 */
export default function Freeform({
  items,
  matches,
  hiddenId,
  tileW,
  onOpen,
  onMove,
}: {
  items: Item[];
  matches: (item: Item) => boolean;
  hiddenId: string | null;
  tileW: number;
  onOpen: (item: Item, rect: DOMRect) => void;
  onMove: (id: string, pos: { pos_x: number; pos_y: number; pos_rot: number }) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Map<string, Pos>>(new Map());
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const dragData = useRef<{ grabX: number; grabY: number; startX: number; startY: number } | null>(null);
  const panData = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const didMove = useRef(false);

  // start the viewport centered on the world
  useEffect(() => {
    if (offset !== null || !viewportRef.current) return;
    const vp = viewportRef.current.getBoundingClientRect();
    setOffset({ x: (WORLD_W - vp.width) / 2, y: (WORLD_H - vp.height) / 2 });
  }, [offset]);

  const clampOffset = useCallback((x: number, y: number) => {
    const vp = viewportRef.current?.getBoundingClientRect();
    const w = vp?.width ?? 1200;
    const h = vp?.height ?? 800;
    return {
      x: Math.min(Math.max(x, 0), WORLD_W - w),
      y: Math.min(Math.max(y, 0), WORLD_H - h),
    };
  }, []);

  // Two-finger trackpad scroll pans the world, Figma-style — no need to grab
  // and drag the background. A native non-passive listener (React's onWheel is
  // passive, so it can't preventDefault) keeps the wheel from scrolling the
  // page behind the canvas. Re-attaches once the viewport is measured, since
  // that swaps in a different div. deltaMode 1 = lines (mouse wheel) → px.
  const ready = offset !== null;
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !ready) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const mult = e.deltaMode === 1 ? 16 : 1;
      setOffset((prev) =>
        prev ? clampOffset(prev.x + e.deltaX * mult, prev.y + e.deltaY * mult) : prev
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ready, clampOffset]);

  // seed positions: stored values (world px), else scatter around world center
  useEffect(() => {
    setPositions((prev) => {
      const next = new Map(prev);
      items.forEach((item, i) => {
        if (next.has(item.id)) return;
        if (item.pos_x != null && item.pos_y != null) {
          next.set(item.id, { x: item.pos_x, y: item.pos_y, rot: item.pos_rot ?? 0 });
        } else {
          const r = SEED_SPACING * Math.sqrt(i + 0.5);
          const a = i * GOLDEN_ANGLE;
          const x = WORLD_W / 2 + r * Math.cos(a) + (sr(i * 3 + 1) - 0.5) * 60;
          const y = WORLD_H / 2 + r * Math.sin(a) + (sr(i * 7 + 2) - 0.5) * 70;
          const rot = (sr(i * 11 + 3) - 0.5) * 10;
          next.set(item.id, { x, y, rot });
        }
      });
      return next;
    });
  }, [items]);

  /* — item dragging — */

  const onItemDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, id: string) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = positions.get(id);
      if (!p) return;
      dragData.current = {
        grabX: e.clientX - p.x,
        grabY: e.clientY - p.y,
        startX: e.clientX,
        startY: e.clientY,
      };
      didMove.current = false;
      setDragging(id);
    },
    [positions]
  );

  const onItemMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, id: string) => {
      if (dragging !== id || !dragData.current) return;
      const dx = e.clientX - dragData.current.startX;
      const dy = e.clientY - dragData.current.startY;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) didMove.current = true;
      const x = e.clientX - dragData.current.grabX;
      const y = e.clientY - dragData.current.grabY;
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(id, {
          ...next.get(id)!,
          x: Math.min(Math.max(x, 0), WORLD_W - tileW),
          y: Math.min(Math.max(y, 0), WORLD_H - tileW),
        });
        return next;
      });
    },
    [dragging, tileW]
  );

  const onItemUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, item: Item) => {
      if (dragging === item.id) {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(null);
        dragData.current = null;
        if (didMove.current) {
          playDrop();
          const p = positions.get(item.id);
          if (p) onMove(item.id, { pos_x: p.x, pos_y: p.y, pos_rot: p.rot });
          didMove.current = false;
          return;
        }
      }
      const media = e.currentTarget.querySelector(".item-media");
      if (media) {
        playSfx(item.media_type);
        onOpen(item, media.getBoundingClientRect());
      }
    },
    [dragging, positions, onMove, onOpen]
  );

  /* — background panning — */

  const onPanDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!offset) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      panData.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
      setPanning(true);
    },
    [offset]
  );

  const onPanMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!panning || !panData.current) return;
      setOffset(
        clampOffset(
          panData.current.origX - (e.clientX - panData.current.startX),
          panData.current.origY - (e.clientY - panData.current.startY)
        )
      );
    },
    [panning, clampOffset]
  );

  const onPanUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    panData.current = null;
    setPanning(false);
  }, []);

  if (offset === null) {
    return <div ref={viewportRef} className="h-full w-full" />;
  }

  return (
    <div
      ref={viewportRef}
      onPointerDown={onPanDown}
      onPointerMove={onPanMove}
      onPointerUp={onPanUp}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{ cursor: panning ? "grabbing" : "default" }}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          width: WORLD_W,
          height: WORLD_H,
          transform: `translate(${-offset.x}px, ${-offset.y}px)`,
        }}
      >
        {items.map((item) => {
          const p = positions.get(item.id);
          if (!p) return null;
          const isDragging = dragging === item.id;
          return (
            <div
              key={item.id}
              data-item-id={item.id}
              onPointerDown={(e) => onItemDown(e, item.id)}
              onPointerMove={(e) => onItemMove(e, item.id)}
              onPointerUp={(e) => onItemUp(e, item)}
              className={`absolute ${matches(item) ? "opacity-100" : "opacity-25"}`}
              style={{
                left: p.x,
                top: p.y,
                width: tileW,
                zIndex: isDragging ? 999 : 1,
                transform: `rotate(${p.rot}deg) scale(${isDragging ? 1.08 : 1})`,
                transition: isDragging
                  ? "transform 0.05s"
                  : "transform 0.25s ease, opacity 0.3s",
                filter: isDragging ? "drop-shadow(0 20px 40px rgba(0,0,0,0.35))" : "none",
                cursor: isDragging ? "grabbing" : "grab",
                touchAction: "none",
                visibility: hiddenId === item.id ? "hidden" : undefined,
              }}
            >
              <StaticTileMedia item={item} tilted={false} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
