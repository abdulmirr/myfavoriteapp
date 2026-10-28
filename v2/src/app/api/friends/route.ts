import { NextRequest, NextResponse } from "next/server";
import { getFriendsActivity } from "@/lib/data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pages of the Friends timeline. Follows, favorites and public lists are all
 * public, so like /api/feed this needs no auth — it shows what any profile
 * page already shows, grouped for one viewer's follows.
 */
export async function GET(req: NextRequest) {
  const viewer = req.nextUrl.searchParams.get("viewer") ?? "";
  const offset = Math.max(0, Math.min(2000, Number(req.nextUrl.searchParams.get("offset")) || 0));
  if (!UUID.test(viewer)) return NextResponse.json({ groups: [], hasMore: false }, { status: 400 });
  try {
    const page = await getFriendsActivity(viewer, offset);
    return NextResponse.json(page, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (e) {
    console.error("friends failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ groups: [], hasMore: false, error: "friends unavailable" }, { status: 502 });
  }
}
