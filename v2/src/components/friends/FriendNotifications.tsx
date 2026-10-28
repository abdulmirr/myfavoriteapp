"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  approveTaste,
  fetchNotifications,
  fetchReach,
  fetchTasteGiven,
  fetchTasteNotes,
  markAllRead,
  type Notification,
} from "@/lib/social";
import { follow, setUnread, useViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";
import { thumbCover } from "@/lib/img";
import { timeAgo } from "@/lib/work";
import { playUi } from "@/lib/sfx";
import Avatar from "../ui/Avatar";

export type NotificationsData = {
  list: Notification[] | null;
  fresh: Set<string>;
  reach: { people: Profile[]; pieces: number } | null;
  notes: Map<string, string>;
  given: Set<string>;
  busy: Set<string>;
  approveBack: (actor: Profile) => void;
  followBack: (actor: Profile) => void;
};

/**
 * Everything the bell used to load — follows, "favorited from your wall",
 * taste approvals, and your reach — fetched once for the Friends timeline.
 * Staying a beat marks it all read (bouncing straight off keeps the badge);
 * the red dots stay on what was new for the rest of the visit.
 */
export function useNotifications(): NotificationsData {
  const me = useViewer().profile;
  const meId = me?.id ?? null;
  const [list, setList] = useState<Notification[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [reach, setReach] = useState<{ people: Profile[]; pieces: number } | null>(null);
  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const [given, setGiven] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!meId) return;
    let stale = false;
    (async () => {
      const [items, r, n, g] = await Promise.all([
        fetchNotifications(meId),
        fetchReach(meId),
        fetchTasteNotes(meId),
        fetchTasteGiven(meId),
      ]);
      if (stale) return;
      setList(items);
      setFresh(new Set(items.filter((x) => !x.read_at).map((x) => x.id)));
      setReach(r);
      setNotes(n);
      setGiven(g);
      if (items.some((x) => !x.read_at)) {
        dwell.current = setTimeout(() => void markAllRead(meId).then(() => setUnread(0)), 1500);
      }
    })();
    return () => {
      stale = true;
      if (dwell.current) clearTimeout(dwell.current);
      dwell.current = null;
    };
  }, [meId]);

  const withBusy = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusy((s) => new Set(s).add(id));
    try {
      await fn();
      playUi("confirm");
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }, []);

  return {
    list,
    fresh,
    reach,
    notes,
    given,
    busy,
    approveBack: (actor) => {
      if (!meId || busy.has(actor.id)) return;
      void withBusy(actor.id, async () => {
        await approveTaste(meId, actor.id);
        setGiven((s) => new Set(s).add(actor.id));
      });
    },
    followBack: (actor) => {
      if (busy.has(actor.id)) return;
      void withBusy(actor.id, () => follow(actor));
    },
  };
}

const smallButton =
  "inline-flex h-7 w-fit cursor-pointer items-center rounded-full border border-gray-300 px-3 text-xs font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-default disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:border-neutral-300";

/**
 * One notification in the Friends timeline, shaped like a friend's entry:
 * who, what, when — and the reply it asks for (Follow back, Approve back).
 */
export function NotificationRow({ n, data }: { n: Notification; data: NotificationsData }) {
  const v = useViewer();
  const actor = n.actor;
  const who = actor?.display_name || (actor ? `@${actor.username}` : "Someone");
  const following = !!actor && v.followingIds.has(actor.id);
  const note = actor ? data.notes.get(actor.id) : undefined;
  const fresh = data.fresh.has(n.id);
  const followBack = n.type === "follow" && actor && !following;
  const approveBack = n.type === "taste" && actor && !data.given.has(actor.id);
  const item = n.type === "favorited" ? n.item : null;
  return (
    <article>
      <header className="flex items-center gap-3">
        <Link
          href={actor ? `/${actor.username}` : "#"}
          aria-label={who}
          className="shrink-0 rounded-[30%] transition-opacity hover:opacity-85"
        >
          <Avatar p={actor} className="size-9" />
        </Link>
        <p className="min-w-0 flex-1 text-sm leading-snug text-gray-500 dark:text-neutral-400">
          <Link
            href={actor ? `/${actor.username}` : "#"}
            className="font-semibold text-gray-900 hover:underline dark:text-neutral-100"
          >
            {who}
          </Link>{" "}
          {n.type === "follow" ? "followed you" : n.type === "taste" ? "approves your taste" : "favorited something from your wall"}
        </p>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-gray-400 tabular-nums dark:text-neutral-500">
          {fresh && <span className="size-1.5 rounded-full bg-red-500" aria-label="new" />}
          {timeAgo(n.created_at)}
        </span>
      </header>
      {(item || (n.type === "taste" && note) || followBack || approveBack) && (
        <div className="mt-2 ml-12 flex flex-col items-start gap-2">
          {item && (
            <Link href={`/item/fav/${item.id}`} className="flex items-center gap-2.5 rounded-lg hover:opacity-80">
              {item.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbCover(item.image_url, 100)}
                  alt=""
                  loading="lazy"
                  className="size-9 shrink-0 rounded-[4px] bg-gray-200 object-cover dark:bg-neutral-700"
                />
              )}
              <span className="truncate text-sm font-medium text-gray-900 dark:text-neutral-100">{item.title}</span>
            </Link>
          )}
          {n.type === "taste" && note && (
            <p className="text-sm leading-snug text-gray-500 dark:text-neutral-400">&ldquo;{note}&rdquo;</p>
          )}
          {approveBack && (
            <button type="button" disabled={data.busy.has(actor.id)} onClick={() => data.approveBack(actor)} className={smallButton}>
              Approve back
            </button>
          )}
          {followBack && (
            <button type="button" disabled={data.busy.has(actor.id)} onClick={() => data.followBack(actor)} className={smallButton}>
              Follow back
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** "You put Sam, Jo and 3 others on 22 pieces." */
export function Reach({ reach }: { reach: NonNullable<NotificationsData["reach"]> }) {
  return (
    <p className="text-xs leading-relaxed text-gray-500 dark:text-neutral-400">
      You put{" "}
      {reach.people.slice(0, 2).map((p, i) => (
        <span key={p.id}>
          {i > 0 && (reach.people.length > 2 ? ", " : " and ")}
          <Link href={`/${p.username}`} className="font-medium text-gray-900 hover:underline dark:text-neutral-100">
            {p.display_name || `@${p.username}`}
          </Link>
        </span>
      ))}
      {reach.people.length > 2 && `, and ${reach.people.length - 2} other${reach.people.length === 3 ? "" : "s"}`} on{" "}
      {reach.pieces} piece{reach.pieces === 1 ? "" : "s"}.
    </p>
  );
}
