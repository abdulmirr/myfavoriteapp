"use client";

import { useSyncExternalStore } from "react";
import { supabase, authHeaders } from "./supabase";
import { PROFILE_COLS, fetchFollowing, friendlyError, unreadCount } from "./social";
import type { Item, ListItem, ListRow, MediaType, Profile, Work } from "./types";
import { primaryKey, slugify, workKeys } from "./work";

/**
 * The signed-in viewer, loaded once per session and shared by every component:
 * profile, who they follow, what they've favorited, their lists, unread count.
 *
 * A snapshot persists to localStorage, so a returning visitor paints their
 * personal state (stars, bookmarks, avatar, greeting) on the very first
 * client render — no waterfall — while a background refresh catches up.
 * All personal writes go through the actions below: optimistic first, then
 * the database, then a revalidation ping so cached public pages refresh.
 */

export interface MyList {
  id: string;
  title: string;
  slug: string;
  is_public: boolean;
  updated_at: string;
  cover_image_url: string | null;
  count: number;
  /** newest item covers (the mosaic + the save dialog thumb) */
  covers: string[];
}

export interface ViewerState {
  /** unknown = not checked yet (server render, first client frame) */
  status: "unknown" | "signed-out" | "signed-in";
  userId: string | null;
  profile: Profile | null;
  /** false only once we know onboarding hasn't finished */
  onboarded: boolean;
  following: Profile[];
  followingIds: Set<string>;
  /** any work key → my library item id */
  favorites: Map<string, string>;
  lists: MyList[];
  /** any work key → ids of my lists holding it */
  membership: Map<string, Set<string>>;
  unread: number;
  /** personal data is from the cached snapshot and a refresh is running */
  stale: boolean;
}

const EMPTY: ViewerState = {
  status: "unknown",
  userId: null,
  profile: null,
  onboarded: true,
  following: [],
  followingIds: new Set(),
  favorites: new Map(),
  lists: [],
  membership: new Map(),
  unread: 0,
  stale: false,
};

const SNAPSHOT_KEY = "fav2:viewer";

type Snapshot = {
  v: 1;
  userId: string;
  profile: Profile;
  onboarded: boolean;
  following: Profile[];
  favorites: [string, string][];
  lists: MyList[];
  membership: [string, string[]][];
  unread: number;
};

let state: ViewerState = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setState(patch: Partial<ViewerState>) {
  state = { ...state, ...patch };
  emit();
  schedulePersist();
}

let persistQueued = false;
function schedulePersist() {
  if (persistQueued || typeof window === "undefined") return;
  persistQueued = true;
  queueMicrotask(() => {
    persistQueued = false;
    try {
      if (state.status !== "signed-in" || !state.userId || !state.profile) {
        localStorage.removeItem(SNAPSHOT_KEY);
        return;
      }
      const snap: Snapshot = {
        v: 1,
        userId: state.userId,
        profile: state.profile,
        onboarded: state.onboarded,
        following: state.following,
        favorites: [...state.favorites],
        lists: state.lists,
        membership: [...state.membership].map(([k, v]) => [k, [...v]]),
        unread: state.unread,
      };
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
    } catch {
      /* storage full or blocked — next visit just starts cold */
    }
  });
}

/** Read the last snapshot (client only). Shown until the refresh lands. */
function readSnapshot(): ViewerState | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Snapshot;
    if (s.v !== 1 || !s.userId || !s.profile) return null;
    return {
      status: "signed-in",
      userId: s.userId,
      profile: s.profile,
      onboarded: s.onboarded,
      following: s.following ?? [],
      followingIds: new Set((s.following ?? []).map((p) => p.id)),
      favorites: new Map(s.favorites ?? []),
      lists: s.lists ?? [],
      membership: new Map((s.membership ?? []).map(([k, v]) => [k, new Set(v)])),
      unread: s.unread ?? 0,
      stale: true,
    };
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const getServerSnapshot = () => EMPTY;

/** The viewer, live. Server render + first hydration frame see `unknown`. */
export function useViewer(): ViewerState {
  return useSyncExternalStore(subscribe, () => state, getServerSnapshot);
}

/** Non-hook access for event handlers. */
export function viewer(): ViewerState {
  return state;
}

