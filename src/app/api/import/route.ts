import { NextRequest, NextResponse } from "next/server";
import { requireUser, withinLimit } from "@/lib/api-guard";

/**
 * Pull someone's public library from Goodreads or Letterboxd — no sign-in
 * required on their side (Goodreads killed its API in 2020 and Letterboxd's
 * is private, so public-profile pulls ARE the integration).
 * Upstream hosts are fixed, so no SSRF surface.
 */

export const maxDuration = 60;

export type ImportRow = {
  media_type: "book" | "movie";
  title: string;
  creator: string;
  year: string;
  rating: number; // 0–5
  review: string;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const fetchText = async (url: string) => {
  const res = await fetch(url, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
};

const rssField = (item: string, tag: string): string => {
  const m = item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return (m?.[1] ?? "").trim();
};

/* ── Goodreads: RSS shelf feed (public profiles) ───────────────────────────── */

async function goodreadsUserId(input: string): Promise<string> {
  const direct = input.match(/(?:user\/show|list_rss|list)\/(\d+)/) ?? input.match(/^(\d+)$/);
  if (direct) return direct[1];
  // vanity URL or bare handle → the profile page carries the numeric id
  const url = /^https?:\/\//i.test(input)
    ? input
    : `https://www.goodreads.com/${encodeURIComponent(input.replace(/^@/, ""))}`;
  if (!/^https?:\/\/(www\.)?goodreads\.com\//i.test(url)) throw new Error("not a Goodreads URL");
  const html = await fetchText(url);
  const m = html.match(/(?:user\/show|review\/list_rss|review\/list)\/(\d+)/);
  if (!m) throw new Error("couldn't find that Goodreads profile — is it public?");
  return m[1];
}

async function pullGoodreads(input: string): Promise<ImportRow[]> {
  const id = await goodreadsUserId(input);
  const rows: ImportRow[] = [];
  for (let page = 1; page <= 5; page++) {
    const xml = await fetchText(
      `https://www.goodreads.com/review/list_rss/${id}?shelf=read&page=${page}`
    );
    const items = xml.split("<item>").slice(1);
    for (const item of items) {
      const title = rssField(item, "title").replace(/\s*\(.*?#\d+.*?\)\s*$/, "");
      if (!title) continue;
      rows.push({
        media_type: "book",
        title,
        creator: rssField(item, "author_name"),
        year: rssField(item, "book_published"),
        rating: Number(rssField(item, "user_rating")) || 0,
        review: "",
      });
    }
    if (items.length < 100) break;
  }
  if (!rows.length) throw new Error("no books on that profile's read shelf — is it public?");
  return rows;
}

/* ── Letterboxd: public films grid + RSS diary ──────────────────────────────
 * Letterboxd bot-blocks every URL except a profile's first /films/ page and
 * its RSS feed, so the pull is the ~120 most recent films (grid 72 + diary
 * 50, deduped). Full history still comes in via the export-ZIP fallback. */

async function pullLetterboxd(input: string): Promise<ImportRow[]> {
  const username = (input.match(/letterboxd\.com\/([a-z0-9_]+)/i)?.[1] ?? input)
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  if (!/^[a-z0-9_]{2,30}$/.test(username)) throw new Error("that doesn't look like a Letterboxd username");

  const key = (t: string, y: string) => `${t.toLowerCase()}|${y}`;
  const byKey = new Map<string, ImportRow>();
  const add = (row: ImportRow) => {
    const k = key(row.title, row.year);
    const prev = byKey.get(k);
    if (!prev || row.rating > prev.rating) byKey.set(k, row);
  };

  const [gridRes, rssRes] = await Promise.allSettled([
    fetchText(`https://letterboxd.com/${username}/films/`),
    fetchText(`https://letterboxd.com/${username}/rss/`),
  ]);

  if (gridRes.status === "fulfilled") {
    // posters and viewing data appear in document order:
    // data-item-name="Title (Year)" … class="rating … rated-N" (N of 10)
    const re = /data-item-name="([^"]+)"|rating[^"]*\brated-(\d+)/g;
    let m: RegExpExecArray | null;
    let pending: ImportRow | null = null;
    while ((m = re.exec(gridRes.value))) {
      if (m[1] !== undefined) {
        if (pending) add(pending);
        const name = m[1].replace(/&#039;|&apos;/g, "'").replace(/&amp;/g, "&");
        const t = name.match(/^(.*)\s+\((\d{4})\)$/);
        pending = {
          media_type: "movie",
          title: t ? t[1] : name,
          creator: "",
          year: t ? t[2] : "",
          rating: 0,
          review: "",
        };
      } else if (pending) {
        pending.rating = Number(m[2]) / 2;
      }
    }
    if (pending) add(pending);
  }

  if (rssRes.status === "fulfilled") {
    for (const item of rssRes.value.split("<item>").slice(1)) {
      const title = rssField(item, "letterboxd:filmTitle");
      if (!title) continue;
      add({
        media_type: "movie",
        title,
        creator: "",
        year: rssField(item, "letterboxd:filmYear"),
        rating: Number(rssField(item, "letterboxd:memberRating")) || 0,
        review: "",
      });
    }
  }

  const rows = [...byKey.values()].sort((a, b) => b.rating - a.rating);
  if (!rows.length) throw new Error("couldn't load that Letterboxd profile — is it public?");
  return rows;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (!(await withinLimit(auth.db, "import", 20))) {
    return NextResponse.json({ error: "daily limit reached" }, { status: 429 });
  }

  const service = req.nextUrl.searchParams.get("service");
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id || (service !== "goodreads" && service !== "letterboxd")) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    const rows = service === "goodreads" ? await pullGoodreads(id) : await pullLetterboxd(id);
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "pull failed" },
      { status: 502 }
    );
  }
}
