import { NextRequest, NextResponse } from "next/server";
import { getFeed } from "@/lib/data";
import type { MediaType } from "@/lib/types";
import { FEED_PAGE as PAGE, TYPE_FILTERS } from "@/lib/work";

/**
 * Feed pages for the client: personalized (friends first) when a viewer id is
 * given, filtered by type or to people you follow. Follows and favorites are
 * public, so this needs no auth; the data function is cached per argument set.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const viewer = sp.get("viewer");
  const filter = sp.get("filter") ?? "all";
  const offset = Math.max(0, Math.min(5000, Number(sp.get("offset")) || 0));
  const types = (TYPE_FILTERS.find((f) => f.key === filter)?.types ?? null) as MediaType[] | null;
  const viewerId = viewer && UUID.test(viewer) ? viewer : null;

  try {
    const works = await getFeed({
      viewer: viewerId,
      types,
      followingOnly: filter === "following" && !!viewerId,
      offset,
      limit: PAGE,
    });
    return NextResponse.json(
      { works, hasMore: works.length === PAGE },
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch (e) {
    console.error("feed failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ works: [], hasMore: false, error: "feed unavailable" }, { status: 502 });
  }
}
