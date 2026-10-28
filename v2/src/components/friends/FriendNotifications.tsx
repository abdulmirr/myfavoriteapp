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
import Dialog from "../ui/Dialog";
import { cn } from "../ui/styles";

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
 * taste approvals, and your reach — fetched once for the Friends page.
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

/** One notification: who, what, when — and the reply it asks for (Follow back, Approve back). */
function Row({ n, data }: { n: Notification; data: NotificationsData }) {
  const v = useViewer();
  const actor = n.actor;
  const who = actor?.display_name || (actor ? `@${actor.username}` : "Someone");
  const following = !!actor && v.followingIds.has(actor.id);
  const note = actor ? data.notes.get(actor.id) : undefined;
  const fresh = data.fresh.has(n.id);
  return (
    <li className="flex gap-3 py-3.5">
      <Link href={actor ? `/${actor.username}` : "#"} className="shrink-0">
        <Avatar p={actor} className="size-9" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm leading-snug text-gray-600 dark:text-neutral-300">
            <Link href={actor ? `/${actor.username}` : "#"} className="font-semibold text-gray-900 hover:underline dark:text-neutral-100">
              {who}
            </Link>{" "}
            {n.type === "follow" ? "followed you" : n.type === "taste" ? "approves your taste" : "favorited something from your wall"}
          </p>
          <span className="flex shrink-0 items-center gap-1.5 pt-px text-xs text-gray-400 tabular-nums dark:text-neutral-500">
            {fresh && <span className="size-1.5 rounded-full bg-red-500" aria-label="new" />}
            {timeAgo(n.created_at)}
          </span>
        </div>
        {n.type === "favorited" && n.item && (
          <Link href={`/item/fav/${n.item.id}`} className="mt-2 flex items-center gap-2.5 rounded-lg hover:opacity-80">
            {n.item.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbCover(n.item.image_url, 100)}
                alt=""
                loading="lazy"
                className="size-9 shrink-0 rounded-[4px] bg-gray-200 object-cover dark:bg-neutral-700"
              />
            )}
            <span className="truncate text-sm font-medium text-gray-900 dark:text-neutral-100">{n.item.title}</span>
          </Link>
        )}
        {n.type === "taste" && note && (
          <p className="mt-1.5 text-sm leading-snug text-gray-500 dark:text-neutral-400">&ldquo;{note}&rdquo;</p>
        )}
        {n.type === "taste" && actor && !data.given.has(actor.id) && (
          <button type="button" disabled={data.busy.has(actor.id)} onClick={() => data.approveBack(actor)} className={cn(smallButton, "mt-2")}>
            Approve back
          </button>
        )}
        {n.type === "follow" && actor && !following && (
          <button type="button" disabled={data.busy.has(actor.id)} onClick={() => data.followBack(actor)} className={cn(smallButton, "mt-2")}>
            Follow back
          </button>
        )}
      </div>
    </li>
  );
}

/** "You put Sam, Jo and 3 others on 22 pieces." */
function Reach({ reach }: { reach: NonNullable<NotificationsData["reach"]> }) {
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

/**
 * The notifications, straight on the page: the latest few, and "See all"
 * opens the rest in a window of its own (scrolling there, not stretching the
 * page). Your reach closes the section.
 */
export default function FriendNotifications({ data, limit = 5 }: { data: NotificationsData; limit?: number }) {
  const [all, setAll] = useState(false);
  const { list, fresh, reach } = data;

  return (
    <section aria-label="Notifications">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-3 dark:border-neutral-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-gray-900 dark:text-neutral-100">
          Notifications
          {fresh.size > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white tabular-nums">
              {fresh.size}
            </span>
          )}
        </h2>
        {list && list.length > limit && (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="cursor-pointer text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            See all {list.length}
          </button>
        )}
      </div>
      {list === null ? (
        <div className="mt-4 flex flex-col gap-5" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="size-9 animate-pulse rounded-[30%] bg-gray-200 dark:bg-neutral-800" />
              <span className="h-3 w-3/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="pt-3.5 text-sm leading-relaxed text-gray-500 dark:text-neutral-400">
          Nothing yet. Follows and favorites from your wall show up here.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-neutral-800">
          {list.slice(0, limit).map((n) => (
            <Row key={n.id} n={n} data={data} />
          ))}
        </ul>
      )}
      {reach && reach.pieces > 0 && (
        <div className="border-t border-gray-200 pt-3.5 dark:border-neutral-800">
          <Reach reach={reach} />
        </div>
      )}
      {all && list && (
        <Dialog open={all} onOpenChange={setAll} title="Notifications" size="lg">
          <ul className="-mt-1 divide-y divide-gray-200 dark:divide-neutral-700">
            {list.map((n) => (
              <Row key={n.id} n={n} data={data} />
            ))}
          </ul>
        </Dialog>
      )}
    </section>
  );
}
