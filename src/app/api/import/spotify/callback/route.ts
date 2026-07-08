import { NextRequest, NextResponse } from "next/server";

/**
 * Spotify hands the browser back here with a one-time code. We exchange it
 * server-side (the secret never leaves the server), pull saved albums + the
 * long-term top tracks' albums with the short-lived access token, and hand
 * the result to the settings page through sessionStorage — the token itself
 * is dropped on the floor. Nothing imports until the user reviews the wall
 * and clicks Import; nothing is ever written to Spotify.
 */

export const maxDuration = 60;

type SpotifyAlbum = {
  name: string;
  release_date?: string;
  artists?: { name: string }[];
  album_type?: string;
};

type ImportRowWire = {
  media_type: "music";
  title: string;
  creator: string;
  year: string;
  rating: number;
  review: string;
  checked: boolean;
};

/** back to settings with a human message instead of a dead end */
const bounce = (origin: string, error?: string) => {
  const html = `<!doctype html><meta charset="utf-8"><body><script>
try { sessionStorage.setItem("fav:spotify-error", ${JSON.stringify(error ?? "").replace(/</g, "\\u003c")}); } catch {}
location.replace(${JSON.stringify(origin + "/profile")});
</script></body>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
};

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin.replace("://localhost:", "://127.0.0.1:");
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return bounce(origin, "Spotify import isn't configured yet.");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    // user hit "cancel" on the consent screen — not an error worth red text
    return bounce(origin);
  }
  const code = params.get("code");
  const state = params.get("state");
  const cookieState = req.cookies.get("spotify_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return bounce(origin, "That Spotify connection didn't check out — try again.");
  }

  try {
    // one-time code → short-lived token (never stored, dies with this request)
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${origin}/api/import/spotify/callback`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) throw new Error("token exchange failed");

    const api = async (path: string) => {
      const r = await fetch(`https://api.spotify.com/v1${path}`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`spotify ${r.status}`);
      return r.json();
    };

    // saved albums = deliberate keeps; top tracks = what actually gets played.
    // Both map to albums, deduped — the review wall sorts the rest out.
    const rows = new Map<string, ImportRowWire>();
    const add = (album: SpotifyAlbum | undefined, checked: boolean) => {
      if (!album?.name) return;
      const creator = album.artists?.[0]?.name ?? "";
      const key = `${album.name.toLowerCase()}|${creator.toLowerCase()}`;
      if (rows.has(key)) return;
      rows.set(key, {
        media_type: "music",
        title: album.name,
        creator,
        year: album.release_date?.slice(0, 4) ?? "",
        rating: 0,
        review: "",
        checked,
      });
    };

    for (let page = 0; page < 4; page++) {
      const saved = (await api(`/me/albums?limit=50&offset=${page * 50}`)) as {
        items?: { album: SpotifyAlbum }[];
        next?: string | null;
      };
      for (const it of saved.items ?? []) add(it.album, true);
      if (!saved.next) break;
    }
    const top = (await api("/me/top/tracks?limit=50&time_range=long_term")) as {
      items?: { album?: SpotifyAlbum }[];
    };
    // singles chart high from repeat plays but make thin favorites — leave
    // them findable in the list, just not pre-checked
    for (const t of top.items ?? []) add(t.album, t.album?.album_type === "album");

    if (!rows.size) {
      return bounce(origin, "No saved albums or listening history on that Spotify account.");
    }

    const payload = JSON.stringify([...rows.values()].slice(0, 400)).replace(/</g, "\\u003c");
    const html = `<!doctype html><meta charset="utf-8"><body><script>
try { sessionStorage.setItem("fav:spotify-import", ${JSON.stringify(payload)}); } catch {}
location.replace(${JSON.stringify(origin + "/profile")});
</script></body>`;
    const res = new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    res.cookies.delete("spotify_state");
    return res;
  } catch (e) {
    console.error("spotify import failed:", e);
    return bounce(origin, "Couldn't pull your Spotify library — try again in a minute.");
  }
}
