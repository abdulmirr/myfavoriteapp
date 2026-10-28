/**
 * One link, one work — the client's copy of `public.url_work_key`
 * (migration32). The database applies it on every write and is the source
 * of truth; this mirror only lets a link someone just pasted match the
 * same page already on Favorite (stars, bookmarks, "already on your wall")
 * before anything is saved. scripts/_e2e-url-key.mjs checks the two agree on
 * every address in the database. Change both together.
 *
 *   themoviedb.org/movie/77         → tmdb:movie:77   (and the other catalogs)
 *   youtu.be/ID · youtube.com/…v=ID → youtube:ID      (vimeo:, spotify: too)
 *   anything else                    → url:<hash of host + path + kept query>
 */

const TRACKERS = new Set([
  "fbclid", "gclid", "dclid", "msclkid", "igshid", "igsh", "ref", "ref_src", "ref_url",
  "si", "feature", "share", "source", "spm", "trk", "cmpid", "s_cid", "_ga", "mkt_tok", "yclid",
]);
const TRACKER_PREFIX = /^(utm_|mc_|_hs|pk_|mtm_)/;
/** hosts whose links never need their query (it's all share/referral noise) */
const NO_QUERY = new Set(["x.com", "instagram.com", "tiktok.com", "open.spotify.com", "pin.it", "linkedin.com"]);

/** The parts of the key that need no hashing; null when the URL needs a url: hash. */
function knownKey(host: string, path: string, query: string): string | null {
  let m: RegExpExecArray | null;
  switch (host) {
    case "themoviedb.org":
      m = /^\/(movie|tv)\/([0-9]+)/.exec(path);
      return m ? `tmdb:${m[1]}:${m[2]}` : null;
    case "deezer.com":
      m = /^\/(?:[a-z]{2}\/)?(album|track|show)\/([0-9]+)/.exec(path);
      return m ? `deezer:${m[1] === "show" ? "podcast" : m[1]}:${m[2]}` : null;
    case "music.apple.com":
    case "itunes.apple.com":
    case "books.apple.com":
    case "podcasts.apple.com": {
      const id =
        /(?:^|&)i=([0-9]+)/.exec(query)?.[1] ?? /\/id([0-9]+)/.exec(path)?.[1] ?? /\/([0-9]{5,})\/?$/.exec(path)?.[1];
      return id ? `itunes:${id}` : null;
    }
    case "openlibrary.org":
      m = /^\/works\/(OL[0-9]+W)/.exec(path);
      return m ? `ol:/works/${m[1]}` : null;
    case "youtube.com":
    case "music.youtube.com":
    case "youtube-nocookie.com": {
      const id =
        /(?:^|&)v=([A-Za-z0-9_-]{11})/.exec(query)?.[1] ?? /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/.exec(path)?.[1];
      return id ? `youtube:${id}` : null;
    }
    case "youtu.be":
      m = /^\/([A-Za-z0-9_-]{11})/.exec(path);
      return m ? `youtube:${m[1]}` : null;
    case "vimeo.com":
    case "player.vimeo.com":
      m = /\/([0-9]{5,})(?:\/|$)/.exec(path);
      return m ? `vimeo:${m[1]}` : null;
    case "open.spotify.com":
      m = /^\/(?:intl-[a-z-]+\/)?(track|album|episode|show|playlist|artist)\/([A-Za-z0-9]+)/.exec(path);
      return m ? `spotify:${m[1]}:${m[2]}` : null;
  }
  return null;
}

/** The normalized address that gets hashed (exported for the parity test). */
export function urlParts(raw: string | null | undefined): { known: string | null; norm: string } | null {
  const m = /^https?:\/\/([^/?#\s]+)([^?#\s]*)(?:\?([^#\s]*))?/i.exec((raw ?? "").trim());
  if (!m) return null;
  let host = m[1]
    .toLowerCase()
    .replace(/^[^@]*@/, "")
    .replace(/:[0-9]+$/, "")
    .replace(/^(www|m|mobile|amp)\./, "");
  let path = m[2] ?? "";
  const query = m[3] ?? "";
  const known = knownKey(host, path, query);
  if (known) return { known, norm: "" };
  if (host === "twitter.com") host = "x.com";
  path = path.replace(/\/{2,}/g, "/").replace(/\/(index\.(html?|php))?$/, "");
  const kept: string[] = [];
  if (query && !/(^|\.)substack\.com$/.test(host) && !NO_QUERY.has(host)) {
    for (const kv of query.split("&")) {
      const k = kv.split("=")[0].toLowerCase();
      if (!kv || TRACKER_PREFIX.test(k) || TRACKERS.has(k)) continue;
      kept.push(kv);
    }
  }
  // byte order, like the database's `collate "C"`
  kept.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { known: null, norm: host + path + (kept.length ? `?${kept.join("&")}` : "") };
}

/** The work key for a URL, or null when it isn't one. */
export async function urlWorkKey(raw: string | null | undefined): Promise<string | null> {
  const parts = urlParts(raw);
  if (!parts) return null;
  if (parts.known) return parts.known;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.norm));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `url:${hex.slice(0, 24)}`;
}

/** Links, videos and typed-in works take any key; catalog-typed works only a catalog id. */
export function takesKey(mediaType: string, key: string): boolean {
  return ["article", "video", "other"].includes(mediaType) || !/^(url|youtube|vimeo|spotify):/.test(key);
}
