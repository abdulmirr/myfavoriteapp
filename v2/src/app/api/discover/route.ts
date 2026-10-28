import { NextRequest, NextResponse } from "next/server";
import { getDiscoverFor } from "@/lib/data";

/**
 * Discover's personal rows for the client (getDiscoverFor). Like /api/feed it
 * reads only public data — favorites, follows, public lists — so it needs no
 * auth; private lists never reach it.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const viewer = req.nextUrl.searchParams.get("viewer");
  if (!viewer || !UUID.test(viewer)) return NextResponse.json({ error: "viewer required" }, { status: 400 });
  try {
    return NextResponse.json(await getDiscoverFor(viewer), { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (e) {
    console.error("discover failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "discover unavailable" }, { status: 502 });
  }
}
