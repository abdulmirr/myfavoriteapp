import type { Metadata } from "next";
import { preload } from "react-dom";
import { getFeed } from "@/lib/data";
import { coverSrcSet } from "@/lib/img";
import { FEED_PAGE } from "@/lib/work";
import FeedView from "@/components/FeedView";

export const metadata: Metadata = {
  title: "Feed",
  description: "Everything people love on Favorite — books, films, music and more.",
};

const SIZES = "(max-width: 1023px) 46vw, (max-width: 1279px) 31vw, 330px";

export default async function FeedPage() {
  // the public feed, cached and prerendered into the static shell
  const initial = await getFeed({ viewer: null, types: null, followingOnly: false, offset: 0, limit: FEED_PAGE });
  // the first row's covers start downloading during HTML parse, in parallel
  // with the JS — by the time the cards render they're already here
  for (const w of initial.slice(0, 4)) {
    if (!w.image_url) continue;
    const s = coverSrcSet(w.image_url, SIZES);
    preload(s.src, { as: "image", fetchPriority: "high", imageSrcSet: s.srcSet, imageSizes: s.sizes });
  }
  return <FeedView initial={initial} />;
}
