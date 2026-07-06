import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The root share card — what myfavoriteapp.com itself looks like when shared
 * (the most-linked URL at launch). Mirrors the profile card's language: brand
 * mono, the tagline, and a strip of real covers. Everything is read from disk
 * so the render never depends on the network.
 */

export const alt = "Favorites — one page for your taste";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COVER_W = 148;
const COVER_H = 148; // albums — square
const COVERS = [
  "album-blonde.jpg",
  "album-igor.jpg",
  "album-in-rainbows.jpg",
  "album-currents.jpg",
];

export default async function Image() {
  const dir = join(process.cwd(), "public/landing/covers");
  const [regular, semibold, ...coverBufs] = await Promise.all([
    readFile(join(process.cwd(), "src/fonts/GeistMono-Regular.ttf")),
    readFile(join(process.cwd(), "src/fonts/GeistMono-SemiBold.ttf")),
    ...COVERS.map((f) => readFile(join(dir, f)).catch(() => null)),
  ]);
  const covers = coverBufs
    .filter((b) => b !== null)
    .map((b) => `data:image/jpeg;base64,${b!.toString("base64")}`);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          color: "#18181b",
          fontFamily: "Geist Mono",
          padding: 72,
        }}
      >
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

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              maxWidth: 760,
            }}
          >
            One page for your taste.
          </div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 26, color: "#a1a1aa" }}>
            The books, films and music you love — myfavoriteapp.com
          </div>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
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
