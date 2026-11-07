import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

/**
 * /api/revalidate for the browser extension, which holds a personal token
 * instead of a session. The token proves who's asking and the tags come from
 * the database (extension_pages, which also charges the daily budget), so a
 * caller can only expire their own pages.
 *
 * The popup can close the moment a save starts, so it can't wait for the write
 * and then ask. It asks alongside the write and this waits for the write to
 * land: expiring a page first would only cache the old version again.
 */
const WRITE_LANDS_MS = 1500;

type Pages = { status: string; profile_id: string; work_key: string | null; lists: string[] };

export async function POST(req: NextRequest) {
  let token: unknown;
  let url: unknown;
  try {
    ({ token, url } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token) || typeof url !== "string" || url.length > 2048) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { data, error } = await supabaseServer().rpc("extension_pages", { p_token: token, p_url: url });
  if (error) {
    console.error("extension_pages failed:", error.message);
    return NextResponse.json({ error: "try again" }, { status: 502 });
  }
  const pages = data as Pages;
  if (pages.status === "unauthorized") return NextResponse.json({ error: "not connected" }, { status: 401 });
  if (pages.status === "limit") return NextResponse.json({ error: "daily limit reached" }, { status: 429 });

  await new Promise((done) => setTimeout(done, WRITE_LANDS_MS));

  const tags = [
    `profile:${pages.profile_id}`,
    "feed",
    ...pages.lists.map((id) => `list:${id}`),
    ...(pages.work_key ? [`work:${pages.work_key}`] : []),
  ];
  for (const tag of tags) {
    revalidateTag(tag, tag === "feed" ? "max" : { expire: 0 });
  }
  return NextResponse.json({ revalidated: tags });
}