/* ── boot ──────────────────────────────────────────────────────────────────── */

let started = false;

function setAuthAttr(on: boolean) {
  document.documentElement.dataset.auth = on ? "in" : "out";
}

/** Called once by <ViewerBoot/> in the root layout. */
export function startViewer() {
  if (started || typeof window === "undefined") return;
  started = true;
  const cached = readSnapshot();
  if (cached) {
    state = cached;
    emit();
  }
  const db = supabase();
  db.auth.getSession().then(({ data }) => onSession(data.session?.user?.id ?? null));
  db.auth.onAuthStateChange((event, session) => {
    const uid = session?.user?.id ?? null;
    if (uid !== state.userId || event === "SIGNED_IN") void onSession(uid);
  });
}

let loadSeq = 0;

async function onSession(uid: string | null) {
  if (!uid) {
    setAuthAttr(false);
    state = { ...EMPTY, status: "signed-out" };
    emit();
    schedulePersist();
    return;
  }
  setAuthAttr(true);
  if (state.userId !== uid) {
    // a different account than the snapshot (shared browser) — start clean
    state = { ...EMPTY, status: "signed-in", userId: uid, stale: true };
    emit();
  }
  await refreshViewer();
}

/** Reload everything personal. Safe to call any time (latest call wins). */
export async function refreshViewer(): Promise<void> {
  const uid = state.userId;
  if (!uid) return;
  const seq = ++loadSeq;
  const db = supabase();

  // the claim trigger links the profile on email confirmation — a brand-new
  // account can beat it by a moment, so retry briefly before giving up
  type PrivRow = { onboarded_at: string | null };
  type ProfRow = Profile & { profile_private?: PrivRow | PrivRow[] | null };
  let prof: ProfRow | null = null;
  let profErr = false;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await db
      .from("profiles")
      .select(`${PROFILE_COLS}, profile_private(onboarded_at)`)
      .eq("user_id", uid)
      .maybeSingle();
    profErr = !!error;
    if (data || error) {
      prof = (data as unknown as ProfRow) ?? null;
      break;
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  if (seq !== loadSeq) return;
  if (!prof) {
    setState({ status: "signed-in", profile: null, stale: false });
    return;
  }
  // one-to-one embeds come back as an object, though the types say array
  const priv = Array.isArray(prof.profile_private) ? prof.profile_private[0] : prof.profile_private;
  const { profile_private: _p, ...profile } = prof;
  // a failed private read must never trap an onboarded user in /welcome
  const onboarded = profErr || !!priv?.onboarded_at;

  const [following, mine, lists, members, unread] = await Promise.all([
    fetchFollowing(profile.id),
    db.from("items").select("id, media_type, title, canonical_id").eq("profile_id", profile.id),
    db
      .from("lists")
      .select("id, title, slug, is_public, updated_at, cover_image_url")
      .eq("profile_id", profile.id)
      .order("updated_at", { ascending: false }),
    db
      .from("list_items")
      .select("list_id, work_key, media_type, title, canonical_id, image_url")
      .eq("profile_id", profile.id)
      .order("position", { ascending: true }),
    unreadCount(profile.id),
  ]);
  if (seq !== loadSeq) return;

  const favorites = new Map<string, string>();
  for (const it of (mine.data ?? []) as Pick<Item, "id" | "media_type" | "title" | "canonical_id">[]) {
    for (const k of workKeys(it)) favorites.set(k, it.id);
  }

  const membership = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  const covers = new Map<string, string[]>();
  type MemberRow = {
    list_id: string;
    work_key: string;
    media_type: MediaType;
    title: string;
    canonical_id: string | null;
    image_url: string | null;
  };
  for (const r of (members.data ?? []) as MemberRow[]) {
    for (const k of workKeys(r)) {
      let s = membership.get(k);
      if (!s) membership.set(k, (s = new Set()));
      s.add(r.list_id);
    }
    counts.set(r.list_id, (counts.get(r.list_id) ?? 0) + 1);
    const c = covers.get(r.list_id) ?? [];
    if (r.image_url && c.length < 4) c.push(r.image_url);
    covers.set(r.list_id, c);
  }

  const myLists: MyList[] = ((lists.data ?? []) as ListRow[]).map((l) => ({
    id: l.id,
    title: l.title,
    slug: l.slug,
    is_public: l.is_public,
    updated_at: l.updated_at,
    cover_image_url: l.cover_image_url,
    count: counts.get(l.id) ?? 0,
    covers: covers.get(l.id) ?? [],
  }));

  setState({
    status: "signed-in",
    profile: profile as Profile,
    onboarded,
    following,
    followingIds: new Set(following.map((p) => p.id)),
    favorites,
    lists: myLists,
    membership,
    unread,
    stale: false,
  });
}

/* ── helpers for components ────────────────────────────────────────────────── */

export function isFavorited(v: ViewerState, w: Parameters<typeof workKeys>[0]): boolean {
  return workKeys(w).some((k) => v.favorites.has(k));
}

export function myItemId(v: ViewerState, w: Parameters<typeof workKeys>[0]): string | null {
  for (const k of workKeys(w)) {
    const id = v.favorites.get(k);
    if (id) return id;
  }
  return null;
}

export function listsHolding(v: ViewerState, w: Parameters<typeof workKeys>[0]): Set<string> {
  const out = new Set<string>();
  for (const k of workKeys(w)) for (const id of v.membership.get(k) ?? []) out.add(id);
  return out;
}

/** Ask the server to refresh cached public pages touched by a write. */
export function revalidate(tags: string[]) {
  void authHeaders().then((h) =>
    fetch("/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...h },
      body: JSON.stringify({ tags }),
      keepalive: true,
    }).catch(() => {})
  );
}

