import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { supabaseServer } from "@/lib/supabase";
import { coverDataUris } from "@/lib/og-covers";

/**
 * The profile share card: the person's name set in the brand mono, with their
 * actual covers (pinned Top 4 first) as the artwork. This is what a shared
 * profile link looks like everywhere — it IS the marketing asset.
 */

export const alt = "A Favorites taste page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COVER_W = 148;
const COVER_H = 222; // 2:3, the dominant cover shape

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const db = supabaseServer();

  const [{ data: profile }, regular, semibold] = await Promise.all([
    db
      .from("profiles")
      .select("id, username, display_name")
      .eq("username", username)
      .single<{ id: string; username: string; display_name: string }>(),
    readFile(join(process.cwd(), "src/fonts/GeistMono-Regular.ttf")),
    readFile(join(process.cwd(), "src/fonts/GeistMono-SemiBold.ttf")),
  ]);

  let covers: string[] = [];
  let count = 0;
  if (profile) {
    const { data: items } = await db
      .from("items")
      .select("image_url, pinned_order")
      .eq("profile_id", profile.id)
      .not("image_url", "is", null)
      .order("pinned_order", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true })
      .limit(40);
    const urls = (items ?? []).map((i) => i.image_url as string);
    covers = await coverDataUris(urls, 4);
    const { count: total } = await db
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id);
    count = total ?? urls.length;
  }

  const name = profile ? profile.display_name || `@${profile.username}` : "Favorites";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#ffffff",
          color: "#18181b",
          fontFamily: "Geist Mono",
          padding: 72,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* left: identity */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 480 }}>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              color: "#a1a1aa",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Favorites
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 58,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            {name}
          </div>
          {profile && (
            <div style={{ display: "flex", marginTop: 20, fontSize: 24, color: "#a1a1aa" }}>
              myfavoriteapp.com/{profile.username}
            </div>
          )}
          {count > 0 && (
            <div style={{ display: "flex", marginTop: 8, fontSize: 24, color: "#a1a1aa" }}>
              {count} favorite{count === 1 ? "" : "s"}
            </div>
          )}
        </div>

        {/* right: the actual taste — up to 4 covers, second pair offset */}
        <div style={{ display: "flex", gap: 20 }}>
          {[0, 1].map((col) => (
            <div
              key={col}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 20,
                marginTop: col === 0 ? 0 : 44,
              }}
            >
              {covers.slice(col * 2, col * 2 + 2).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt=""
                  width={COVER_W}
                  height={COVER_H}
                  style={{
                    width: COVER_W,
                    height: COVER_H,
                    objectFit: "cover",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist Mono", data: regular, weight: 400, style: "normal" },
        { name: "Geist Mono", data: semibold, weight: 600, style: "normal" },
      ],
    }
  );
}
