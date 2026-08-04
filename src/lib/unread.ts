"use client";

import { useEffect, useState } from "react";
import { unreadCount } from "./social";

/**
 * The unread-notifications count, shared between the top bar's Friends tab
 * (which wears the badge) and the Friends page (which clears it). Polled
 * every 60s while the tab is visible — same cadence the old bell used — and
 * synced instantly across mounts through a window event, so marking read on
 * the Friends page zeroes the badge without waiting for the next poll.
 */
const SYNC_EVENT = "fav:unread-sync";

export function useUnread(profileId: string | null | undefined): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!profileId) {
      setUnread(0);
      return;
    }
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      unreadCount(profileId).then(setUnread);
    };
    poll();
    const t = setInterval(poll, 60_000);
    const onSync = (e: Event) => setUnread((e as CustomEvent<number>).detail ?? 0);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener(SYNC_EVENT, onSync);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener(SYNC_EVENT, onSync);
    };
  }, [profileId]);

  return unread;
}

/** Push a new count to every mounted useUnread — 0 after marking all read. */
export function broadcastUnread(n: number) {
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: n }));
}
