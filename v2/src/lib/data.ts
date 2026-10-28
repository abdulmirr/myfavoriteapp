import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { supabaseServer } from "./supabase";
import { PROFILE_COLS } from "./social";
import type {
  FeedWork,
  Item,
  ListItem,
  ListRow,
  ListSummary,
  MediaType,
  Profile,
  ProfileLite,
} from "./types";
import { titleKey } from "./work";

/**
 * The public read layer. Everything here is anonymous (RLS hides private
 * lists and personal tables), cached with `use cache`, and tagged so writes
 * can refresh exactly what they touched:
 *   profile:<id> — a person's header, wall, lists, activity
 *   list:<id>    — one list page
 *   work:<key>   — one item page
 *   feed         — the feed, community picks, item pages
 * cacheLife('minutes') keeps pages instant while refreshing in the background
 * at most a minute behind — that also covers writes that don't ping us (the
 * v1 site and the browser extension share this database).
 */

const LITE = "id, username, display_name, avatar_url";

export interface ProfilePageData extends Profile {
  counts: { favorites: number; followers: number; following: number; lists: number };
  /** up to three top covers (pinned first) — the banner when there's no header image */
  ambient: string[];
}

export async function getProfile(username: string): Promise<ProfilePageData | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`username:${username}`);
  const db = supabaseServer();
  const { data } = await db.from("profiles").select(PROFILE_COLS).eq("username", username).maybeSingle();
  if (!data) return null;
  const p = data as Profile;
  cacheTag(`profile:${p.id}`);
  const [favs, followers, following, lists, top] = await Promise.all([
    db.from("items").select("id", { count: "exact", head: true }).eq("profile_id", p.id),
    db.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", p.id),
    db.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", p.id),
    db.from("lists").select("id", { count: "exact", head: true }).eq("profile_id", p.id),
    db
      .from("items")
      .select("image_url")
      .eq("profile_id", p.id)
      .not("image_url", "is", null)
      .neq("media_type", "photo")
      .order("pinned_order", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true })
      .limit(8),
  ]);
  return {
    ...p,
    header_url: p.header_url ?? null,
    counts: {
      favorites: favs.count ?? 0,
      followers: followers.count ?? 0,
      following: following.count ?? 0,
      lists: lists.count ?? 0,
    },
    // distinct covers only — a repeat would just muddy the color field
    ambient: [...new Set(((top.data ?? []) as { image_url: string }[]).map((r) => r.image_url))].slice(0, 3),
  };
}

/** A renamed profile's current handle, so old links keep working. */
export async function getRenamedHandle(oldUsername: string): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  const db = supabaseServer();
  const { data: moved } = await db
    .from("username_history")
    .select("profile_id")
    .eq("old_username", oldUsername.toLowerCase())
    .maybeSingle();
  if (!moved) return null;
  const { data } = await db.from("profiles").select("username").eq("id", moved.profile_id).maybeSingle();
  return (data as { username: string } | null)?.username ?? null;
}

/** Every handle, for prerendering profiles at build time. */
export async function getAllUsernames(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  const { data } = await supabaseServer().from("profiles").select("username");
  return ((data ?? []) as { username: string }[]).map((r) => r.username);
}

/** The wall: a person's favorites in their own order. */
export async function getFavorites(profileId: string): Promise<Item[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`profile:${profileId}`);
  const { data } = await supabaseServer()
    .from("items")
    .select("*")
    .eq("profile_id", profileId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as Item[];
}

/** Attach counts + newest covers to list rows (one extra query for all). */
async function summarize(lists: ListRow[]): Promise<ListSummary[]> {
  if (!lists.length) return [];
  const { data } = await supabaseServer()
    .from("list_items")
    .select("list_id, image_url")
    .in(
      "list_id",
      lists.map((l) => l.id)
    )
    .order("position", { ascending: true })
    .limit(5000);
  const counts = new Map<string, number>();
  const covers = new Map<string, string[]>();
  for (const r of (data ?? []) as { list_id: string; image_url: string | null }[]) {
    counts.set(r.list_id, (counts.get(r.list_id) ?? 0) + 1);
    const c = covers.get(r.list_id) ?? [];
    if (r.image_url && c.length < 4) c.push(r.image_url);
    covers.set(r.list_id, c);
  }
  return lists.map((l) => ({ ...l, count: counts.get(l.id) ?? 0, covers: covers.get(l.id) ?? [] }));
}

