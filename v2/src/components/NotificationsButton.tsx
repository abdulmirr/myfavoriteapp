"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { Bell } from "lucide-react";
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
import { follow, setUnread, useViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";
import { thumbCover } from "@/lib/img";
import { playUi } from "@/lib/sfx";
import Avatar from "./ui/Avatar";
import { cn, headerIcon } from "./ui/styles";

function shortDate(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

const smallButton =
  "inline-flex h-7 w-fit cursor-pointer items-center rounded-lg bg-gray-200 px-2.5 text-xs font-semibold text-gray-900 transition-colors hover:bg-gray-300 disabled:cursor-default disabled:opacity-50 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600";

/**
 * The bell: follows, "favorited via you", taste approvals. Unread polls once
 * a minute while the tab is visible; opening the panel and staying a beat
 * marks everything read (bouncing straight off keeps the badge).
 */
export default function NotificationsButton() {
  const v = useViewer();
  const me = v.profile;
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Notification[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [reach, setReach] = useState<{ people: Profile[]; pieces: number } | null>(null);
  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const [given, setGiven] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null);

  // unread badge: poll while visible
  useEffect(() => {
    if (!me) return;
    const poll = () => {
      if (document.visibilityState === "visible") unreadCount(me.id).then(setUnread);
    };
    const t = setInterval(poll, 60_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [me]);

  const load = useCallback(async () => {
    if (!me) return;
    const [items, r, n, g] = await Promise.all([
      fetchNotifications(me.id),
      fetchReach(me.id),
      fetchTasteNotes(me.id),
      fetchTasteGiven(me.id),
    ]);
    setList(items);
    setFresh(new Set(items.filter((x) => !x.read_at).map((x) => x.id)));
    setReach(r);
    setNotes(n);
    setGiven(g);
    if (items.some((x) => !x.read_at)) {
      dwell.current = setTimeout(() => {
        markAllRead(me.id).then(() => setUnread(0));
      }, 1500);
    }
  }, [me]);

  const markNow = () => {
    if (!me) return;
    if (dwell.current) clearTimeout(dwell.current);
    markAllRead(me.id).then(() => setUnread(0));
  };

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    if (busy.has(id)) return;
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
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void load();
        else if (dwell.current) {
          clearTimeout(dwell.current);
          dwell.current = null;
        }
      }}
    >
      <Popover.Trigger
        aria-label={v.unread > 0 ? `Notifications, ${v.unread} unread` : "Notifications"}
        className={cn(headerIcon, "data-[state=open]:bg-gray-300 dark:data-[state=open]:bg-neutral-700")}
      >
        <Bell className="size-4" strokeWidth={2.1} />
        {v.unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-gray-100 dark:ring-neutral-900">
            {v.unread > 9 ? "9+" : v.unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="popover-content z-50 flex max-h-[min(70dvh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08)] outline-none dark:border-neutral-700 dark:bg-neutral-800"
        >
          <p className="border-b border-gray-100 px-4 py-3 text-sm font-semibold tracking-tight text-gray-900 dark:border-neutral-700 dark:text-neutral-100">
            Notifications
          </p>
          <div className="overflow-y-auto">
            {list === null ? (
              <div className="flex flex-col gap-3 p-4" aria-busy>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="size-8 animate-pulse rounded-[30%] bg-gray-200 dark:bg-neutral-700" />
                    <span className="h-3 w-3/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
                  </div>
                ))}
              </div>
            ) : list.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-neutral-400">
                Nothing yet. Follows and favorites from your wall show up here.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-neutral-700">
                {list.map((n) => {
                  const actor = n.actor;
                  const who = actor?.display_name || (actor ? `@${actor.username}` : "Someone");
                  const following = !!actor && v.followingIds.has(actor.id);
                  const note = actor ? notes.get(actor.id) : undefined;
                  return (
                    <li key={n.id} className="flex gap-3 px-4 py-3">
                      <Link href={actor ? `/${actor.username}` : "#"} onClick={markNow} className="shrink-0">
                        <Avatar p={actor} className="size-8" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <p className="min-w-0 flex-1 text-sm leading-snug text-gray-600 dark:text-neutral-300">
                            <Link
                              href={actor ? `/${actor.username}` : "#"}
                              onClick={markNow}
                              className="font-semibold text-gray-900 hover:underline dark:text-neutral-100"
                            >
                              {who}
                            </Link>{" "}
                            {n.type === "follow"
                              ? "followed you"
                              : n.type === "taste"
                                ? "approves your taste"
                                : "favorited something from your wall"}
                          </p>
                          {fresh.has(n.id) && (
                            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-red-500" aria-label="new" />
                          )}
                          <span className="shrink-0 pt-px text-xs text-gray-400 dark:text-neutral-500">
                            {shortDate(n.created_at)}
                          </span>
                        </div>
                        {n.type === "favorited" && n.item && (
                          <Link
                            href={`/item/fav/${n.item.id}`}
                            onClick={markNow}
                            className="mt-2 flex items-center gap-2.5 rounded-lg hover:opacity-80"
                          >
                            {n.item.image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumbCover(n.item.image_url, 100)}
                                alt=""
                                loading="lazy"
                                className="size-9 shrink-0 rounded-md bg-gray-200 object-cover dark:bg-neutral-700"
                              />
                            )}
                            <span className="truncate text-sm font-medium text-gray-900 dark:text-neutral-100">
                              {n.item.title}
                            </span>
                          </Link>
                        )}
                        {n.type === "taste" && note && (
                          <p className="mt-1.5 text-sm leading-snug text-gray-500 dark:text-neutral-400">
                            &ldquo;{note}&rdquo;
                          </p>
                        )}
                        {n.type === "taste" && actor && !given.has(actor.id) && me && (
                          <button
                            type="button"
                            disabled={busy.has(actor.id)}
                            onClick={() =>
                              withBusy(actor.id, async () => {
                                await approveTaste(me.id, actor.id);
                                setGiven((s) => new Set(s).add(actor.id));
                              })
                            }
                            className={cn(smallButton, "mt-2")}
                          >
                            Approve back
                          </button>
                        )}
                        {n.type === "follow" && actor && !following && (
                          <button
                            type="button"
                            disabled={busy.has(actor.id)}
                            onClick={() => withBusy(actor.id, () => follow(actor))}
                            className={cn(smallButton, "mt-2")}
                          >
                            Follow back
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {reach && reach.pieces > 0 && (
              <p className="border-t border-gray-100 px-4 py-3 text-xs leading-relaxed text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
                You put on{" "}
                {reach.people.slice(0, 2).map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && (reach.people.length > 2 ? ", " : " and ")}
                    <Link href={`/${p.username}`} className="font-medium text-gray-900 hover:underline dark:text-neutral-100">
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
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
