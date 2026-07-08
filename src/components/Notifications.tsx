"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import {
  fetchNotifications,
  fetchReach,
  markAllRead,
  unreadCount,
  type Notification,
} from "@/lib/social";

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

/**
 * The bell: unread badge polled every 60s (tab-visible only — no realtime,
 * no push), opening a quiet dropdown of follows and favorited-from-you events.
 */
export default function Notifications({
  viewer,
  align = "right",
  label,
}: {
  viewer: Profile;
  /** which edge the dropdown hangs from — "left" for the library sidebar */
  align?: "left" | "right";
  /** optional text beside the bell — the nav rail renders it as a labelled row */
  label?: string;
}) {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Notification[] | null>(null);
  const [reach, setReach] = useState<{ people: Profile[]; pieces: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    unreadCount(viewer.id).then(setUnread);
  }, [viewer.id]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 60_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [poll]);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setList(null);
    const [items, r] = await Promise.all([fetchNotifications(viewer.id), fetchReach(viewer.id)]);
    setList(items);
    setReach(r);
    if (items.some((n) => !n.read_at)) {
      markAllRead(viewer.id).then(() => setUnread(0));
    } else {
      setUnread(0);
    }
  };

  // click-away closes
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={toggle}
        className={`cursor-pointer transition-colors ${
          label ? "flex w-full items-center gap-3" : "relative flex h-7 w-7 items-center justify-center"
        } ${open ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-900"}`}
      >
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M8 2a4 4 0 0 0-4 4v2.5L2.5 11v.5h11V11L12 8.5V6a4 4 0 0 0-4-4z" />
            <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
          </svg>
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-zinc-900" />
          )}
        </span>
        {label && <span className="text-[13px]">{label}</span>}
      </button>

      {open && (
        <div
          className={`save-appear absolute top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] border border-zinc-200 bg-white shadow-2xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {reach !== null && reach.pieces > 0 && (
            <p className="border-b border-zinc-100 px-4 py-2.5 text-[11px] leading-relaxed text-zinc-400">
              You put on{" "}
              {reach.people.slice(0, 2).map((p, i) => (
                <span key={p.id}>
                  {i > 0 && (reach.people.length > 2 ? ", " : " and ")}
                  <Link
                    href={`/${p.username}`}
                    onClick={() => setOpen(false)}
                    className="text-zinc-900 transition-colors hover:text-zinc-400"
                  >
                    {p.display_name || `@${p.username}`}
                  </Link>
                </span>
              ))}
              {reach.people.length > 2 &&
                `, and ${reach.people.length - 2} other${reach.people.length === 3 ? "" : "s"}`}{" "}
              on {reach.pieces} piece{reach.pieces === 1 ? "" : "s"}.
            </p>
          )}
          {list === null ? (
            <p className="px-4 py-6 text-xs text-zinc-400">Loading…</p>
          ) : list.length === 0 ? (
            <p className="px-4 py-6 text-xs text-zinc-400">
              Nothing yet — share your page to be found.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {list.map((n) => {
                const who = n.actor?.display_name || (n.actor ? `@${n.actor.username}` : "Someone");
                return (
                  <li key={n.id} className="border-b border-zinc-50 last:border-0">
                    <Link
                      href={
                        n.type === "favorited" && n.item && n.actor
                          ? `/${n.actor.username}?item=${n.item.id}`
                          : n.actor
                            ? `/${n.actor.username}`
                            : "#"
                      }
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-zinc-50"
                    >
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden bg-zinc-100">
                        {n.actor?.avatar_url ? (
                          <img src={n.actor.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-semibold text-zinc-300">
                            {who.slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <p className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-500">
                        <span className="text-zinc-900">{who}</span>{" "}
                        {n.type === "follow" ? (
                          "followed you"
                        ) : (
                          <>
                            favorited{" "}
                            <span className="text-zinc-900">{n.item?.title ?? "something"}</span>{" "}
                            from your library
                          </>
                        )}
                      </p>
                      <span className="shrink-0 pt-0.5 text-[10px] text-zinc-400">
                        {timeAgo(n.created_at)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
