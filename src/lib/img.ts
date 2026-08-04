/**
 * Rewrite a stored cover URL to a smaller variant of the same image for
 * thumbnail-sized slots — the covers we store are 500-600px, which is silly
 * to download for a 24px dropdown icon. Every rewrite targets a size the CDN
 * genuinely serves; unknown hosts/shapes pass through untouched.
 */
export function thumbCover(url: string, px = 200): string {
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
export function coverSrcSet(url: string): { src: string; srcSet?: string; sizes?: string } {
  // tiles are ~45vw in the phone grids, ~200-300px in desktop rows
  const sizes = "(max-width: 767px) 45vw, 280px";
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
