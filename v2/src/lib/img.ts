const SB_OBJECT = "/storage/v1/object/public/";

/**
 * Uploads in Supabase Storage (avatars, photos) are phone originals — up to
 * 5MB for a 20px avatar. Storage's render endpoint serves resized copies from
 * its CDN instead. Square crops for avatars; covers keep their shape.
 */
function storageRender(url: string, width: number, square = false): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith(".supabase.co") || !u.pathname.startsWith(SB_OBJECT)) return null;
    if (/\.(svg|gif)$/i.test(u.pathname)) return null; // vectors are tiny; GIFs would lose their motion
    u.pathname = u.pathname.replace(SB_OBJECT, "/storage/v1/render/image/public/");
    u.searchParams.set("width", String(width));
    if (square) {
      u.searchParams.set("height", String(width));
      u.searchParams.set("resize", "cover");
    }
    u.searchParams.set("quality", "75");
    return u.toString();
  } catch {
    return null;
  }
}

/** A profile header, sized for the widest banner (1024px at 1.5x). */
export function headerSrc(url: string): string {
  return storageRender(url, 1600) ?? url;
}

/** An avatar sized for its slot (128px covers every avatar on the site at 2x). */
export function avatarSrc(url: string, px = 128): string {
  return storageRender(url, px, true) ?? url;
}

/**
 * Rewrite a stored cover URL to a smaller variant of the same image for
 * thumbnail-sized slots — the covers we store are 500-600px, which is silly
 * to download for a 24px dropdown icon. Every rewrite targets a size the CDN
 * genuinely serves; unknown hosts/shapes pass through untouched.
 */
export function thumbCover(url: string, px = 200): string {
  const uploaded = storageRender(url, px);
  if (uploaded) return uploaded;
  try {
    const host = new URL(url).hostname;
    if (host.endsWith("mzstatic.com")) {
      // .../600x600bb.jpg → .../200x200bb.jpg
      return url.replace(/\/\d+x\d+([a-z]*)\.(jpg|png|webp)$/i, `/${px}x${px}$1.$2`);
    }
    if (host === "image.tmdb.org") {
      return url.replace("/t/p/w500", px <= 154 ? "/t/p/w154" : "/t/p/w342");
    }
    if (host.endsWith("dzcdn.net")) {
      // .../500x500-000000-80-0-0.jpg → .../250x250-000000-80-0-0.jpg
      return url.replace(/\/\d+x\d+(-[\d-]+)\.(jpg|png)$/i, `/${px}x${px}$1.$2`);
    }
    if (host === "covers.openlibrary.org") {
      return url.replace(/-L\.jpg$/i, "-M.jpg");
    }
  } catch {
    /* malformed URL — just use it as-is */
  }
  return url;
}

/**
 * A responsive srcset for grid-tile slots, built from the same CDN variants
 * thumbCover targets. The stored covers are 500-600px; a phone's 2-column
 * grid or a 4-column desktop row only needs 200-400px, and letting the
 * browser pick cuts the first paint's image bytes roughly in half. Hosts
 * without genuine resize variants return src alone.
 */
export function coverSrcSet(
  url: string,
  // tiles are ~45vw in the phone grids, ~200-300px in desktop rows
  sizes = "(max-width: 767px) 45vw, 280px"
): { src: string; srcSet?: string; sizes?: string } {
  if (storageRender(url, 640)) {
    const mk = (w: number) => storageRender(url, w)!;
    return { src: mk(640), srcSet: `${mk(320)} 320w, ${mk(640)} 640w, ${mk(1080)} 1080w`, sizes };
  }
  try {
    const host = new URL(url).hostname;
    if (host.endsWith("mzstatic.com")) {
      const mk = (px: number) =>
        url.replace(/\/\d+x\d+([a-z]*)\.(jpg|png|webp)$/i, `/${px}x${px}$1.$2`);
      if (mk(200) !== url)
        return { src: url, srcSet: `${mk(200)} 200w, ${mk(400)} 400w, ${mk(600)} 600w`, sizes };
    }
    if (host === "image.tmdb.org" && url.includes("/t/p/w500")) {
      const mk = (w: string) => url.replace("/t/p/w500", `/t/p/${w}`);
      return { src: url, srcSet: `${mk("w154")} 154w, ${mk("w342")} 342w, ${url} 500w`, sizes };
    }
    if (host.endsWith("dzcdn.net")) {
      const mk = (px: number) => url.replace(/\/\d+x\d+(-[\d-]+)\.(jpg|png)$/i, `/${px}x${px}$1.$2`);
      if (mk(250) !== url) return { src: url, srcSet: `${mk(250)} 250w, ${mk(500)} 500w`, sizes };
    }
    if (host === "covers.openlibrary.org" && /-L\.jpg$/i.test(url)) {
      return { src: url, srcSet: `${url.replace(/-L\.jpg$/i, "-M.jpg")} 180w, ${url} 500w`, sizes };
    }
  } catch {
    /* malformed URL — just use it as-is */
  }
  return { src: url };
}
