import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The default share card — what any myfavoriteapp.com link looks like when
 * it's shared (LinkedIn, X, iMessage, Slack…) unless a route brings its own
 * card (profiles do). The landing hero's line set in Switzer, the star, and a
 * wall of real covers wearing the library's frames (poster / book / vinyl),
 * bleeding off the edges the way the wall continues past the frame.
 *
 * Everything is read from disk so the render never depends on the network,
 * and nothing here is request-time, so Next renders it once at build.
 * Satori rules: only flexbox, every multi-child box says `display: flex`,
 * later siblings paint over earlier ones (that's how the record sits behind
 * the sleeve — no z-index), and fonts must be ttf/otf/woff.
 */

export const alt = "Favorite — your taste, in one place";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Frame = "vinyl" | "poster" | "book" | "bare";
type Piece = { file: string; frame: Frame; w: number; h: number; tilt: number };

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

const SHADOW = "0 18px 48px rgba(0,0,0,0.55)";

function Framed({ p, src }: { p: Piece; src: string }) {
  const rotate = `rotate(${p.tilt}deg)`;
  const cover = (extra: React.CSSProperties = {}) => (
    <img
      src={src}
      alt=""
      width={p.w}
      height={p.h}
      style={{ width: p.w, height: p.h, objectFit: "cover", ...extra }}
    />
  );

  if (p.frame === "poster") {
    // a one-sheet behind glass in a thin snap frame (the dark-theme frame)
    return (
      <div
        style={{
          display: "flex",
          position: "relative",
          transform: rotate,
          padding: 4,
          background: "#211f1e",
          border: "1px solid #302e2b",
          boxShadow: SHADOW,
        }}
      >
        {cover()}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "linear-gradient(115deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 40%)",
          }}
        />
      </div>
    );
  }

  if (p.frame === "book") {
    // hinge shading along the spine, the page block peeking out on the right
    return (
      <div style={{ display: "flex", position: "relative", transform: rotate, boxShadow: SHADOW }}>
        {cover()}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: Math.round(p.w * 0.11),
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.03) 55%, rgba(0,0,0,0) 100%)",
          }}
        />
        <div
          style={{ position: "absolute", top: 2, bottom: 2, right: -5, width: 5, background: "#f3f1ea" }}
        />
      </div>
    );
  }

  if (p.frame === "vinyl") {
    // the record behind the sleeve — a crescent showing at the right
    const disc = Math.round(p.h * 0.93);
    return (
      <div style={{ display: "flex", position: "relative", transform: rotate }}>
        <div
          style={{
            position: "absolute",
            top: Math.round(p.h * 0.035),
            right: -12,
            width: disc,
            height: disc,
            borderRadius: disc / 2,
            background: "#2d2b29",
            boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
          }}
        />
        {cover({ boxShadow: SHADOW })}
      </div>
    );
  }

  return <div style={{ display: "flex", transform: rotate, boxShadow: SHADOW }}>{cover()}</div>;
}

export default async function Image() {
  const root = process.cwd();
  const [switzer, mono, starSvg] = await Promise.all([
    readFile(join(root, "src/fonts/Switzer-SemiBold.ttf")),
    readFile(join(root, "src/fonts/GeistMono-Regular.ttf")),
    readFile(join(root, "public/faviconstar.svg"), "utf8"),
  ]);
  const covers = await Promise.all(
    WALL.map((p) => readFile(join(root, "public/landing/covers", p.file)))
  );
  const starPath = /\sd="([^"]+)"/.exec(starSvg)?.[1] ?? "";
  const srcs = covers.map((b) => `data:image/jpeg;base64,${b.toString("base64")}`);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#101010",
          color: "#fbfbfa",
          fontFamily: "Switzer",
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
          <svg viewBox="0 0 1017.42 1017.7" width={44} height={44} style={{ marginBottom: 36 }}>
            <path d={starPath} fill="#f7a71e" />
          </svg>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 64,
              fontWeight: 600,
              lineHeight: 1.06,
              letterSpacing: "-0.025em",
            }}
          >
            <div>Your taste,</div>
            <div>in one place.</div>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              fontFamily: "Geist Mono",
              fontSize: 16,
              color: "#a2a19d",
            }}
          >
            Favorite is a library for everything you love.
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 72,
            bottom: 52,
            display: "flex",
            fontFamily: "Geist Mono",
            fontSize: 13,
            letterSpacing: "0.06em",
            color: "#757470",
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
        { name: "Switzer", data: switzer, weight: 600, style: "normal" },
        { name: "Geist Mono", data: mono, weight: 400, style: "normal" },
      ],
    }
  );
}
