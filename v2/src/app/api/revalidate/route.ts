import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireUser, withinLimit } from "@/lib/api-guard";

/**
 * Writes happen client-side (Supabase + RLS), so after one lands the client
 * pings here with the cache tags it touched (see lib/viewer.ts). Signed-in
 * only, tag shapes are whitelisted, and calls share a daily budget.
 *
 * Person/list/work pages expire immediately (the next visit renders fresh);
 * the feed refreshes stale-while-revalidate (no visitor ever waits on it).
 */
const SHAPES = [
  /^profile:[0-9a-f-]{36}$/,
  /^list:[0-9a-f-]{36}$/,
  /^username:[a-z0-9_.-]{1,40}$/i,
  /^work:.{1,250}$/,
  /^feed$/,
];

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  let tags: unknown;
  try {
    ({ tags } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!Array.isArray(tags)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const valid = [...new Set(tags.filter((t): t is string => typeof t === "string"))]
    .filter((t) => SHAPES.some((re) => re.test(t)))
    .slice(0, 12);
  if (!valid.length) return NextResponse.json({ revalidated: [] });

  if (!(await withinLimit(auth.db, "revalidate", 600))) {
    return NextResponse.json({ error: "daily limit reached" }, { status: 429 });
  }

  for (const tag of valid) {
    revalidateTag(tag, tag === "feed" ? "max" : { expire: 0 });
  }
  return NextResponse.json({ revalidated: valid });
}
