/**
 * The wall's physical frames for share cards (satori): vinyl peeking from the
 * sleeve, a book's page edge, a poster in a white snap frame. Satori rules:
 * only flexbox, every multi-child box says `display: flex`, later siblings
 * paint over earlier ones (that's how the record sits behind the sleeve).
 */

export type OgFrame = "vinyl" | "poster" | "book" | "bare";
export type OgPiece = { frame: OgFrame; w: number; h: number; tilt: number };

/** Which frame a medium wears (the app's Framed, minus photos/screens). */
export function frameFor(mediaType: string): OgFrame {
  if (mediaType === "music") return "vinyl";
  if (mediaType === "book") return "book";
  if (mediaType === "movie" || mediaType === "tv") return "poster";
  return "bare";
}

/** Fit a cover of natural size w×h into a square cell, leaving room for its frame. */
export function fitPiece(frame: OgFrame, w: number, h: number, cell: number, tilt = 0): OgPiece {
  const ratio = w > 0 && h > 0 ? w / h : 1;
  // vinyl leaves room for the record, posters for their frame
  const box = cell * (frame === "vinyl" ? 0.84 : frame === "poster" ? 0.88 : 0.92);
  const fw = ratio >= 1 ? box : Math.round(box * ratio);
  const fh = ratio >= 1 ? Math.round(box / ratio) : box;
  return { frame, w: Math.round(fw), h: Math.round(fh), tilt };
}

// the wall's .obj-shadow, scaled up for a card seen at thumbnail size
const SHADOW = "0 2px 4px rgba(16,24,40,0.10), 0 16px 36px rgba(16,24,40,0.16)";

export function Framed({ p, src }: { p: OgPiece; src: string }) {
  const rotate = `rotate(${p.tilt}deg)`;
  const cover = (extra: React.CSSProperties = {}) => (
    // satori renders plain <img>; next/image doesn't exist in an ImageResponse
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={p.w}
      height={p.h}
      style={{ width: p.w, height: p.h, objectFit: "cover", ...extra }}
    />
  );

  if (p.frame === "poster") {
    // a one-sheet behind glass in a white snap frame (the light-theme frame)
    return (
      <div
        style={{
          display: "flex",
          position: "relative",
          transform: rotate,
          padding: 6,
          background: "#ffffff",
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
          style={{ position: "absolute", top: 2, bottom: 2, right: -5, width: 5, background: "#e9e5da" }}
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
            background: "#1d1d20",
            boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
          }}
        />
        {cover({ boxShadow: SHADOW })}
      </div>
    );
  }

  return <div style={{ display: "flex", transform: rotate, boxShadow: SHADOW }}>{cover()}</div>;
}

