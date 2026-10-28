import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { supabaseServer } from "@/lib/supabase";
import { avatarSrc } from "@/lib/img";
import { coverDataUris, coverImages } from "@/lib/og-covers";
import { fitPiece, frameFor, Framed } from "@/lib/og-frames";

/**
 * A shared list's card — lists are made to be passed around like playlists,
 * so the link should look like one: the title big, whose it is, how many
 * things, and the first four covers in their frames (or the list's own
 * image when it has one). Private and missing lists get the plain brand card.
 */

export const alt = "A list on Favorite";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CELL = 236;
const GAP = 22;

type Owner = { id: string; username: string; display_name: string; avatar_url: string | null };
type ListRow = { id: string; title: string; slug: string; cover_image_url: string | null };

export default async function Image({ params }: { params: Promise<{ username: string; slug: string }> }) {
  const { username, slug } = await params;
  const db = supabaseServer();
  const fonts = join(process.cwd(), "src/fonts");

  const [{ data: owner }, bold, semibold, medium, starSvg] = await Promise.all([
    db
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("username", decodeURIComponent(username))
      .maybeSingle<Owner>(),
    readFile(join(fonts, "Inter-Bold.ttf")),
    readFile(join(fonts, "Inter-SemiBold.ttf")),
    readFile(join(fonts, "Inter-Medium.ttf")),
    readFile(join(process.cwd(), "public/faviconstar.svg"), "utf8"),
  ]);
  const starPath = /\sd="([^"]+)"/.exec(starSvg)?.[1] ?? "";

  // anonymous reads: RLS only ever returns public lists here
  const { data: list } = owner
    ? await db
        .from("lists")
        .select("id, title, slug, cover_image_url")
        .eq("profile_id", owner.id)
        .eq("slug", decodeURIComponent(slug))
        .maybeSingle<ListRow>()
    : { data: null };

  let covers: Awaited<ReturnType<typeof coverImages>> = [];
  let hero: string | null = null;
  let avatar: string | null = null;
  let count = 0;
  if (owner && list) {
    const [{ data: items, count: n }, face, own] = await Promise.all([
      db
        .from("list_items")
        .select("image_url, media_type", { count: "exact" })
        .eq("list_id", list.id)
        .order("position", { ascending: true })
        .limit(12),
      owner.avatar_url ? coverDataUris([avatarSrc(owner.avatar_url, 128)], 1) : Promise.resolve([]),
      list.cover_image_url ? coverDataUris([list.cover_image_url], 1) : Promise.resolve([]),
    ]);
    count = n ?? 0;
    avatar = face[0] ?? null;
    hero = own[0] ?? null;
    if (!hero) {
      const withArt = ((items ?? []) as { image_url: string | null; media_type: string }[]).filter(
        (r): r is { image_url: string; media_type: string } => !!r.image_url
      );
      covers = await coverImages(withArt, 4);
    }
  }

  const title = list ? (list.title.length > 70 ? `${list.title.slice(0, 68)}…` : list.title) : "A list on Favorite";
  const titleSize = title.length <= 18 ? 72 : title.length <= 36 ? 58 : 46;
  const name = owner ? owner.display_name || `@${owner.username}` : "";

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
        {/* the list */}
        <div
          style={{
            position: "absolute",
            left: 64,
            top: 64,
            bottom: 64,
            width: hero ? 470 : 500,
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
            <div style={{ display: "flex", fontSize: 22, fontWeight: 600, color: "#6b7280" }}>List</div>
            <div
              style={{
                display: "flex",
                marginTop: 10,
                fontSize: titleSize,
                fontWeight: 700,
                lineHeight: 1.04,
                letterSpacing: "-0.04em",
              }}
            >
              {title}
            </div>
            {owner && list && (
              <div style={{ display: "flex", alignItems: "center", marginTop: 26 }}>
                {avatar ? (
                  <img
                    src={avatar}
                    alt=""
                    width={44}
                    height={44}
                    style={{ width: 44, height: 44, borderRadius: 14, objectFit: "cover", marginRight: 14 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      marginRight: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#e5e7eb",
                      color: "#6b7280",
                      fontSize: 20,
                      fontWeight: 600,
                    }}
                  >
                    {(owner.display_name || owner.username).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div style={{ display: "flex", fontSize: 26, fontWeight: 600 }}>{name}</div>
                <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: "#6b7280", marginLeft: 12 }}>
                  · {count.toLocaleString("en-US")} {count === 1 ? "thing" : "things"}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", fontSize: 18, fontWeight: 500, color: "#9ca3af" }}>
            myfavoriteapp.com{owner && list ? `/${owner.username}/lists/${list.slug}` : ""}
          </div>
        </div>

        {/* what's in it */}
        {hero ? (
          <div style={{ position: "absolute", right: 64, top: 0, bottom: 0, display: "flex", alignItems: "center" }}>
            <img
              src={hero}
              alt=""
              width={560}
              height={315}
              style={{
                width: 560,
                height: 315,
                objectFit: "cover",
                borderRadius: 12,
                boxShadow: "0 2px 4px rgba(16,24,40,0.10), 0 16px 36px rgba(16,24,40,0.16)",
              }}
            />
          </div>
        ) : (
          (() => {
            // one big piece, a pair side by side, three as two-over-one, four as a square
            const cell = covers.length === 1 ? 400 : covers.length === 2 ? 250 : CELL;
            const rows = covers.length <= 2 ? 1 : 2;
            const width = covers.length === 1 ? cell : cell * 2 + GAP;
            return (
              <div
                style={{
                  position: "absolute",
                  right: 64,
                  top: (630 - (rows * cell + (rows - 1) * GAP)) / 2,
                  width,
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: GAP,
                }}
              >
                {covers.map((c, i) => (
                  <div
                    key={i}
                    style={{ width: cell, height: cell, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <Framed p={fitPiece(frameFor(c.media_type), c.w, c.h, cell)} src={c.src} />
                  </div>
                ))}
              </div>
            );
          })()
        )}
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
