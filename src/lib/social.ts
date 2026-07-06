import { supabase } from "./supabase";
import type { Item, Profile } from "./types";

export const PROFILE_COLS = "id, user_id, username, display_name, bio, avatar_url, socials";

/** Profiles this person follows. Embedded join: one round trip, not two. */
export async function fetchFollowing(profileId: string): Promise<Profile[]> {
  const { data } = await supabase()
    .from("follows")
    .select(`followee:profiles!followee_id(${PROFILE_COLS})`)
    .eq("follower_id", profileId);
  return (data ?? []).map((r) => r.followee).filter(Boolean) as unknown as Profile[];
}

/** Profiles following this person. Embedded join: one round trip, not two. */
export async function fetchFollowers(profileId: string): Promise<Profile[]> {
  const { data } = await supabase()
    .from("follows")
    .select(`follower:profiles!follower_id(${PROFILE_COLS})`)
    .eq("followee_id", profileId);
  return (data ?? []).map((r) => r.follower).filter(Boolean) as unknown as Profile[];
}

// %/_ get backslash-escaped; PostgREST also rewrites a bare * into % with no
// escape syntax, so a literal * becomes _ — the closest (one-char) safe match
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&").replace(/\*/g, "_");

type Matchable = Pick<Item, "media_type" | "title"> & { canonical_id?: string | null };

/** Local "same item" title key — mirrors whoSaved's title fallback. */
export const matchKey = (i: Pick<Item, "media_type" | "title">) =>
  `${i.media_type}|${i.title.trim().toLowerCase()}`;

/** All keys an item matches under: canonical id (when it has one) + title key. */
export const itemKeys = (i: Matchable): string[] =>
  i.canonical_id ? [i.canonical_id, matchKey(i)] : [matchKey(i)];

/**
 * Which of `candidateIds` have saved an item matching this one. Matches by
 * canonical_id when this item has one, plus media_type + case-insensitive
 * title as fallback (rows predating canonical ids, and URL/photo/manual
 * items, which never get one).
 */
export async function whoSaved(
  item: Matchable,
  candidateIds: string[]
): Promise<Set<string>> {
  if (!candidateIds.length) return new Set();
  const db = supabase();
  const byTitle = db
    .from("items")
    .select("profile_id")
    .in("profile_id", candidateIds)
    .eq("media_type", item.media_type)
    .ilike("title", escapeLike(item.title.trim()));
  const queries = [byTitle];
  if (item.canonical_id) {
    queries.push(
      db
        .from("items")
        .select("profile_id")
        .in("profile_id", candidateIds)
        .eq("canonical_id", item.canonical_id)
    );
  }
  const results = await Promise.all(queries);
  return new Set(results.flatMap(({ data }) => (data ?? []).map((r) => r.profile_id)));
}

/**
 * How many people network-wide have this item favorited (excluding its owner).
 * Canonical-first with the same title fallback as whoSaved.
 */
export async function favoritedCount(item: Item): Promise<number> {
  const db = supabase();
  if (item.canonical_id) {
    const { count } = await db
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("canonical_id", item.canonical_id)
      .neq("profile_id", item.profile_id);
    return count ?? 0;
  }
  const { count } = await db
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("media_type", item.media_type)
    .ilike("title", escapeLike(item.title.trim()))
    .neq("profile_id", item.profile_id);
  return count ?? 0;
}

/**
 * Copy an item into `profileId`'s library — THE social action. Provenance is
 * recorded when the source is a real row in someone else's library, which is
 * what powers "via @user", the reach stat, and the favorited notification.
 */