function requireProfile(): Profile {
  const p = state.profile;
  if (!p) throw new Error("Sign in first.");
  return p;
}

/* ── favorites ─────────────────────────────────────────────────────────────── */

/** Put a work on the viewer's wall (optionally with a thought). Returns the new item id. */
export async function favorite(work: Work, thoughts = ""): Promise<string> {
  const me = requireProfile();
  const keys = workKeys(work);
  const before = new Map(state.favorites);
  const optimistic = new Map(state.favorites);
  for (const k of keys) optimistic.set(k, "pending");
  setState({ favorites: optimistic });

  try {
    const db = supabase();
    const { data: top } = await db
      .from("items")
      .select("sort_order")
      .eq("profile_id", me.id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const viaOk =
      !!work.source_item_id && !!work.source_profile_id && work.source_profile_id !== me.id;
    const metadata = {
      ...(work.metadata ?? {}),
      ...(work.year ? { year: work.year } : {}),
    };
    const base = {
      profile_id: me.id,
      media_type: work.media_type,
      title: work.title,
      creator: work.creator ?? "",
      description: thoughts.trim(),
      image_url: work.image_url,
      view_url: work.view_url,
      metadata,
      canonical_id: work.canonical_id ?? null,
      sort_order: ((top?.[0] as { sort_order: number } | undefined)?.sort_order ?? -1) + 1,
    };
    const row: Record<string, unknown> = viaOk
      ? { ...base, via_profile_id: work.source_profile_id, source_item_id: work.source_item_id }
      : base;
    let res = await db.from("items").insert(row).select("id").single();
    // the source copy vanished since the card loaded — keep the favorite,
    // drop the attribution
    if (res.error?.code === "23514" && viaOk) {
      res = await db.from("items").insert(base).select("id").single();
    }
    if (res.error) throw new Error(friendlyError(res.error.message));
    const id = (res.data as { id: string }).id;
    const next = new Map(state.favorites);
    for (const k of keys) next.set(k, id);
    setState({ favorites: next });
    revalidate([`profile:${me.id}`, "feed", `work:${primaryKey(work)}`]);
    return id;
  } catch (e) {
    setState({ favorites: before });
    throw e;
  }
}

/** Take a work off the wall. Returns the deleted row so the caller can undo. */
export async function unfavorite(work: Work): Promise<Item | null> {
  const me = requireProfile();
  const id = myItemId(state, work);
  if (!id || id === "pending") return null;
  const before = new Map(state.favorites);
  const next = new Map(state.favorites);
  for (const [k, v] of next) if (v === id) next.delete(k);
  setState({ favorites: next });
  const db = supabase();
  const { data: row } = await db.from("items").select("*").eq("id", id).maybeSingle();
  const { error } = await db.from("items").delete().eq("id", id);
  if (error) {
    setState({ favorites: before });
    throw new Error(friendlyError(error.message));
  }
  revalidate([`profile:${me.id}`, "feed", `work:${primaryKey(work)}`]);
  return (row as Item) ?? null;
}

/** Undo for unfavorite: put the exact row back (provenance and order kept). */
export async function restoreFavorite(row: Item): Promise<void> {
  const me = requireProfile();
  // the exact row minus its id — created_at and sort_order come back as they
  // were, so the wall order and the activity timeline stay truthful
  const { id: _id, ...rest } = row as Item & Record<string, unknown>;
  let { data, error } = await supabase().from("items").insert(rest).select("id").single();
  if (error?.code === "23514") {
    const { via_profile_id: _v, source_item_id: _s, ...plain } = rest as Record<string, unknown>;
    ({ data, error } = await supabase().from("items").insert(plain).select("id").single());
  }
  if (error) throw new Error(friendlyError(error.message));
  const next = new Map(state.favorites);
  for (const k of workKeys(row)) next.set(k, (data as { id: string }).id);
  setState({ favorites: next });
  revalidate([`profile:${me.id}`, "feed", `work:${primaryKey(row)}`]);
}

/* ── lists ─────────────────────────────────────────────────────────────────── */

/** Create a list owned by the viewer. Slugs are unique per person. */
export async function createList(input: {
  title: string;
  isPublic: boolean;
  description?: string;
}): Promise<MyList> {
  const me = requireProfile();
  const title = input.title.trim().slice(0, 80);
  if (!title) throw new Error("Give your list a name.");
  const taken = new Set(state.lists.map((l) => l.slug));
  const base = slugify(title);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  const { data, error } = await supabase()
    .from("lists")
    .insert({
      profile_id: me.id,
      title,
      slug,
      is_public: input.isPublic,
      description: (input.description ?? "").trim().slice(0, 280),
    })
    .select("id, title, slug, is_public, updated_at, cover_image_url")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("You already have a list with that address.");
    throw new Error(friendlyError(error.message));
  }
  const list: MyList = { ...(data as Omit<MyList, "count" | "covers">), count: 0, covers: [] };
  setState({ lists: [list, ...state.lists] });
  revalidate([`profile:${me.id}`]);
  return list;
}

