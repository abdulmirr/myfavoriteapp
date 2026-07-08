import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { supabaseServer } from "@/lib/supabase";
import { coverDataUris } from "@/lib/og-covers";

/**
 * The Four Favorites share card: four covers in a row under the person's
 * name — the cross-media answer to Letterboxd's four-poster grid.
 */

export const alt = "Four favorites";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COVER_W = 200;
const COVER_H = 300;

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
  if (profile) {
    const { data: items } = await db
      .from("items")
      .select("image_url")
      .eq("profile_id", profile.id)
      .not("image_url", "is", null)
      .order("pinned_order", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true })
      .limit(8);
    covers = await coverDataUris(
      (items ?? []).map((i) => i.image_url as string),
      4
    );
  }

  const name = profile ? profile.display_name || `@${profile.username}` : "Favorites";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          color: "#18181b",
          fontFamily: "Geist Mono",
          alignItems: "center",
          justifyContent: "center",
          padding: 56,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 20,
            color: "#a1a1aa",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          The four favorites of
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 12,
            fontSize: 46,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          {name}
        </div>

        <div style={{ display: "flex", gap: 28, marginTop: 40 }}>
          {covers.map((url, i) => (
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

        {profile && (
          <div style={{ display: "flex", marginTop: 36, fontSize: 22, color: "#a1a1aa" }}>
            myfavoriteapp.com/{profile.username}/four
          </div>
        )}
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
