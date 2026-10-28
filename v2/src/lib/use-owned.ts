import { useState } from "react";
import type { Work } from "./types";
import { useViewer } from "./viewer";
import { workKeys } from "./work";

/**
 * What's already theirs when a page opens — favorites and saves — so the
 * page never offers it back. Taken once (and once more when the fresh
 * library replaces the cached one), so a work favorited right there stays on
 * screen. Signed out, nothing is theirs.
 */
export function useOwned(): (w: Pick<Work, "media_type" | "title" | "canonical_id" | "work_key">) => boolean {
  const v = useViewer();
  const pid = v.status === "signed-in" ? (v.profile?.id ?? null) : null;
  const [owned, setOwned] = useState<{ pid: string; fresh: boolean; keys: Set<string> } | null>(null);
  if (pid && (owned?.pid !== pid || (!owned.fresh && !v.stale))) {
    setOwned({ pid, fresh: !v.stale, keys: new Set([...v.favorites.keys(), ...v.membership.keys()]) });
  }
  return (w) => !!owned && owned.pid === pid && workKeys(w).some((k) => owned.keys.has(k));
}
