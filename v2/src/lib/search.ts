"use client";

import { supabase, authHeaders } from "./supabase";
import { escapeLike, PROFILE_COLS } from "./social";
import type { FeedWork, Item, Profile, ProfileLite, SearchResult } from "./types";
import { titleKey } from "./work";

export type SearchHits = {
  people: Profile[];
  /** works already on Favorite (with who has them) */
  works: FeedWork[];
  /** catalog matches not necessarily on Favorite yet */
  catalog: SearchResult[];
};

type ItemWithProfile = Item & { profile: ProfileLite | null };

/**
 * One query, everything: people, favorites already on Favorite (grouped into
 * works, like the feed), and the external catalogs (signed-in only — that
 * route spends upstream quota).
 */
export async function searchEverything(query: string, signal: AbortSignal): Promise<SearchHits> {
  const db = supabase();
  // commas/parens are .or() syntax ("Her (2013)" would 400); escape wildcards
  const safe = escapeLike(query.replace(/[(),]/g, " "));
  const [{ data: profiles }, { data: items }, catalog] = await Promise.all([
    db
      .from("profiles")
      .select(PROFILE_COLS)
      .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
      .limit(6)
      .abortSignal(signal),
    db
      .from("items")
      .select("*, profile:profiles!items_profile_id_fkey(id, username, display_name, avatar_url)")
      .or(`title.ilike.%${safe}%,creator.ilike.%${safe}%`)
      .neq("media_type", "photo")
      .order("created_at", { ascending: false })
      .limit(60)
      .abortSignal(signal),
    authHeaders()
      .then((h) =>
        h.Authorization
          ? fetch(`/api/search?q=${encodeURIComponent(query)}&type=all`, { headers: h, signal })
          : null
      )
      .then((r) => (r && r.ok ? r.json() : { results: [] }))
      .then((j) => (j.results ?? []) as SearchResult[])
      .catch(() => [] as SearchResult[]),
  ]);

  // fold copies into works, newest first
  const byKey = new Map<string, FeedWork>();
  for (const it of ((items ?? []) as ItemWithProfile[]).filter((i) => i.profile)) {
    const key = it.canonical_id ?? titleKey(it.media_type, it.title);
    const w = byKey.get(key);
    if (w) {
      if (!w.favoriter_ids.includes(it.profile_id)) {
        w.favoriter_ids.push(it.profile_id);
        w.fav_count += 1;
        if (w.top_profiles.length < 3) w.top_profiles.push(it.profile!);
      }
      if (!w.image_url && it.image_url) w.image_url = it.image_url;
      continue;
    }
    byKey.set(key, {
      work_key: key,
      media_type: it.media_type,
      title: it.title,
      creator: it.creator,
      image_url: it.image_url,
      view_url: it.view_url,
      year: it.metadata?.year != null ? String(it.metadata.year) : null,
      canonical_id: it.canonical_id,
      metadata: it.metadata,
      item_id: it.id,
      item_profile_id: it.profile_id,
      source_item_id: it.id,
      source_profile_id: it.profile_id,
      first_at: it.created_at,
      last_at: it.created_at,
      fav_count: 1,
      save_count: 0,
      favoriter_ids: [it.profile_id],
      saver_ids: [],
      top_profiles: [it.profile!],
    });
  }
  const works = [...byKey.values()];
  const onFavorite = new Set(works.flatMap((w) => [w.work_key, titleKey(w.media_type, w.title)]));
  return {
    people: (profiles ?? []) as Profile[],
    works,
    // catalog hits already covered by a Favorite work would just repeat
    catalog: catalog.filter(
      (r) => !onFavorite.has(r.canonical_id ?? "") && !onFavorite.has(titleKey(r.media_type, r.title))
    ),
  };
}
