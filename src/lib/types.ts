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
