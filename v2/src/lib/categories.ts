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
  // any URL — an essay, a video, a tool, a site worth keeping. Videos need no
  // entry of their own: a YouTube or Vimeo link is saved as one by itself.
  { type: "article", label: "link", mode: "url" },
  // photo uploads were retired 2026-10-27 (discovery, not a camera roll); the
  // 17 existing photos still show on their walls. To bring them back:
  // { type: "photo", label: "photo", mode: "upload" },
  // anything without a database — a restaurant, a game, a place. Manual title +
  // optional creator/link/image, saved as media_type "other".
  { type: "other", label: "other", mode: "manual" },
];
