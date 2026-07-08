import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { supabaseServer } from "@/lib/supabase";
import { coverDataUris } from "@/lib/og-covers";

/**
 * The 9:16 story render of the Four Favorites — made for Instagram stories
 * and group chats. Public like the OG images (same data), cached an hour so
 * a viral moment doesn't re-render per view.
 */

const W = 1080;
const H = 1920;
const COVER_W = 380;
const COVER_H = 570;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
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
  if (!profile) return new Response("not found", { status: 404 });

  const { data: items } = await db
    .from("items")
    .select("title, image_url")
    .eq("profile_id", profile.id)
    .not("image_url", "is", null)
    .order("pinned_order", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .limit(8);
  const covers = await coverDataUris(
    (items ?? []).map((i) => i.image_url as string),
    4
  );
  if (!covers.length) return new Response("nothing to render", { status: 404 });

  const name = profile.display_name || `@${profile.username}`;

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
          padding: 80,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
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
            marginTop: 18,
            fontSize: 72,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            textAlign: "center",
          }}
        >
          {name}
        </div>

        {/* 2×2, second column offset — the wall, not a spreadsheet */}
        <div style={{ display: "flex", gap: 44, marginTop: 90 }}>
          {[0, 1].map((col) => (
            <div
              key={col}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 44,
                marginTop: col === 0 ? 0 : 90,
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
                    boxShadow: "0 12px 48px rgba(0,0,0,0.2)",
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", marginTop: 100, fontSize: 30, color: "#a1a1aa" }}>
          myfavoriteapp.com/{profile.username}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Geist Mono", data: regular, weight: 400, style: "normal" },
        { name: "Geist Mono", data: semibold, weight: 600, style: "normal" },
      ],
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Content-Disposition": `inline; filename="four-favorites-${profile.username}.png"`,
      },
    }
  );
}
