import { supabase } from "./supabase";
import type { Item, MediaType, Profile } from "./types";

export const PROFILE_COLS = "id, user_id, username, display_name, bio, avatar_url, socials";

/**
 * A safe outbound href for a social link. Users type bare domains
 * ("abdulmir.com") into the settings inputs; a scheme-less href is treated as
 * a path relative to the current page, so the browser would resolve it to
 * myfavoriteapp.com/abdulmir.com instead of leaving the site. Prepend https://
 * (leaving mailto:/existing http(s) links alone) so it points at the real
 * destination. Applied both on save and at render, so links already stored
 * scheme-less resolve correctly without the user re-saving.
 */
export function socialHref(url: string): string {
  const v = url.trim();
  if (!v) return v;
  if (/^(https?:|mailto:)/i.test(v)) return v;
  return `https://${v.replace(/^\/+/, "")}`;
}

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
 * Budget triggers raise bare Postgres exceptions ("daily favorite limit
 * reached") that would otherwise land in the UI verbatim — say it like a
 * product instead. Unknown messages pass through untouched.
 */
export function friendlyError(message: string): string {
  const limit = message.match(/daily (favorite|follow|approval) limit/i)?.[1];
  if (limit) {
    const verb = { favorite: "favoriting", follow: "following", approval: "approving" }[
      limit.toLowerCase() as "favorite" | "follow" | "approval"
    ];
    return `You've hit today's ${verb} limit — it resets tomorrow.`;
  }
  return message;
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
  if (error) throw new Error(friendlyError(error.message));
}

/* ── collections: curator-named shelves on the public page ─────────────────── */

export interface Collection {
  id: string;
  profile_id: string;
  name: string;
  created_at: string;
  /** live membership count (embed) */
  count: number;
}

export async function fetchCollections(profileId: string): Promise<Collection[]> {
  const { data } = await supabase()
    .from("collections")
    .select("id, profile_id, name, created_at, collection_items(count)")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });
  type Row = Omit<Collection, "count"> & { collection_items: { count: number }[] };
  return ((data ?? []) as Row[]).map(({ collection_items, ...c }) => ({
    ...c,
    count: collection_items?.[0]?.count ?? 0,
  }));
}

export async function createCollection(profileId: string, name: string): Promise<Collection> {
  const { data, error } = await supabase()
    .from("collections")
    .insert({ profile_id: profileId, name: name.trim() })
    .select("id, profile_id, name, created_at")
    .single();
  if (error) {
    throw new Error(
      error.code === "23505" ? "You already have a collection with that name." : friendlyError(error.message)
    );
  }
  return { ...(data as Omit<Collection, "count">), count: 0 };
}

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase().from("collections").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** item ids inside a collection — powers the grid filter */
export async function fetchCollectionItemIds(collectionId: string): Promise<Set<string>> {
  const { data } = await supabase()
    .from("collection_items")
    .select("item_id")
    .eq("collection_id", collectionId);
  return new Set((data ?? []).map((r) => r.item_id as string));
}

/** which of the profile's collections hold this item — powers the overlay picker */
export async function fetchItemCollectionIds(itemId: string): Promise<Set<string>> {
  const { data } = await supabase()
    .from("collection_items")
    .select("collection_id")
    .eq("item_id", itemId);
  return new Set((data ?? []).map((r) => r.collection_id as string));
}

export async function setItemInCollection(
  collectionId: string,
  itemId: string,
  member: boolean
): Promise<void> {
  const db = supabase();
  if (member) {
    const { error } = await db
      .from("collection_items")
      .upsert({ collection_id: collectionId, item_id: itemId }, { ignoreDuplicates: true });
    if (error) throw new Error(friendlyError(error.message));
  } else {
    const { error } = await db
      .from("collection_items")
      .delete()
      .eq("collection_id", collectionId)
      .eq("item_id", itemId);
    if (error) throw new Error(error.message);
  }
}

/* ── friends directory ─────────────────────────────────────────────────────── */

/** A friend's showcase strip: their pinned Top 4, or latest saves when nothing is pinned. */
export interface Showcase {
  items: Item[];
  pinned: boolean;
}

/**
 * Showcase strips for a set of profiles, keyed by profile id. Pins are the
 * person's chosen identity row, so any pin wins outright; only pinless
 * libraries fall back to recency.
 */
export async function fetchShowcases(profileIds: string[]): Promise<Map<string, Showcase>> {
  const map = new Map<string, Showcase>();
  if (!profileIds.length) return map;
  const db = supabase();
  const { data: pins } = await db
    .from("items")
    .select("*")
    .in("profile_id", profileIds)
    .not("pinned_order", "is", null)
    .order("pinned_order", { ascending: true });
  for (const row of (pins ?? []) as Item[]) {
    const cur = map.get(row.profile_id);
    if (cur) cur.items.push(row);
    else map.set(row.profile_id, { items: [row], pinned: true });
  }
  const bare = profileIds.filter((id) => !map.has(id));
  if (bare.length) {
    // newest-first slice big enough that one prolific library can't starve the
    // rest at present scale; grouped into per-person strips client-side
    const { data: recent } = await db
      .from("items")
      .select("*")
      .in("profile_id", bare)
      .order("created_at", { ascending: false })
      .limit(400);
    for (const row of (recent ?? []) as Item[]) {
      const cur = map.get(row.profile_id);
      if (!cur) map.set(row.profile_id, { items: [row], pinned: false });
      else if (cur.items.length < 4) cur.items.push(row);
    }
  }
  return map;
}

