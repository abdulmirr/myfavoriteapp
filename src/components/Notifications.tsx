"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  approveTaste,
  fetchNotifications,
  fetchReach,
  fetchTasteGiven,
  fetchTasteNotes,
  markAllRead,
  type Notification,
} from "@/lib/social";
import { broadcastUnread } from "@/lib/unread";
import { thumbCover } from "@/lib/img";
import { playUi } from "@/lib/sfx";

/**
 * Notifications, folded into the Friends feed. No panel, no box — each
 * notification is an entry in the same grammar as a friend's visit: avatar,
 * one line of text, the date on the right, and the vertical hairline under
 * the profile picture carrying whatever the event brought (the favorited
 * piece, a taste note, a follow-back button). The Friends tab interleaves
 * these with the activity groups by time.
 *
 * Landing on the Friends tab counts as reading: after a beat of dwell the
 * rows are marked read and the tab's badge clears (broadcast, so the top bar
 * doesn't wait for its next poll). Rows unread on arrival keep their red dot
 * for the visit — "new" should stay visible while you look.
 */
export interface NotificationsState {
  list: Notification[] | null;
  /** ids unread at the moment the tab opened */
  fresh: Set<string>;
  reach: { people: Profile[]; pieces: number } | null;
  tasteNotes: Map<string, string>;
  tasteGiven: Set<string> | null;
  approving: Set<string>;
  approveBack: (actor: Profile) => void;
  markReadNow: () => void;
}

export function useNotifications(viewer: Profile | null): NotificationsState {
  const [list, setList] = useState<Notification[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [reach, setReach] = useState<{ people: Profile[]; pieces: number } | null>(null);
  const [tasteNotes, setTasteNotes] = useState<Map<string, string>>(new Map());
  const [tasteGiven, setTasteGiven] = useState<Set<string> | null>(null);
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const markTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    (async () => {
      const [items, r, notes, given] = await Promise.all([
        fetchNotifications(viewer.id),
        fetchReach(viewer.id),
        fetchTasteNotes(viewer.id),
        fetchTasteGiven(viewer.id),
      ]);
      if (cancelled) return;
      setTasteNotes(notes);
      setTasteGiven(given);
      setList(items);
      setFresh(new Set(items.filter((n) => !n.read_at).map((n) => n.id)));
      setReach(r);
      if (items.some((n) => !n.read_at)) {
        // a beat of dwell means the visit was intentional — bouncing straight
        // off the tab keeps the badge (and the unread rows) for later
        markTimer.current = setTimeout(() => {
          markAllRead(viewer.id).then(() => broadcastUnread(0));
        }, 1500);
      }
    })();
    return () => {
      cancelled = true;
      if (markTimer.current) {
        clearTimeout(markTimer.current);
        markTimer.current = null;
      }
    };
  }, [viewer]);

  // acting on a row is the most deliberate read there is — don't let the
  // dwell timer's cancel-on-unmount treat it like a bounce
  const markReadNow = () => {
    if (!viewer) return;
    if (markTimer.current) {
      clearTimeout(markTimer.current);
      markTimer.current = null;
    }
    markAllRead(viewer.id).then(() => broadcastUnread(0));
  };

  // "Approve back" straight from the row — the reciprocation loop
  const approveBack = async (actor: Profile) => {
    if (!viewer || approving.has(actor.id)) return;
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

  return { list, fresh, reach, tasteNotes, tasteGiven, approving, approveBack, markReadNow };
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

/** one notification, worn exactly like a feed visit */
export function NotificationEntry({
  n,
  state,
  viewerId,
  viewerFollowing,
}: {
  n: Notification;
  state: NotificationsState;
  /** the viewer's profile id (follows/approvals write as them) */
  viewerId: string | null;
  viewerFollowing: Profile[];
}) {
  const actor = n.actor;
  const who = actor?.display_name || (actor ? `@${actor.username}` : "Someone");
  const href = actor ? `/${actor.username}` : "#";
  const note = actor ? state.tasteNotes.get(actor.id) : undefined;
  // follow-back, right in the line — the reciprocation a follow asks for
  const [followedBack, setFollowedBack] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const alreadyFollowing =
    !!actor && (followedBack || viewerFollowing.some((f) => f.id === actor.id));

  const followBack = async () => {
    if (!actor || !viewerId || followBusy) return;
    setFollowBusy(true);
    const { error } = await supabase()
      .from("follows")
      .insert({ follower_id: viewerId, followee_id: actor.id });
    if (!error || error.code === "23505") {
      playUi("confirm");
      setFollowedBack(true);
    }
    setFollowBusy(false);
  };

  const showApproveBack =
    n.type === "taste" && actor && state.tasteGiven && !state.tasteGiven.has(actor.id);
  // what the hairline carries; a bare follow that's already reciprocated has
  // nothing to say below the header
  const hasLine =
    (n.type === "favorited" && n.item) ||
    (n.type === "taste" && (note || showApproveBack)) ||
    (n.type === "follow" && actor && !alreadyFollowing);

  return (
    <section>
      {/* who + what — same band as a visit's header */}
      <div className="flex items-center gap-3">
        <Link
          href={href}
          onClick={state.markReadNow}
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden bg-zinc-100 transition-opacity hover:opacity-80"
        >
          {actor?.avatar_url ? (
            <img
              src={actor.avatar_url}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-xs font-semibold text-zinc-300">{who.slice(0, 1)}</span>
          )}
        </Link>
        <p className="min-w-0 flex-1 truncate text-xs text-zinc-400">
          <Link
            href={href}
            onClick={state.markReadNow}
            className="text-[13px] font-medium text-zinc-900 transition-colors hover:text-zinc-400"
          >
            {who}
          </Link>{" "}
          {n.type === "follow"
            ? "followed you"
            : n.type === "taste"
              ? "approves your taste"
              : "favorited from your library"}
        </p>
        {state.fresh.has(n.id) && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e53935]" />
        )}
        <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
          {shortDate(n.created_at)}
        </span>
      </div>

      {/* the hairline under the profile picture — same line the visits use */}
      {hasLine && (
        <div className="mt-4 border-l border-zinc-100 pl-6 sm:ml-4">
          {n.type === "favorited" && n.item && actor && (
            <Link
              href={`/${actor.username}?item=${n.item.id}`}
              onClick={state.markReadNow}
              className="group/piece flex w-fit items-center gap-3.5"
            >
              {n.item.image_url && (
                <img
                  src={thumbCover(n.item.image_url, 200)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-12 w-12 shrink-0 object-cover shadow-sm"
                />
              )}
              <span className="text-[13px] leading-snug tracking-[-0.01em] text-zinc-900 transition-colors group-hover/piece:text-zinc-400">
                {n.item.title}
              </span>
            </Link>
          )}
          {n.type === "taste" && (
            <div className="flex flex-col gap-2.5">
              {note && (
                <p className="text-xs leading-relaxed text-zinc-500">&ldquo;{note}&rdquo;</p>
              )}
              {showApproveBack && actor && (
                <button
                  onClick={() => state.approveBack(actor)}
                  disabled={state.approving.has(actor.id)}
                  className="w-fit cursor-pointer whitespace-nowrap border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-900 disabled:cursor-wait"
                >
                  Approve back
                </button>
              )}
            </div>
          )}
          {n.type === "follow" && actor && !alreadyFollowing && (
            <button
              onClick={followBack}
              disabled={followBusy}
              className="w-fit cursor-pointer whitespace-nowrap border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-900 disabled:cursor-wait"
            >
              Follow back
            </button>
          )}
        </div>
      )}
    </section>
  );
}
