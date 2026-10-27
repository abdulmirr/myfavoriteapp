import { NextRequest, NextResponse } from "next/server";
import { requireUser, withinLimit, safeFetch } from "@/lib/api-guard";

// Resolves a pasted URL to { title, image, site } — YouTube/Vimeo via oEmbed,
// everything else via OpenGraph tags. Signed-in only, budgeted, and every
// fetch of a caller-supplied URL is vetted against private address space.

function meta(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']|` +
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i"
  );
  const m = html.match(re);
  return m ? (m[1] ?? m[2]) : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (!(await withinLimit(auth.db, "og", 120))) {
    return NextResponse.json({ error: "daily limit reached" }, { status: 429 });
  }

  const url = req.nextUrl.searchParams.get("url")?.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  try {
    const u = new URL(url);

    if (/(^|\.)((youtube\.com)|(youtu\.be))$/i.test(u.hostname)) {
      const r = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) {
        const d = await r.json();
        // oEmbed returns hqdefault.jpg — 4:3 with letterbox bars baked in.
        // Prefer the true-16:9 sizes: maxresdefault when the video has one,
        // else mqdefault (always exists, no bars).
        let image: string | null = d.thumbnail_url ?? null;
        if (image?.includes("/hqdefault.")) {
          const maxres = image.replace("/hqdefault.", "/maxresdefault.");
          const probe = await fetch(maxres, {
            method: "HEAD",
            signal: AbortSignal.timeout(4000),
          }).catch(() => null);
          image = probe?.ok ? maxres : image.replace("/hqdefault.", "/mqdefault.");
        }
        return NextResponse.json({
          title: d.title, image, site: d.author_name ?? "YouTube",
        });
      }
    }
    if (/(^|\.)vimeo\.com$/i.test(u.hostname)) {
      const r = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const d = await r.json();
        return NextResponse.json({
          title: d.title, image: d.thumbnail_url, site: d.author_name ?? "Vimeo",
        });
      }
    }

    const res = await safeFetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; favorites-bot)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = (await res.text()).slice(0, 300_000);
    const title =
      meta(html, "og:title") ??
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ??
      u.hostname;
    const image = meta(html, "og:image");
    const site = meta(html, "og:site_name") ?? u.hostname.replace(/^www\./, "");
    return NextResponse.json({ title, image, site });
  } catch {
    return NextResponse.json({ error: "could not read page" }, { status: 502 });
  }
}
