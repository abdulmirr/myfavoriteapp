import type { MediaType } from "./types";

export const CATEGORIES = ["All", "Books", "Movies", "Music", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];

const BUCKET: Record<MediaType, Category> = {
  book: "Books",
  movie: "Movies",
  tv: "Movies",
  music: "Music",
  podcast: "Other",
  video: "Other",
  article: "Other",
  photo: "Other",
  other: "Other",
};

export function categoryOf(type: MediaType): Category {
  return BUCKET[type];
}

/** Types offered in the add popup, with how each one sources its data. */
export const ADD_TYPES: {
  type: MediaType;
  label: string;
  mode: "search" | "url" | "upload" | "manual";
}[] = [
  { type: "book", label: "book", mode: "search" },
  // one picker entry for both; search returns movie + tv hits and each
  // result keeps its true media_type when saved
  { type: "movie", label: "movie/tv", mode: "search" },
  { type: "music", label: "music", mode: "search" },
  { type: "podcast", label: "podcast", mode: "search" },
  { type: "video", label: "video", mode: "url" },
  // any URL — an article, a tool, a game, a site worth keeping
  { type: "article", label: "link", mode: "url" },
  { type: "photo", label: "photo", mode: "upload" },
  // anything without a database — a restaurant, a game, a place. Manual title +
  // optional creator/link/image, saved as media_type "other".
  { type: "other", label: "other", mode: "manual" },
];