export interface DiscoverProfile extends Profile {
  /** favorites in their library */
  count: number;
  /** distinct canonical favorites you both have */
  shared: number;
}

/**
 * The "other users" shelf: people you don't follow, ranked by taste overlap
 * (shared canonical favorites, same identity taste_match counts) then by
 * library size. One items scan instead of an RPC per candidate; empty
 * libraries and blocked profiles are skipped.
 */
export async function fetchDiscover(
  viewerId: string,
  followingIds: string[]
): Promise<DiscoverProfile[]> {
  const db = supabase();
  const [{ data: profs }, { data: blocks }, { data: mine }] = await Promise.all([
    db
      .from("profiles")
      .select(PROFILE_COLS)
      .neq("id", viewerId)
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("blocks").select("blocked_id").eq("blocker_id", viewerId),
    db
      .from("items")
      .select("canonical_id")
      .eq("profile_id", viewerId)
      .not("canonical_id", "is", null)
      .limit(2000),
  ]);
  const skip = new Set<string>([
    viewerId,
    ...followingIds,
    ...(blocks ?? []).map((b) => b.blocked_id as string),
  ]);
  const candidates = ((profs ?? []) as Profile[]).filter((p) => !skip.has(p.id));
  if (!candidates.length) return [];
  const myCanon = new Set((mine ?? []).map((r) => r.canonical_id as string));
  const { data: theirs } = await db
    .from("items")
    .select("profile_id, canonical_id")
    .in(
      "profile_id",
      candidates.map((p) => p.id)
    )
    .limit(8000);
  const counts = new Map<string, number>();
  const overlap = new Map<string, Set<string>>();
  for (const r of theirs ?? []) {
    counts.set(r.profile_id, (counts.get(r.profile_id) ?? 0) + 1);
    if (r.canonical_id && myCanon.has(r.canonical_id)) {
      let s = overlap.get(r.profile_id);
      if (!s) overlap.set(r.profile_id, (s = new Set()));
      s.add(r.canonical_id);
    }
  }
  return candidates
    .filter((p) => (counts.get(p.id) ?? 0) > 0)
    .map((p) => ({
      ...p,
      count: counts.get(p.id) ?? 0,
      shared: overlap.get(p.id)?.size ?? 0,
    }))
    .sort((a, b) => b.shared - a.shared || b.count - a.count)
    .slice(0, 30);
}

/* ── taste match ────────────────────────────────────────────────────────────── */

export interface TasteMatch {
  shared: number;
  top_type: MediaType | null;
}

/** Overlap between two libraries by canonical id — "you share 12 favorites". */
export async function fetchTasteMatch(a: string, b: string): Promise<TasteMatch> {
  const { data } = await supabase().rpc("taste_match", { p_a: a, p_b: b });
  return (data as TasteMatch | null) ?? { shared: 0, top_type: null };
}

/* ── radar: the private "looks interesting" shelf ──────────────────────────── */

export interface RadarItem {
  id: string;
  profile_id: string;
  media_type: MediaType;
  title: string;
  creator: string;
  image_url: string | null;
  view_url: string | null;
  metadata: Record<string, unknown>;
  canonical_id: string | null;
  via_profile_id: string | null;
  source_item_id: string | null;
  created_at: string;
}

/** Put something spotted in the wild on the radar — private, provenance kept. */
export async function addToRadar(item: Item, profileId: string): Promise<void> {
  const fromLibrary =
    !!item.profile_id && item.profile_id !== profileId && !item.id.startsWith("discover-");
  const { error } = await supabase().from("radar_items").upsert(
    {
      profile_id: profileId,
      media_type: item.media_type,
      title: item.title,
      creator: item.creator,
      image_url: item.image_url,
      view_url: item.view_url,
      metadata: item.metadata,
      canonical_id: item.canonical_id ?? null,
      via_profile_id: fromLibrary ? item.profile_id : null,
      source_item_id: fromLibrary ? item.id : null,
    },
    { onConflict: "profile_id,media_type,title", ignoreDuplicates: true }
  );
  if (error) throw new Error(friendlyError(error.message));
}

export async function fetchRadar(profileId: string): Promise<RadarItem[]> {
  const { data } = await supabase()
    .from("radar_items")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(40);
  return (data ?? []) as RadarItem[];
}

export async function removeFromRadar(id: string): Promise<void> {
  await supabase().from("radar_items").delete().eq("id", id);
}

/**
 * Radar → favorite: the "loved it" promotion. Provenance rides along when the
 * source row still exists; if it was deleted since, retry without — losing
 * the via-credit beats losing the favorite.
 */
