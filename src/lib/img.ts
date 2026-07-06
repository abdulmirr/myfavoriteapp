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