/** A person's public lists, most recently updated first. */
export async function getPublicLists(profileId: string): Promise<ListSummary[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`profile:${profileId}`);
  const { data } = await supabaseServer()
    .from("lists")
    .select("*")
    .eq("profile_id", profileId)
    .eq("is_public", true)
    .order("updated_at", { ascending: false });
  return summarize((data ?? []) as ListRow[]);
}

export interface ListPageData {
  list: ListSummary;
  owner: ProfileLite;
  items: ListItem[];
}

/** One public list with its items, or null (missing, or private → client loads it). */
export async function getList(username: string, slug: string): Promise<ListPageData | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`username:${username}`);
  const db = supabaseServer();
  const { data: owner } = await db.from("profiles").select(LITE).eq("username", username).maybeSingle();
  if (!owner) return null;
  cacheTag(`profile:${(owner as ProfileLite).id}`);
  const { data: list } = await db
    .from("lists")
    .select("*")
    .eq("profile_id", (owner as ProfileLite).id)
    .eq("slug", slug)
    .maybeSingle();
  if (!list) return null;
  cacheTag(`list:${(list as ListRow).id}`);
  const { data: items } = await db
    .from("list_items")
    .select("*")
    .eq("list_id", (list as ListRow).id)
    .order("position", { ascending: true });
  const [summary] = await summarize([list as ListRow]);
  return { list: summary, owner: owner as ProfileLite, items: (items ?? []) as ListItem[] };
}

/** Public lists to prerender at build time. */
export async function getPublicListParams(): Promise<{ username: string; slug: string }[]> {
  "use cache";
  cacheLife("hours");
  const { data } = await supabaseServer()
    .from("lists")
    .select("slug, owner:profiles!lists_profile_id_fkey(username)")
    .eq("is_public", true)
    .limit(500);
  return ((data ?? []) as unknown as { slug: string; owner: { username: string } | null }[])
    .filter((r) => r.owner)
    .map((r) => ({ username: r.owner!.username, slug: r.slug }));
}

/* ── friends ──────────────────────────────────────────────────────────────── */

/** One work inside a Friends group: a favorite (note = their thought) or a list save (note = theirs). */
export interface FriendWork {
  id: string;
  profile_id: string;
  media_type: MediaType;
  title: string;
  creator: string;
  image_url: string | null;
  view_url: string | null;
  canonical_id: string | null;
  metadata: Item["metadata"];
  note: string;
  created_at: string;
}

/** A burst of one person's activity: their favorites that day, or their saves to one list. */
export interface FriendGroup {
  who: ProfileLite;
  kind: "favorite" | "save";
  list: { id: string; title: string; slug: string; created_at: string } | null;
  day: string;
  /** how many works the group holds (items carries the newest four) */
  n: number;
  last_at: string;
  items: FriendWork[];
}

/**
 * The Friends timeline for one viewer: what the people they follow favorited
 * and saved to public lists, grouped (friends_activity, migration31). All of
 * it is public, so it's cached like the feed and refreshed by the same tags —
 * anyone's favorite or save ("feed"), or the viewer following someone.
 */
