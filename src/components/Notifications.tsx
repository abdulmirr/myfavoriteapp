"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import {
  approveTaste,
  fetchNotifications,
  fetchReach,
  fetchTasteGiven,
  fetchTasteNotes,
  markAllRead,
  unreadCount,
  type Notification,
} from "@/lib/social";
import { playUi } from "@/lib/sfx";

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
}: {
  viewer: Profile;
  /** which edge the dropdown hangs from */
  align?: "left" | "right";
}) {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Notification[] | null>(null);
  // ids that were unread at the moment the panel opened — markAllRead clears
  // the server state immediately, but these rows should still read as new
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [reach, setReach] = useState<{ people: Profile[]; pieces: number } | null>(null);
  // taste extras: notes attached to approvals received (by giver id), who the
  // viewer already approved (hides "Approve back"), and in-flight row sends
  const [tasteNotes, setTasteNotes] = useState<Map<string, string>>(new Map());
  const [tasteGiven, setTasteGiven] = useState<Set<string> | null>(null);
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  // pending mark-as-read — armed on open, cancelled if the panel closes first
  const markTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // mirrors `open` for the async open-fetch: closing while it's in flight
  // must not arm the dwell timer afterwards
  const openRef = useRef(false);

  // acting on a row is the most deliberate read there is — don't let the
  // dwell timer's cancel-on-close treat it like an accidental open
  const markReadNow = () => {
    if (markTimer.current) {
      clearTimeout(markTimer.current);
      markTimer.current = null;
    }
    markAllRead(viewer.id).then(() => setUnread(0));
  };

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
      openRef.current = false;
      setOpen(false);
      return;
    }
    openRef.current = true;
    setOpen(true);
    setList(null);
    const [items, r, notes, given] = await Promise.all([
      fetchNotifications(viewer.id),
      fetchReach(viewer.id),
      fetchTasteNotes(viewer.id),
      fetchTasteGiven(viewer.id),
    ]);
    setTasteNotes(notes);
    setTasteGiven(given);
    setList(items);
    setFresh(new Set(items.filter((n) => !n.read_at).map((n) => n.id)));
    setReach(r);
    // the fetch may resolve after the panel was already closed — arming the
    // timer then would mark rows the user never saw
    if (!openRef.current) return;
    if (items.some((n) => !n.read_at)) {
      // a beat of dwell means the glance was intentional — an accidental open
      // that closes right away keeps the badge (and the unread rows) for later
      if (markTimer.current) clearTimeout(markTimer.current);
      markTimer.current = setTimeout(() => {
        markAllRead(viewer.id).then(() => setUnread(0));
      }, 1500);
    } else {
      setUnread(0);
    }
  };

  // closing before the dwell elapses cancels the pending mark-as-read
  useEffect(() => {
    openRef.current = open;
    if (open) return;
    if (markTimer.current) {
      clearTimeout(markTimer.current);
      markTimer.current = null;
    }
  }, [open]);

  // "Approve back" straight from the row — the reciprocation loop
  const approveBack = async (actor: Profile) => {
    if (approving.has(actor.id)) return;
    setApproving((s) => new Set(s).add(actor.id));
    try {
      await approveTaste(viewer.id, actor.id);
      playUi("confirm");
      setTasteGiven((s) => new Set(s ?? []).add(actor.id));
    } catch (e) {
      console.error("approve back failed:", e instanceof Error ? e.message : e);
    } finally {
      setApproving((s) => {
        const next = new Set(s);
        next.delete(actor.id);
        return next;
      });
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
        className={`relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition hover:bg-zinc-900/[0.05] active:scale-95 ${
          open || unread > 0 ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-900"
        }`}
      >
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M8 2a4 4 0 0 0-4 4v2.5L2.5 11v.5h11V11L12 8.5V6a4 4 0 0 0-4-4z" />
            <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
          </svg>
          {unread > 0 && (
            <span className="notif-badge save-appear absolute -right-1 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[#e53935] px-1 text-[9px] font-medium leading-none text-white tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div
          className={`save-appear fixed inset-x-4 top-16 z-40 overflow-hidden rounded-xl border border-zinc-900/[0.06] bg-white/90 shadow-2xl backdrop-blur-xl sm:absolute sm:inset-x-auto sm:top-full sm:mt-2 sm:w-[22rem] sm:max-w-[calc(100vw-2rem)] ${
            align === "right" ? "sm:right-0" : "sm:left-0"
          }`}
        >
          <div className="flex items-baseline justify-between border-b border-zinc-100 px-4 py-2.5">
            <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">
              Notifications
            </span>
            {fresh.size > 0 && list !== null && (
              <span className="text-[10px] text-[#e53935]">
                {fresh.size} new
              </span>
            )}
          </div>

          {list === null ? (
            <ul>
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex animate-pulse items-center gap-3 px-4 py-3">
                  <div className="h-8 w-8 shrink-0 bg-zinc-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2 w-3/5 bg-zinc-100" />
                    <div className="h-2 w-2/5 bg-zinc-100" />
                  </div>
                </li>
              ))}
            </ul>
          ) : list.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-xs text-zinc-500">Nothing yet.</p>
              <p className="mt-1 text-[11px] text-zinc-400">Share your page to be found.</p>
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {list.map((n, i) => {
                const who = n.actor?.display_name || (n.actor ? `@${n.actor.username}` : "Someone");
                return (
                  <li
                    key={n.id}
                    className="notif-in border-b border-zinc-100 last:border-0"
                    style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
                  >
                    <Link
                      href={
                        n.type === "favorited" && n.item && n.actor
                          ? `/${n.actor.username}?item=${n.item.id}`
                          : n.actor
                            ? `/${n.actor.username}`
                            : "#"
                      }
                      onClick={() => {
                        markReadNow();
                        setOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100">
                        {n.actor?.avatar_url ? (
                          <img src={n.actor.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[11px] font-semibold text-zinc-400">
                            {who.slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <p className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-500">
                        <span className="text-zinc-900">{who}</span>{" "}
                        {n.type === "follow" ? (
                          "followed you"
                        ) : n.type === "taste" ? (
                          "approves your taste"
                        ) : (
                          <>
                            favorited{" "}
                            <span className="text-zinc-900">{n.item?.title ?? "something"}</span>
                          </>
                        )}
                        <span className="font-mono text-[10px] text-zinc-400">
                          {" · "}
                          {timeAgo(n.created_at)}
                        </span>
                        {n.type === "taste" && n.actor && tasteNotes.get(n.actor.id) && (
                          <span className="mt-0.5 block text-zinc-400">
                            &ldquo;{tasteNotes.get(n.actor.id)}&rdquo;
                          </span>
                        )}
                      </p>
                      {n.type === "taste" &&
                        n.actor &&
                        tasteGiven &&
                        !tasteGiven.has(n.actor.id) && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              approveBack(n.actor!);
                            }}
                            disabled={approving.has(n.actor.id)}
                            className="shrink-0 cursor-pointer whitespace-nowrap rounded-md border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-900 active:scale-95 disabled:cursor-wait"
                          >
                            Approve back
                          </button>
                        )}
                      {fresh.has(n.id) && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e53935]" />
                      )}
                      {n.type === "favorited" && n.item?.image_url && (
                        <img
                          src={n.item.image_url}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-md object-cover shadow-sm"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {reach !== null && reach.pieces > 0 && (
            <p className="border-t border-zinc-100 bg-zinc-50 px-4 py-2.5 text-[11px] leading-relaxed text-zinc-400">
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
        </div>
      )}
    </div>
  );
}
