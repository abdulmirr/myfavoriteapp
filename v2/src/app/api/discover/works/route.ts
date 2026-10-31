import { NextRequest, NextResponse } from "next/server";
import { getDiscoverWorks } from "@/lib/data";
import { MOST_LOVED_PAGE as PAGE } from "@/lib/discover";
import type { MediaType } from "@/lib/types";
import { TYPE_FILTERS } from "@/lib/work";

/**
 * Discover's "Most loved" pages for the client (getDiscoverWorks): by medium,
 * across everyone on Favorite — the same list for every viewer. Public data,
 * so no auth.
 */

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const filter = sp.get("filter") ?? "all";
  const offset = Math.max(0, Math.min(5000, Number(sp.get("offset")) || 0));
  const types = (TYPE_FILTERS.find((f) => f.key === filter)?.types ?? null) as MediaType[] | null;
  try {
    const works = await getDiscoverWorks({
      types,
      exclude: null,
      offset,
      limit: PAGE,
    });
    return NextResponse.json(
      { works, hasMore: works.length === PAGE },
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch (e) {
    console.error("most loved failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ works: [], hasMore: false, error: "most loved unavailable" }, { status: 502 });
  }
}
