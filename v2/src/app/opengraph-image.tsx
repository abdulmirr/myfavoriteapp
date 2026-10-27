import { ImageResponse } from "next/og";
import { cacheLife } from "next/cache";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Framed, type OgPiece } from "@/lib/og-frames";

/**
 * The default share card — what any myfavoriteapp.com link looks like when
 * it's shared (LinkedIn, X, iMessage, Slack…) unless a route brings its own
 * card (profiles do). In the v2 look: the gray page, the gold star beside the
 * lowercase wordmark in Inter, and a wall of real covers wearing the wall's
 * light frames (poster / book / vinyl), bleeding off the edges the way the
 * wall continues past the frame.
 *
 * Everything is read from disk so the render never depends on the network,
 * and nothing here is request-time, so Next renders it once at build.
 * Satori rules: only flexbox, every multi-child box says `display: flex`,
 * later siblings paint over earlier ones (that's how the record sits behind
 * the sleeve — no z-index), and fonts must be ttf/otf/woff.
 */

export const alt = "Favorite — find your next favorite";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Piece = OgPiece & { file: string };

// 3×3, read left→right, top→bottom. w/h are the object's on-card pixels
// (posters and books fill 92% of the cell's height, sleeves 86%); tilts
// follow the library's whisper rule — most sit straight, a few lean ≤1°.
const CELL = 230;
const GAP = 34;
const WALL_LEFT = 557; // the third column straddles the right edge
const WALL_TOP = -64; // the rows bleed evenly top and bottom
const WALL: Piece[] = [
  { file: "album-igor.jpg", frame: "vinyl", w: 198, h: 198, tilt: 0 },
  { file: "film-la-la-land.jpg", frame: "poster", w: 141, h: 211, tilt: -0.9 },
  { file: "book-sapiens.jpg", frame: "book", w: 134, h: 211, tilt: 0 },
  { file: "book-dune.jpg", frame: "book", w: 118, h: 211, tilt: 0.8 },
  { file: "album-blonde.jpg", frame: "vinyl", w: 198, h: 198, tilt: 0 },
  { file: "tv-severance.jpg", frame: "poster", w: 141, h: 211, tilt: 0 },
  { file: "podcast-acquired.jpg", frame: "bare", w: 198, h: 198, tilt: -1 },
  { file: "film-spirited-away.jpg", frame: "poster", w: 141, h: 211, tilt: 0 },
  { file: "album-in-rainbows.jpg", frame: "vinyl", w: 198, h: 198, tilt: 0.7 },
];

/**
 * Every byte the card needs, read from disk once and cached — uncached file
 * reads would make Cache Components render the card on every request.
 */
async function cardAssets() {
  "use cache";
  cacheLife("max");
  const root = process.cwd();
  const [bold, medium, starSvg] = await Promise.all([
    readFile(join(root, "src/fonts/Inter-Bold.ttf")),
    readFile(join(root, "src/fonts/Inter-Medium.ttf")),
    readFile(join(root, "public/faviconstar.svg"), "utf8"),
  ]);
  const covers = await Promise.all(
    WALL.map((p) => readFile(join(root, "public/landing/covers", p.file)))
  );
  return {
    bold: bold.toString("base64"),
    medium: medium.toString("base64"),
    starPath: /\sd="([^"]+)"/.exec(starSvg)?.[1] ?? "",
    srcs: covers.map((b) => `data:image/jpeg;base64,${b.toString("base64")}`),
  };
}

export default async function Image() {
  const assets = await cardAssets();
  const { starPath, srcs } = assets;
  const bold = Buffer.from(assets.bold, "base64");
  const medium = Buffer.from(assets.medium, "base64");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#f3f4f6",
          color: "#111827",
          fontFamily: "Inter",
        }}
      >
        {/* the copy */}
        <div
          style={{
            position: "absolute",
            left: 72,
            top: 0,
            bottom: 0,
            width: 470,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", marginBottom: 44 }}>
            <svg viewBox="0 0 1017.42 1017.7" width={40} height={40} style={{ marginRight: 10 }}>
              <path d={starPath} fill="#f7a71e" />
            </svg>
            <div style={{ display: "flex", fontSize: 46, fontWeight: 700, letterSpacing: "-0.055em", lineHeight: 1 }}>
              favorite
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: "-0.04em",
            }}
          >
            <div>Find your next</div>
            <div>favorite.</div>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 22,
              fontWeight: 500,
              lineHeight: 1.45,
              letterSpacing: "-0.01em",
              color: "#6b7280",
            }}
          >
            What people with taste love — books, films, music and more, picked fresh every day.
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 72,
            bottom: 52,
            display: "flex",
            fontSize: 18,
            fontWeight: 500,
            color: "#9ca3af",
          }}
        >
          myfavoriteapp.com
        </div>

        {/* the wall */}
        {WALL.map((p, i) => (
          <div
            key={p.file}
            style={{
              position: "absolute",
              left: WALL_LEFT + (i % 3) * (CELL + GAP),
              top: WALL_TOP + Math.floor(i / 3) * (CELL + GAP),
              width: CELL,
              height: CELL,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Framed p={p} src={srcs[i]} />
          </div>
        ))}
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: bold, weight: 700, style: "normal" },
        { name: "Inter", data: medium, weight: 500, style: "normal" },
      ],
    }
  );
}