export async function updateList(
  id: string,
  patch: Partial<Pick<ListRow, "title" | "slug" | "description" | "is_public" | "show_added" | "cover_image_url">>
): Promise<void> {
  const me = requireProfile();
  const { error } = await supabase().from("lists").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("That URL is already used by another of your lists.");
    throw new Error(friendlyError(error.message));
  }
  setState({
    lists: state.lists.map((l) => (l.id === id ? { ...l, ...patch, updated_at: new Date().toISOString() } : l)),
  });
  revalidate([`profile:${me.id}`, `list:${id}`, "feed"]);
}

export async function deleteList(id: string): Promise<void> {
  const me = requireProfile();
  const { error } = await supabase().from("lists").delete().eq("id", id);
  if (error) throw new Error(friendlyError(error.message));
  const membership = new Map<string, Set<string>>();
  for (const [k, s] of state.membership) {
    const next = new Set([...s].filter((x) => x !== id));
    if (next.size) membership.set(k, next);
  }
  setState({ lists: state.lists.filter((l) => l.id !== id), membership });
  revalidate([`profile:${me.id}`, `list:${id}`, "feed"]);
}

/** The notes the viewer left on this work, per list (for the save dialog). */
export async function fetchMyNotes(work: Work): Promise<Map<string, string>> {
  const me = state.profile;
  if (!me) return new Map();
  const { data } = await supabase()
    .from("list_items")
    .select("list_id, note")
    .eq("profile_id", me.id)
    .in("work_key", workKeys(work));
  return new Map(((data ?? []) as { list_id: string; note: string }[]).map((r) => [r.list_id, r.note]));
}

/**
 * Apply the save dialog: put the work in exactly `selected` lists (with these
 * notes), take it out of the rest. Only changed rows are written.
 */