export async function getFriendsActivity(
  viewer: string,
  offset = 0,
  limit = 20
): Promise<{ groups: FriendGroup[]; hasMore: boolean }> {
  "use cache";
  cacheLife("minutes");
  cacheTag("feed", `profile:${viewer}`);
  const { data, error } = await supabaseServer().rpc("friends_activity", {
    p_viewer: viewer,
    p_limit: limit + 1,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  type Row = {
    profile_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    kind: "favorite" | "save";
    list_id: string | null;
    list_title: string | null;
    list_slug: string | null;
    list_created_at: string | null;
    day: string;
    n: number;
    last_at: string;
    items: FriendWork[];
  };
  const rows = (data ?? []) as Row[];
  return {
    groups: rows.slice(0, limit).map((r) => ({
      who: { id: r.profile_id, username: r.username, display_name: r.display_name, avatar_url: r.avatar_url },
      kind: r.kind,
      list:
        r.list_id && r.list_slug
          ? { id: r.list_id, title: r.list_title ?? "", slug: r.list_slug, created_at: r.list_created_at ?? r.last_at }
          : null,
      day: r.day,
      n: r.n,
      last_at: r.last_at,
      items: r.items ?? [],
    })),
    hasMore: rows.length > limit,
  };
}

/* ── feed ─────────────────────────────────────────────────────────────────── */

export async function getFeed(opts: {
  viewer: string | null;
  types: MediaType[] | null;
  followingOnly: boolean;
  offset: number;
  limit: number;
}): Promise<FeedWork[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("feed");
  const { data, error } = await supabaseServer().rpc("feed_works", {
    p_viewer: opts.viewer,
    p_types: opts.types,
    p_following_only: opts.followingOnly,
    p_limit: opts.limit,
    p_offset: opts.offset,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as (FeedWork & { work_key: string })[]).map((r) => ({
    ...r,
    // feed rows are representative library copies — favoriting from a card
    // credits that copy's owner ("via @user")
    source_item_id: r.item_id,
    source_profile_id: r.item_profile_id,
  }));
}

/* ── item pages ───────────────────────────────────────────────────────────── */

export interface WorkPageData {
  /** a /item/fav/<id> link whose row has a canonical id → its shared page */
  canonicalRedirect?: string;
  work: FeedWork;
  /** everyone's copy, newest first, with the person and their thought */
  favorites: (Item & { profile: ProfileLite })[];
  /** public lists holding it */
  lists: (Pick<ListRow, "id" | "title" | "slug"> & { owner: ProfileLite; note: string; count?: number })[];
}

type ItemWithProfile = Item & { profile: ProfileLite | null };

/**
 * One work across every library. `key` is a canonical id, or "fav/<uuid>"
 * for works that never got one (links, photos, manual adds) — then the row's
 * type + title finds its siblings.
 */
export async function getWork(key: string): Promise<WorkPageData | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`work:${key}`, "feed");
  const db = supabaseServer();
  const sel = `*, profile:profiles!items_profile_id_fkey(${LITE})`;

  let rows: ItemWithProfile[] = [];
  if (key.startsWith("fav/")) {
    const id = key.slice(4);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data: one } = await db.from("items").select(sel).eq("id", id).maybeSingle();
    if (!one) return null;
    const base = one as ItemWithProfile;
    if (base.canonical_id) {
      // tagged works live on their shared page
      return { canonicalRedirect: base.canonical_id } as WorkPageData;
    }
    const { data: same } = await db
      .from("items")
      .select(sel)
      .eq("media_type", base.media_type)
      .ilike("title", base.title.trim().replace(/[\\%_]/g, "\\$&"))
      .is("canonical_id", null)
      .limit(200);
    rows = [base, ...((same ?? []) as ItemWithProfile[]).filter((r) => r.id !== base.id)];
  } else {
    const { data: canon } = await db.from("items").select(sel).eq("canonical_id", key).limit(200);
    rows = (canon ?? []) as ItemWithProfile[];
    if (!rows.length) return savedOnlyWork(key);
    // untagged copies of the same work (older rows, manual adds) belong here too
    const { data: untagged } = await db
      .from("items")
      .select(sel)
      .eq("media_type", rows[0].media_type)
      .ilike("title", rows[0].title.trim().replace(/[\\%_]/g, "\\$&"))
      .is("canonical_id", null)
      .limit(200);
    rows = [...rows, ...((untagged ?? []) as ItemWithProfile[])];
  }
  rows = rows
    .filter((r) => r.profile !== null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  // one copy per person (the newest)
  const seen = new Set<string>();
  const favorites = rows.filter((r) => (seen.has(r.profile_id) ? false : (seen.add(r.profile_id), true)));
  if (!favorites.length) return null;

  const rep = favorites.find((r) => r.image_url) ?? favorites[0];
  const keys = [rep.canonical_id, titleKey(rep.media_type, rep.title)].filter(Boolean) as string[];
  const { data: listRows } = await db
    .from("list_items")
    .select(`note, list:lists!inner(id, title, slug, is_public, owner:profiles!lists_profile_id_fkey(${LITE}))`)
    .in("work_key", keys)
    .eq("list.is_public", true)
    .limit(60);
  type LR = {
    note: string;
    list: Pick<ListRow, "id" | "title" | "slug"> & { owner: ProfileLite | null };
  };
  const lists = ((listRows ?? []) as unknown as LR[])
    .filter((r) => r.list?.owner)
    .map((r) => ({ id: r.list.id, title: r.list.title, slug: r.list.slug, owner: r.list.owner!, note: r.note }));

  const work: FeedWork = {
    work_key: rep.canonical_id ?? titleKey(rep.media_type, rep.title),
    media_type: rep.media_type,
    title: rep.title,
    creator: rep.creator,
    image_url: rep.image_url,
    view_url: rep.view_url ?? favorites.find((f) => f.view_url)?.view_url ?? null,
    year: rep.metadata?.year != null ? String(rep.metadata.year) : null,
    canonical_id: rep.canonical_id,
    metadata: rep.metadata,
    item_id: rep.id,
    item_profile_id: rep.profile_id,
    source_item_id: rep.id,
    source_profile_id: rep.profile_id,
    first_at: favorites[favorites.length - 1].created_at,
    last_at: favorites[0].created_at,
    fav_count: favorites.length,
    save_count: lists.length,
    favoriter_ids: favorites.map((f) => f.profile_id),
    saver_ids: [],
    top_profiles: favorites.slice(0, 3).map((f) => f.profile!),
  };
  return {
    work,
    favorites: favorites.map((f) => ({ ...f, profile: f.profile! })),
    lists,
  };
}

/**
 * A canonical work nobody has favorited yet but someone saved to a public
 * list — its page still exists (cover, lists, the actions), just no thoughts.
 */
async function savedOnlyWork(key: string): Promise<WorkPageData | null> {
  const db = supabaseServer();
  const { data } = await db
    .from("list_items")
    .select(`*, list:lists!inner(id, title, slug, is_public, owner:profiles!lists_profile_id_fkey(${LITE}))`)
    .eq("work_key", key)
    .eq("list.is_public", true)
    .order("created_at", { ascending: false })
    .limit(60);
  type Row = ListItem & { list: Pick<ListRow, "id" | "title" | "slug"> & { owner: ProfileLite | null } };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.list?.owner);
  if (!rows.length) return null;
  const rep = rows.find((r) => r.image_url) ?? rows[0];
  return {
    work: {
      work_key: key,
      media_type: rep.media_type,
      title: rep.title,
      creator: rep.creator,
      image_url: rep.image_url,
      view_url: rep.view_url ?? rows.find((r) => r.view_url)?.view_url ?? null,
      year: rep.metadata?.year != null ? String(rep.metadata.year) : null,
      canonical_id: key,
      metadata: rep.metadata,
      item_id: "",
      item_profile_id: "",
      first_at: rows[rows.length - 1].created_at,
      last_at: rows[0].created_at,
      fav_count: 0,
      save_count: rows.length,
      favoriter_ids: [],
      saver_ids: rows.map((r) => r.profile_id),
      top_profiles: [],
    },
    favorites: [],
    lists: rows.map((r) => ({ id: r.list.id, title: r.list.title, slug: r.list.slug, owner: r.list.owner!, note: r.note })),
  };
}

