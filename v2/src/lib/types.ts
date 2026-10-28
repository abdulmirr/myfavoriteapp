export type MediaType =
  | "book" | "movie" | "tv" | "music" | "podcast" | "video" | "article" | "photo" | "other";

export interface Profile {
  id: string;
  user_id: string | null;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  socials: { label: string; url: string }[];
  /** the banner across the top of their page (null → their top covers, blurred) */
  header_url: string | null;
}

export interface Item {
  id: string;
  profile_id: string;
  media_type: MediaType;
  title: string;
  creator: string;
  description: string;
  image_url: string | null;
  view_url: string | null;
  metadata: { year?: string | number } & Record<string, unknown>;
  /** source-prefixed cross-library identity (tmdb:movie:603, itunes:123, ol:/works/…); null for URL/photo/manual items */
  canonical_id: string | null;
  /** 1–4 when pinned to the profile's Top 4 hero row */
  pinned_order: number | null;
  /** who this favorite was taken from ("via @user") and the exact source row */
  via_profile_id?: string | null;
  source_item_id?: string | null;
  sort_order: number;
  pos_x: number | null;
  pos_y: number | null;
  pos_rot: number | null;
  created_at: string;
}

/**
 * "For You" taste gate: a category's picks unlock at REC_MIN_PER_CATEGORY
 * saved items of its types — below that the model is guessing, and the UI
 * says so instead. Any one unlocked category unlocks the page, so a fresh
 * onboarding graduate with 3 books sees book picks the next morning.
 */
export const REC_MIN_PER_CATEGORY = 3;

export type RecCategoryKey = "music" | "books" | "filmtv" | "reading";

export const REC_CATEGORIES: { key: RecCategoryKey; types: MediaType[] }[] = [
  { key: "music", types: ["music"] },
  { key: "books", types: ["book"] },
  { key: "filmtv", types: ["movie", "tv"] },
  { key: "reading", types: ["article", "other", "podcast"] },
];

/** how many favorites the viewer has in each category — drives the gates above */
export type RecCounts = Record<RecCategoryKey, number>;

/** One AI pick in the daily "For You" set. */
export interface Recommendation {
  media_type: MediaType;
  title: string;
  creator: string;
  year: string;
  reason: string;
  image_url: string | null;
  view_url: string | null;
}

/* ── v2 ─────────────────────────────────────────────────────────────────────── */

/** The public slice of a profile carried on cards (avatars, names, links). */
export type ProfileLite = Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;

/**
 * Anything a card can show and act on: a feed work, a daily pick, a list
 * entry, a search result, someone's favorite. Favoriting copies these fields
 * into the viewer's library; saving copies them into a list.
 */
export interface Work {
  media_type: MediaType;
  title: string;
  creator: string;
  image_url: string | null;
  view_url: string | null;
  year?: string | null;
  canonical_id: string | null;
  /** the feed's grouping key (canonical id, else "type|title") when known */
  work_key?: string | null;
  metadata?: Record<string, unknown>;
  /** a real library row for this work — powers "via @user" provenance */
  source_item_id?: string | null;
  source_profile_id?: string | null;
}

/** One row of the feed: a distinct work and who loves it. */
export interface FeedWork extends Work {
  work_key: string;
  item_id: string;
  item_profile_id: string;
  first_at: string;
  last_at: string;
  fav_count: number;
  save_count: number;
  favoriter_ids: string[];
  saver_ids: string[];
  top_profiles: ProfileLite[];
}

/** A work on Discover: what a card needs, plus the library copy it comes through. */
export interface DiscoverWork extends Work {
  work_key: string;
  item_id: string;
  item_profile_id: string;
  /** how many of the row's people love it (this month, or the seed's people) */
  n?: number;
}

/** A favorite that came with a few words. */
export interface DiscoverThought {
  work: DiscoverWork;
  by: ProfileLite;
  text: string;
  at: string;
}

/** "Because you love {seed}": what the other people who love it love too. */
export interface BecauseRow {
  seed: DiscoverWork;
  /** the other people who love the seed */
  people: number;
  works: DiscoverWork[];
}

/** Someone who shares the viewer's taste, with things they love that the viewer doesn't have. */
export interface TastePerson {
  profile: Profile;
  /** favorites they have in common */
  shared: number;
  /** favorites in their library */
  count: number;
  works: DiscoverWork[];
}

export interface ListRow {
  id: string;
  profile_id: string;
  title: string;
  slug: string;
  description: string;
  is_public: boolean;
  show_added: boolean;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
}

/** A list as shown in grids and the save dialog: counts + a cover mosaic. */
export interface ListSummary extends ListRow {
  count: number;
  /** newest item covers, for the mosaic when no cover image is set */
  covers: string[];
}

export interface ListItem extends Work {
  id: string;
  list_id: string;
  profile_id: string;
  note: string;
  position: number;
  work_key: string;
  via_profile_id: string | null;
  /** when the owner marked it finished (watched, read, listened); null = still to check out */
  done_at: string | null;
  created_at: string;
}

/** A daily pick (AI) as stored in daily_picks.items. */
export interface DailyPick {
  media_type: MediaType;
  title: string;
  creator: string;
  year: string;
  /** one-line hook for the note tab */
  hook: string;
  /** why it fits this person — the yellow highlight */
  reason: string;
  image_url: string | null;
  view_url: string | null;
  canonical_id: string | null;
}

export interface SearchResult {
  media_type: MediaType;
  title: string;
  creator: string;
  image_url: string | null;
  /** small artwork for result lists — image_url's large render is generated on demand upstream and is slow to load in bulk */
  thumb_url?: string | null;
  view_url: string | null;
  year: string;
  source_id: string;
  canonical_id: string | null;
}
