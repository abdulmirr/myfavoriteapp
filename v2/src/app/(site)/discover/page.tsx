import type { Metadata } from "next";
import { getDiscoverPublic, getFeed } from "@/lib/data";
import { FEED_PAGE } from "@/lib/work";
import DiscoverView from "@/components/discover/DiscoverView";

export const metadata: Metadata = {
  title: "Discover",
  description:
    "Find your next favorite: books, films, music and more, each with a reason — from people with your taste, what’s loved this month, and what people said.",
};

/** Discover — the rows everyone sees and the first page of everything come cached in the static shell; the personal rows load in the browser. */
export default async function DiscoverPage() {
  const [{ loved, thoughts }, initial] = await Promise.all([
    getDiscoverPublic(),
    getFeed({ viewer: null, types: null, followingOnly: false, offset: 0, limit: FEED_PAGE }),
  ]);
  return <DiscoverView loved={loved} thoughts={thoughts} initial={initial} />;
}
