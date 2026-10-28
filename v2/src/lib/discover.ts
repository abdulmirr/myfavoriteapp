/**
 * The nav's browse page. Discover — rows of things to find, each with its
 * reason — took the feed's place on 2026-10-28; the feed itself still lives
 * at /feed, untouched. To bring it back, set DISCOVER to false: the nav pill,
 * the "nothing lives here" pages and the sitemap follow.
 */
export const DISCOVER = true;

export const BROWSE = DISCOVER
  ? { href: "/discover", label: "Discover" }
  : { href: "/feed", label: "Feed" };
