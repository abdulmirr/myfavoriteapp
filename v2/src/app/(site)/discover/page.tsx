import type { Metadata } from "next";
import { getDiscoverWorks } from "@/lib/data";
import { MOST_LOVED_PAGE } from "@/lib/discover";
import DiscoverView from "@/components/discover/DiscoverView";

export const metadata: Metadata = {
  title: "Discover",
  description:
    "Find your next favorite: books, films, music and more, from people with your taste and what's loved most this month.",
};

/** Discover — the first page of "Most loved" comes cached in the static shell; the personal rows load in the browser. */
export default async function DiscoverPage() {
  const initial = await getDiscoverWorks({ types: null, exclude: null, offset: 0, limit: MOST_LOVED_PAGE });
  return <DiscoverView initial={initial} />;
}