export async function setListsForWork(
  work: Work,
  selected: Set<string>,
  notes: Map<string, string>,
  previousNotes: Map<string, string>
): Promise<void> {
  const me = requireProfile();
  const db = supabase();
  const holding = listsHolding(state, work);
  const keys = workKeys(work);
  const touched = new Set<string>();

  const adds = [...selected].filter((id) => !holding.has(id));
  const removes = [...holding].filter((id) => !selected.has(id));
  const noteEdits = [...selected].filter(
    (id) => holding.has(id) && (notes.get(id) ?? "").trim() !== (previousNotes.get(id) ?? "").trim()
  );

  const viaOk =
    !!work.source_item_id && !!work.source_profile_id && work.source_profile_id !== me.id;

  for (const listId of adds) {
    const row = {
      list_id: listId,
      profile_id: me.id,
      media_type: work.media_type,
      title: work.title,
      creator: work.creator ?? "",
      image_url: work.image_url,
      view_url: work.view_url,
      metadata: { ...(work.metadata ?? {}), ...(work.year ? { year: work.year } : {}) },
      canonical_id: work.canonical_id ?? null,
      note: (notes.get(listId) ?? "").trim().slice(0, 280),
      via_profile_id: viaOk ? work.source_profile_id : null,
      source_item_id: viaOk ? work.source_item_id : null,
    };
    const { error } = await db.from("list_items").insert(row);
    // 23505: it's already there under another key spelling — fine
    if (error && error.code !== "23505") throw new Error(friendlyError(error.message));
    touched.add(listId);
  }
  for (const listId of removes) {
    const { error } = await db
      .from("list_items")
      .delete()
      .eq("list_id", listId)
      .in("work_key", keys);
    if (error) throw new Error(friendlyError(error.message));
    touched.add(listId);
  }
  for (const listId of noteEdits) {
    const { error } = await db
      .from("list_items")
      .update({ note: (notes.get(listId) ?? "").trim().slice(0, 280) })
      .eq("list_id", listId)
      .in("work_key", keys);
    if (error) throw new Error(friendlyError(error.message));
    touched.add(listId);
  }
  if (!touched.size) return;

  // mirror the result locally
  const membership = new Map(state.membership);
  for (const k of keys) {
    const s = new Set(membership.get(k) ?? []);
    for (const id of adds) s.add(id);
    for (const id of removes) s.delete(id);
    if (s.size) membership.set(k, s);
    else membership.delete(k);
  }
  const now = new Date().toISOString();
  const lists = state.lists
    .map((l) => {
      if (!touched.has(l.id)) return l;
      const delta = (adds.includes(l.id) ? 1 : 0) - (removes.includes(l.id) ? 1 : 0);
      const covers =
        adds.includes(l.id) && work.image_url
          ? [work.image_url, ...l.covers.filter((c) => c !== work.image_url)].slice(0, 4)
          : l.covers;
      return { ...l, count: Math.max(0, l.count + delta), covers, updated_at: now };
    })
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  setState({ membership, lists });
  revalidate([
    `profile:${me.id}`,
    "feed",
    `work:${primaryKey(work)}`,
    ...[...touched].map((id) => `list:${id}`),
  ]);
}

/* ── one list's rows (the list page) ───────────────────────────────────────── */

/** Mirror one row joining or leaving one of my lists in the local store. */
function mirrorRow(work: Work, listId: string, joined: boolean) {
  const keys = workKeys(work);
  const membership = new Map(state.membership);
  for (const k of keys) {
    const s = new Set(membership.get(k) ?? []);
    if (joined) s.add(listId);
    else s.delete(listId);
    if (s.size) membership.set(k, s);
    else membership.delete(k);
  }
  const now = new Date().toISOString();
  const lists = state.lists
    .map((l) => {
      if (l.id !== listId) return l;
      const covers =
        joined && work.image_url
          ? [work.image_url, ...l.covers.filter((c) => c !== work.image_url)].slice(0, 4)
          : l.covers;
      return { ...l, count: Math.max(0, l.count + (joined ? 1 : -1)), covers, updated_at: now };
    })
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  setState({ membership, lists });
}

function listTags(me: Profile, listId: string, work?: Work) {
  revalidate([`profile:${me.id}`, `list:${listId}`, "feed", ...(work ? [`work:${primaryKey(work)}`] : [])]);
}

