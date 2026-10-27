import { NextRequest, NextResponse } from "next/server";

/**
 * Kick off the Spotify connect: mint a CSRF state, remember it in an
 * httpOnly cookie, and hand the browser to Spotify's consent screen.
 * Read-only scopes — saved albums + top tracks; nothing is ever written
 * back to Spotify, and no tokens are ever persisted on our side.
 */

export function GET(req: NextRequest) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/profile", req.nextUrl.origin));
  }

  const state = crypto.randomUUID();
  // Spotify requires the registered URI verbatim; locally that's the loopback
  // IP (their rules bar plain http://localhost)
  const origin = req.nextUrl.origin.replace("://localhost:", "://127.0.0.1:");
  const redirectUri = `${origin}/api/import/spotify/callback`;

  const authorize = new URL("https://accounts.spotify.com/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", "user-library-read user-top-read");
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize);
  res.cookies.set("spotify_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https"),
    path: "/api/import/spotify",
    maxAge: 600,
  });
  return res;
}
