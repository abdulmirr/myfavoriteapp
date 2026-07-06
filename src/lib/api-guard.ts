import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";

/**
 * Shared guards for the API routes: bearer-token auth, per-user daily rate
 * limits (bump_api_usage in Postgres), and an SSRF-safe fetch for routes that
 * load caller-supplied URLs.
 */

/** User-scoped client — RLS and auth.uid() see the caller. */
export function userClient(token: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  );
}

/** Resolve the caller or null; use for routes that must be signed-in. */
export async function requireUser(
  req: NextRequest
): Promise<{ db: SupabaseClient; userId: string } | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const db = userClient(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { db, userId: data.user.id };
}

/** True while the caller is within their daily budget for this route. */
export async function withinLimit(
  db: SupabaseClient,
  route: string,
  limit: number
): Promise<boolean> {
  const { data, error } = await db.rpc("bump_api_usage", { p_route: route, p_limit: limit });
  if (error) {
    console.error("rate limit check failed:", error.message);
    return false; // closed on failure — these routes spend money upstream
  }
  return data === true;
}

/* ── SSRF guard ──────────────────────────────────────────────────────────── */

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||           // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateV4(ip);
  if (v === 6) {
    const low = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) — Node's URL serializes these to the hex
    // form (::ffff:7f00:1), so normalize both shapes back to v4 before vetting.
    const dotted = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateV4(dotted[1]);
    const hex = low.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
      return isPrivateV4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
    }
    return (
      low === "::" || low === "::1" ||
      low.startsWith("fc") || low.startsWith("fd") || // ULA
      low.startsWith("fe8") || low.startsWith("fe9") ||
      low.startsWith("fea") || low.startsWith("feb")  // link-local
    );
  }
  return true; // unparseable → treat as unsafe
}

/** Parse and vet a caller-supplied URL: http(s), default port, public address. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("invalid url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("blocked protocol");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("blocked port");
  if (u.hostname === "localhost" || u.hostname.endsWith(".localhost") || u.hostname.endsWith(".internal")) {
    throw new Error("blocked host");
  }
  const literal = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal)) {
    if (isPrivateIp(literal)) throw new Error("blocked host");
    return u;
  }
  const addrs = await lookup(u.hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("blocked host");
  return u;
}

/**
 * fetch() a caller-supplied URL with every redirect hop re-vetted against
 * private address space. Throws on blocked/invalid targets.
 */
export async function safeFetch(raw: string, init?: RequestInit): Promise<Response> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { ...init, redirect: "manual" });
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get("location");
    if (!loc) return res;
    res.body?.cancel();
    url = await assertPublicUrl(new URL(loc, url).toString());
  }
  throw new Error("too many redirects");
}