/** The most-loved works, prerendered at build time. */
export async function getPopularWorkKeys(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  const { data } = await supabaseServer()
    .from("items")
    .select("canonical_id")
    .not("canonical_id", "is", null)
    .limit(2000);
  const n = new Map<string, number>();
  for (const r of (data ?? []) as { canonical_id: string }[]) n.set(r.canonical_id, (n.get(r.canonical_id) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([k]) => k);
}

/* ── the landing page's "walls already up" ──────────────────────────────── */

export interface LandingWall {
  who: ProfileLite;
  count: number;
  /** their Top four (pinned first, then their own order) */
  covers: Pick<Item, "id" | "media_type" | "title" | "image_url" | "view_url">[];
}

/**
 * Three real pages for the landing page, rotated daily among the fullest
 * walls (a photo, 12+ favorites, four covers to show). Public data only.
 */
export async function getLandingWalls(): Promise<LandingWall[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("feed");
  const day = new Date().toISOString().slice(0, 10);
  const db = supabaseServer();
  const { data } = await db
    .from("items")
    .select("id, profile_id, media_type, title, image_url, view_url")
    .not("image_url", "is", null)
    .neq("media_type", "photo")
    .order("pinned_order", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .limit(5000);
  const byPerson = new Map<string, { count: number; covers: LandingWall["covers"] }>();
  for (const r of (data ?? []) as (LandingWall["covers"][number] & { profile_id: string })[]) {
    let w = byPerson.get(r.profile_id);
    if (!w) byPerson.set(r.profile_id, (w = { count: 0, covers: [] }));
    w.count++;
    if (w.covers.length < 4) w.covers.push({ id: r.id, media_type: r.media_type, title: r.title, image_url: r.image_url, view_url: r.view_url });
  }
  const full = [...byPerson.entries()].filter(([, w]) => w.count >= 12 && w.covers.length === 4).map(([id]) => id);
  if (!full.length) return [];
  const { data: people } = await db.from("profiles").select(LITE).in("id", full).not("avatar_url", "is", null);
  const seeded = (x: string) => {
    let h = 2166136261;
    for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  return ((people ?? []) as ProfileLite[])
    .sort((a, b) => seeded(day + a.id) - seeded(day + b.id))
    .slice(0, 3)
    .map((who) => ({ who, count: byPerson.get(who.id)!.count, covers: byPerson.get(who.id)!.covers }));
}

/* ── community picks (Home for visitors, and the top-up for members) ─────── */

export interface CommunityPick {
  item: Item;
  by: ProfileLite;
  /** how many people have this work on their wall */
  count: number;
}

/**
 * Today's community picks. The day is read inside the cached scope, so the
 * set refreshes with the hourly revalidation and rolls over at (UTC) midnight
 * without any request-time code on the Home page.
 */
export async function getTodayCommunityPicks(): Promise<{ day: string; picks: CommunityPick[] }> {
  "use cache";
  cacheLife("hours");
  cacheTag("feed");
  const day = new Date().toISOString().slice(0, 10);
  return { day, picks: await getCommunityPicks(day) };
}

/**
 * Five real favorites with real thoughts, one per medium where possible,
 * rotated daily (deterministic per day — everyone sees the same five).
 */
export async function getCommunityPicks(day: string): Promise<CommunityPick[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("feed");
  const { data } = await supabaseServer()
    .from("items")
    .select(`*, profile:profiles!items_profile_id_fkey(${LITE})`)
    .not("image_url", "is", null)
    .neq("media_type", "photo")
    .order("created_at", { ascending: false })
    .limit(1500);
  const rows = ((data ?? []) as ItemWithProfile[]).filter((r) => {
    const t = (r.description ?? "").trim();
    return r.profile && t.length >= 12 && t.length <= 180;
  });
  // popularity per work, so a pick can say "and 4 others"
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as Item[]) {
    const k = r.canonical_id ?? titleKey(r.media_type, r.title);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  // deterministic shuffle keyed by the day
  const seeded = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  const workKey = (r: Item) => r.canonical_id ?? titleKey(r.media_type, r.title);
  const buckets: MediaType[][] = [["music"], ["book"], ["movie", "tv"], ["podcast", "article", "video"]];
  const choose = (d: string, skip: Set<string>): ItemWithProfile[] => {
    const shuffled = rows
      .filter((r) => !skip.has(workKey(r)))
      .map((r) => ({ r, h: seeded(d + r.id) }))
      .sort((a, b) => a.h - b.h)
      .map((x) => x.r);
    const picks: ItemWithProfile[] = [];
    const usedPeople = new Set<string>();
    const usedWorks = new Set<string>();
    const take = (r: ItemWithProfile) => {
      picks.push(r);
      usedPeople.add(r.profile_id);
      usedWorks.add(workKey(r));
    };
    for (const b of buckets) {
      const hit = shuffled.find(
        (r) => b.includes(r.media_type) && !usedPeople.has(r.profile_id) && !usedWorks.has(workKey(r))
      );
      if (hit) take(hit);
    }
    for (const r of shuffled) {
      if (picks.length >= 5) break;
      if (!usedPeople.has(r.profile_id) && !usedWorks.has(workKey(r))) take(r);
    }
    return picks;
  };
  // the last two weeks' picks sit today out, so Home and the daily email don't
  // repeat themselves (each past day re-derived from today's pool)
  const recent = new Set<string>();
  for (let n = 1; n <= 14; n++) {
    const prev = new Date(Date.parse(day) - n * 864e5).toISOString().slice(0, 10);
    for (const r of choose(prev, new Set())) recent.add(workKey(r));
  }
  let picks = choose(day, recent);
  if (picks.length < 5) picks = choose(day, new Set()); // a thin pool repeats rather than comes up short
  return picks.map(({ profile, ...item }) => ({
    item: item as Item,
    by: profile!,
    count: counts.get(item.canonical_id ?? titleKey(item.media_type, item.title)) ?? 1,
  }));
}
