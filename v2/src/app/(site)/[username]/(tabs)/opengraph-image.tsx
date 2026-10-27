import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { supabaseServer } from "@/lib/supabase";
import { avatarSrc } from "@/lib/img";
import { coverDataUris, coverImages } from "@/lib/og-covers";
import { fitPiece, frameFor, Framed } from "@/lib/og-frames";

/**
 * The profile share card, in the v2 look: the person (avatar, name, handle,
 * counts) beside their Top four — pinned first, topped up from the wall —
 * each wearing its frame on the gray page. This is what a shared profile
 * link looks like everywhere; it IS the marketing asset.
 */

export const alt = "A Favorite taste page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CELL = 236;
const GAP = 22;

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const db = supabaseServer();
  const fonts = join(process.cwd(), "src/fonts");

  const [{ data: profile }, bold, semibold, medium, starSvg] = await Promise.all([
    db
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("username", username)
      .maybeSingle<{ id: string; username: string; display_name: string; avatar_url: string | null }>(),
    readFile(join(fonts, "Inter-Bold.ttf")),
    readFile(join(fonts, "Inter-SemiBold.ttf")),
    readFile(join(fonts, "Inter-Medium.ttf")),
    readFile(join(process.cwd(), "public/faviconstar.svg"), "utf8"),
  ]);
  const starPath = /\sd="([^"]+)"/.exec(starSvg)?.[1] ?? "";

  let covers: Awaited<ReturnType<typeof coverImages>> = [];
  let avatar: string | null = null;
  let favorites = 0;
  let followers = 0;
  if (profile) {
    const [{ data: items }, favCount, followerCount, face] = await Promise.all([
      db
        .from("items")
        .select("image_url, media_type")
        .eq("profile_id", profile.id)
        .not("image_url", "is", null)
        .neq("media_type", "photo")
        .order("pinned_order", { ascending: true, nullsFirst: false })
        .order("sort_order", { ascending: true })
        .limit(10),
      db.from("items").select("id", { count: "exact", head: true }).eq("profile_id", profile.id),
      db.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", profile.id),
      profile.avatar_url ? coverDataUris([avatarSrc(profile.avatar_url, 256)], 1) : Promise.resolve([]),
    ]);
    covers = await coverImages((items ?? []) as { image_url: string; media_type: string }[], 4);
    favorites = favCount.count ?? 0;
    followers = followerCount.count ?? 0;
    avatar = face[0] ?? null;
  }

  const name = profile ? profile.display_name || `@${profile.username}` : "Favorite";
  const initial = (profile?.display_name || profile?.username || "F").slice(0, 1).toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#f3f4f6",
          color: "#111827",
          fontFamily: "Inter",
        }}
      >
        {/* the person */}
        <div
          style={{
            position: "absolute",
            left: 64,
            top: 64,
            bottom: 64,
            width: 470,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <svg viewBox="0 0 1017.42 1017.7" width={30} height={30} style={{ marginRight: 8 }}>
              <path d={starPath} fill="#f7a71e" />
            </svg>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: "-0.055em", lineHeight: 1 }}>
              favorite
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {avatar ? (
              <img
                src={avatar}
                alt=""
                width={112}
                height={112}
                style={{ width: 112, height: 112, borderRadius: 34, objectFit: "cover", border: "4px solid #ffffff" }}
              />
            ) : (
              <div
                style={{
                  width: 112,
                  height: 112,
                  borderRadius: 34,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#e5e7eb",
                  color: "#6b7280",
                  fontSize: 48,
                  fontWeight: 600,
                }}
              >
                {initial}
              </div>
            )}
            <div
              style={{
                display: "flex",
                marginTop: 28,
                fontSize: name.length > 16 ? 50 : 60,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: "-0.04em",
              }}
            >
              {name}
            </div>
            {profile && (
              <div style={{ display: "flex", marginTop: 10, fontSize: 26, fontWeight: 500, color: "#6b7280" }}>
                @{profile.username}
              </div>
            )}
            {profile && (
              <div style={{ display: "flex", marginTop: 22, fontSize: 24, fontWeight: 500, color: "#6b7280" }}>
                <span style={{ color: "#111827", fontWeight: 600, marginRight: 8 }}>{favorites.toLocaleString("en-US")}</span>
                <span style={{ marginRight: 22 }}>{favorites === 1 ? "favorite" : "favorites"}</span>
                <span style={{ color: "#111827", fontWeight: 600, marginRight: 8 }}>{followers.toLocaleString("en-US")}</span>
                <span>{followers === 1 ? "follower" : "followers"}</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", fontSize: 18, fontWeight: 500, color: "#9ca3af" }}>
            myfavoriteapp.com{profile ? `/${profile.username}` : ""}
          </div>
        </div>

        {/* their Top four */}
        <div
          style={{
            position: "absolute",
            right: 64,
            top: (630 - (CELL * 2 + GAP)) / 2,
            width: CELL * 2 + GAP,
            display: "flex",
            flexWrap: "wrap",
            gap: GAP,
          }}
        >
          {covers.map((c, i) => (
            <div
              key={i}
              style={{ width: CELL, height: CELL, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Framed p={fitPiece(frameFor(c.media_type), c.w, c.h, CELL)} src={c.src} />
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: bold, weight: 700, style: "normal" },
        { name: "Inter", data: semibold, weight: 600, style: "normal" },
        { name: "Inter", data: medium, weight: 500, style: "normal" },
      ],
    }
  );
}