export async function copyItem(item: Item, profileId: string, thoughts = ""): Promise<void> {
  const db = supabase();
  const { data: top } = await db
    .from("items")
    .select("sort_order")
    .eq("profile_id", profileId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const fromLibrary =
    !!item.profile_id && item.profile_id !== profileId && !item.id.startsWith("discover-");
  const { error } = await db.from("items").insert({
    profile_id: profileId,
    media_type: item.media_type,
    title: item.title,
    creator: item.creator,
    description: thoughts,
    image_url: item.image_url,
    view_url: item.view_url,
    metadata: item.metadata,
    canonical_id: item.canonical_id ?? null,
    via_profile_id: fromLibrary ? item.profile_id : null,
    source_item_id: fromLibrary ? item.id : null,
    sort_order: (top?.[0]?.sort_order ?? -1) + 1,
  });
  if (error) throw new Error(error.message);
}

/* ── notifications ─────────────────────────────────────────────────────────── */

export interface Notification {
  id: string;
  type: "follow" | "favorited";
  actor: Profile | null;
  item: Pick<Item, "id" | "title" | "profile_id"> | null;
  read_at: string | null;
  created_at: string;
}

export async function fetchNotifications(profileId: string): Promise<Notification[]> {
  // actor + item ride along as embeds — one round trip instead of three;
  // a deleted actor/item embeds as null, same as the old map-miss behavior
  const { data } = await supabase()
    .from("notifications")
    .select(
      `id, type, read_at, created_at,
       actor:profiles!actor_id(${PROFILE_COLS}),
       item:items!item_id(id, title, profile_id)`
    )
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []).map((r) => ({
    id: r.id,
    type: r.type as Notification["type"],
    actor: (r.actor as unknown as Profile | null) ?? null,
    item: (r.item as unknown as Notification["item"]) ?? null,
    read_at: r.read_at,
    created_at: r.created_at,
  }));
}

export async function unreadCount(profileId: string): Promise<number> {
  const { count } = await supabase()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .is("read_at", null);
  return count ?? 0;
}

export async function markAllRead(profileId: string): Promise<void> {
  await supabase()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .is("read_at", null);
}

/* ── blocking ──────────────────────────────────────────────────────────────── */

/** Has the viewer blocked this profile? (blocks are only visible to their owner) */
export async function hasBlocked(viewerId: string, targetId: string): Promise<boolean> {
  const { data } = await supabase()
    .from("blocks")
    .select("blocked_id")
    .eq("blocker_id", viewerId)
    .eq("blocked_id", targetId)
    .maybeSingle();
  return !!data;
}

/** Block: severs follows both ways and retracts their notifications (one RPC). */
export async function blockProfile(targetId: string): Promise<void> {
  const { error } = await supabase().rpc("block_profile", { p_target: targetId });
  if (error) throw new Error(error.message);
}

export async function unblockProfile(targetId: string): Promise<void> {
  const { error } = await supabase().rpc("unblock_profile", { p_target: targetId });
  if (error) throw new Error(error.message);
}

export const REPORT_EMAIL = "builtbyabdul@gmail.com";

/** Reach: who this library put on, and on how many pieces. */
export async function fetchReach(
  profileId: string
): Promise<{ people: Profile[]; pieces: number }> {
  const { data } = await supabase()
    .from("items")
    .select(`profile_id, profile:profiles!profile_id(${PROFILE_COLS})`)
    .eq("via_profile_id", profileId)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const seen = new Set<string>();
  const people: Profile[] = [];
  for (const r of rows) {
    if (r.profile && !seen.has(r.profile_id)) {
      seen.add(r.profile_id);
      people.push(r.profile as unknown as Profile);
    }
  }
  return { people, pieces: rows.length };
}

/** Cold start: active profiles worth following (has items, not you, not followed). */
export async function fetchSuggestions(viewerId: string | null): Promise<Profile[]> {
  const db = supabase();
  const excluded = new Set<string>(viewerId ? [viewerId] : []);
  // the viewer's follows and the recent-saves scan are independent — parallel
  const [{ data: mine }, { data: recent }] = await Promise.all([
    viewerId
      ? db.from("follows").select("followee_id").eq("follower_id", viewerId)
      : Promise.resolve({ data: [] as { followee_id: string }[] }),
    // recently active libraries, by latest save
    db.from("items").select("profile_id").order("created_at", { ascending: false }).limit(120),
  ]);
  for (const r of mine ?? []) excluded.add(r.followee_id);
  const ranked: string[] = [];
  for (const r of recent ?? []) {
    if (!excluded.has(r.profile_id) && !ranked.includes(r.profile_id)) ranked.push(r.profile_id);
    if (ranked.length >= 6) break;
  }
  if (!ranked.length) return [];
  const { data: profiles } = await db.from("profiles").select(PROFILE_COLS).in("id", ranked);
  const map = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
  return ranked.map((id) => map.get(id)).filter((p): p is Profile => !!p);
}
