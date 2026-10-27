import { NextRequest, NextResponse } from "next/server";
import { getActivity } from "@/lib/data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Older activity for a profile (public favorites + public-list adds). */
export async function GET(req: NextRequest) {
  const profile = req.nextUrl.searchParams.get("profile") ?? "";
  const before = req.nextUrl.searchParams.get("before");
  if (!UUID.test(profile)) return NextResponse.json({ events: [], hasMore: false }, { status: 400 });
  const ts = before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : null;
  const page = await getActivity(profile, ts);
  return NextResponse.json(page, { headers: { "Cache-Control": "private, max-age=30" } });
}