/** Put one work straight into one of my lists (the list page's Add). Returns the new row. */
export async function addToList(work: Work, listId: string, note = ""): Promise<ListItem> {
  const me = requireProfile();
  const viaOk =
    !!work.source_item_id && !!work.source_profile_id && work.source_profile_id !== me.id;
  const { data, error } = await supabase()
    .from("list_items")
    .insert({
      list_id: listId,
      profile_id: me.id,
      media_type: work.media_type,
      title: work.title,
      creator: work.creator ?? "",
      image_url: work.image_url,
      view_url: work.view_url,
      metadata: { ...(work.metadata ?? {}), ...(work.year ? { year: work.year } : {}) },
      canonical_id: work.canonical_id ?? null,
      note: note.trim().slice(0, 280),
      via_profile_id: viaOk ? work.source_profile_id : null,
      source_item_id: viaOk ? work.source_item_id : null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("That's already in this list.");
    throw new Error(friendlyError(error.message));
  }
  mirrorRow(work, listId, true);
  listTags(me, listId, work);
  return data as ListItem;
}

/** Finish / unfinish, rewrite the note, or move one of my rows. */
export async function updateListItem(
  item: Pick<ListItem, "id" | "list_id">,
  patch: Partial<Pick<ListItem, "note" | "position" | "done_at">>
): Promise<void> {
  const me = requireProfile();
  const { error } = await supabase().from("list_items").update(patch).eq("id", item.id);
  if (error) throw new Error(friendlyError(error.message));
  listTags(me, item.list_id);
}

/** Take a row out of my list. The caller keeps the row for Undo. */
export async function removeListItem(item: ListItem): Promise<void> {
  const me = requireProfile();
  const { error } = await supabase().from("list_items").delete().eq("id", item.id);
  if (error) throw new Error(friendlyError(error.message));
  mirrorRow(item, item.list_id, false);
  listTags(me, item.list_id, item);
}

/** Undo for removeListItem: the exact row back — order, note and dates as they were. */
export async function restoreListItem(item: ListItem): Promise<void> {
  const me = requireProfile();
  // work_key is generated by the database, so it can't be written back
  const { work_key: _k, year: _y, source_profile_id: _s, ...row } = item as ListItem & Record<string, unknown>;
  const { error } = await supabase().from("list_items").insert(row);
  if (error && error.code !== "23505") throw new Error(friendlyError(error.message));
  mirrorRow(item, item.list_id, true);
  listTags(me, item.list_id, item);
}

/* ── follows ───────────────────────────────────────────────────────────────── */

export async function follow(target: Profile): Promise<void> {
  const me = requireProfile();
  if (state.followingIds.has(target.id)) return;
  setState({
    following: [...state.following, target],
    followingIds: new Set([...state.followingIds, target.id]),
  });
  const { error } = await supabase()
    .from("follows")
    .insert({ follower_id: me.id, followee_id: target.id });
  if (error && error.code !== "23505") {
    setState({
      following: state.following.filter((p) => p.id !== target.id),
      followingIds: new Set([...state.followingIds].filter((id) => id !== target.id)),
    });
    throw new Error(friendlyError(error.message));
  }
  revalidate([`profile:${me.id}`, `profile:${target.id}`]);
}

export async function unfollow(targetId: string): Promise<void> {
  const me = requireProfile();
  const prev = state.following;
  setState({
    following: prev.filter((p) => p.id !== targetId),
    followingIds: new Set([...state.followingIds].filter((id) => id !== targetId)),
  });
  const { error } = await supabase()
    .from("follows")
    .delete()
    .eq("follower_id", me.id)
    .eq("followee_id", targetId);
  if (error) {
    setState({ following: prev, followingIds: new Set(prev.map((p) => p.id)) });
    throw new Error(friendlyError(error.message));
  }
  revalidate([`profile:${me.id}`, `profile:${targetId}`]);
}

/* ── misc ──────────────────────────────────────────────────────────────────── */

export function setUnread(n: number) {
  setState({ unread: n });
}

export function patchProfile(patch: Partial<Profile>) {
  if (!state.profile) return;
  setState({ profile: { ...state.profile, ...patch } });
}

export function markOnboarded() {
  setState({ onboarded: true });
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {}
  setAuthAttr(false);
  state = { ...EMPTY, status: "signed-out" };
  emit();
}