export async function promoteRadar(r: RadarItem, profileId: string): Promise<void> {
  const db = supabase();
  const { data: top } = await db
    .from("items")
    .select("sort_order")
    .eq("profile_id", profileId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const base = {
    profile_id: profileId,
    media_type: r.media_type,
    title: r.title,
    creator: r.creator,
    description: "",
    image_url: r.image_url,
    view_url: r.view_url,
    metadata: r.metadata,
    canonical_id: r.canonical_id,
    sort_order: (top?.[0]?.sort_order ?? -1) + 1,
  };
  const { error } = await db.from("items").insert({
    ...base,
    via_profile_id: r.via_profile_id,
    source_item_id: r.source_item_id,
  });
  if (error) {
    // 23514 = the provenance pair no longer validates (source item deleted)
    if (error.code !== "23514") throw new Error(friendlyError(error.message));
    const { error: retryErr } = await db.from("items").insert(base);
    if (retryErr) throw new Error(friendlyError(retryErr.message));
  }
  await db.from("radar_items").delete().eq("id", r.id);
}

/* ── notifications ─────────────────────────────────────────────────────────── */

export interface Notification {
  id: string;
  type: "follow" | "favorited" | "taste";
  actor: Profile | null;
  item: Pick<Item, "id" | "title" | "profile_id" | "image_url"> | null;
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
       item:items!item_id(id, title, profile_id, image_url)`
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

/* ── taste approvals ───────────────────────────────────────────────────────── */

/**
 * "Approve taste" — the person-level gesture next to Follow. One row per
 * giver→receiver pair; the optional note is a private ice-breaker the receiver
 * reads in their notifications. Rows are RLS-visible only to the two people
 * involved, so the public count goes through the taste_approval_count RPC.
 */
export async function hasApprovedTaste(giverId: string, receiverId: string): Promise<boolean> {
  const { data } = await supabase()
    .from("taste_approvals")
    .select("giver_id")
    .eq("giver_id", giverId)
    .eq("receiver_id", receiverId)
    .maybeSingle();
  return !!data;
}

export async function approveTaste(giverId: string, receiverId: string): Promise<void> {
  const { error } = await supabase()
    .from("taste_approvals")
    .insert({ giver_id: giverId, receiver_id: receiverId });
  if (error) throw new Error(error.message);
}

export async function unapproveTaste(giverId: string, receiverId: string): Promise<void> {
  const { error } = await supabase()
    .from("taste_approvals")
    .delete()
    .eq("giver_id", giverId)
    .eq("receiver_id", receiverId);
  if (error) throw new Error(error.message);
}

/** Attach (or rewrite) the optional note on an approval the giver already sent. */
export async function setTasteNote(
  giverId: string,
  receiverId: string,
  note: string
): Promise<void> {
  const { error } = await supabase()
    .from("taste_approvals")
    .update({ note: note.trim().slice(0, 140) })
    .eq("giver_id", giverId)
    .eq("receiver_id", receiverId);
  if (error) throw new Error(error.message);
}

/** Public approval count for a profile (definer RPC — see migration14). */
export async function tasteApprovalCount(profileId: string): Promise<number> {
  const { data } = await supabase().rpc("taste_approval_count", { p_profile: profileId });
  return (data as number | null) ?? 0;
}

/** Notes attached to approvals this person received, keyed by giver id. */
export async function fetchTasteNotes(receiverId: string): Promise<Map<string, string>> {
  const { data } = await supabase()
    .from("taste_approvals")
    .select("giver_id, note")
    .eq("receiver_id", receiverId);
  return new Map((data ?? []).filter((r) => r.note).map((r) => [r.giver_id, r.note]));
}

/** Who this person has approved — powers "Approve back" in the bell panel. */
export async function fetchTasteGiven(giverId: string): Promise<Set<string>> {
  const { data } = await supabase()
    .from("taste_approvals")
    .select("receiver_id")
    .eq("giver_id", giverId);
  return new Set((data ?? []).map((r) => r.receiver_id));
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
  const following = (mine ?? []).map((r) => r.followee_id);
  for (const id of following) excluded.add(id);

  // people the people you follow follow — the densest predictor of a good
  // follow at small scale; ranked by how many of your follows vouch for them
  const ranked: string[] = [];
  if (following.length) {
    const { data: twoHop } = await db
      .from("follows")
      .select("followee_id")
      .in("follower_id", following)
      .limit(400);
    const freq = new Map<string, number>();
    for (const r of twoHop ?? []) {
      if (excluded.has(r.followee_id)) continue;
      freq.set(r.followee_id, (freq.get(r.followee_id) ?? 0) + 1);
    }
    ranked.push(...[...freq.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id));
  }

  // fill the remainder with recently active libraries
  for (const r of recent ?? []) {
    if (ranked.length >= 6) break;
    if (!excluded.has(r.profile_id) && !ranked.includes(r.profile_id)) ranked.push(r.profile_id);
  }
  const picks = ranked.slice(0, 6);
  if (!picks.length) return [];
  const { data: profiles } = await db.from("profiles").select(PROFILE_COLS).in("id", picks);
  const map = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
  return picks.map((id) => map.get(id)).filter((p): p is Profile => !!p);
}
