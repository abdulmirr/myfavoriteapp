import { thumbCover } from "./img";
/**
 * Satori fetches <img> URLs itself, with no timeout, and one failed cover
 * rejects the whole render (Open Library's cover host fails frequently) —
 * fetch covers server-side instead, drop failures, and hand satori data URIs.
 */
export async function coverDataUris(urls: string[], max: number): Promise<string[]> {
  const fetched = await Promise.all(
    urls.slice(0, max * 2).map(async (u) => {
      try {
        // a share card shows covers ~200px wide — never pull a multi-MB upload
        const src = u.includes(".supabase.co/storage/") ? thumbCover(u, 400) : u;
        const r = await fetch(src, { signal: AbortSignal.timeout(4000) });
        if (!r.ok) return null;
        const mime = r.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
        if (!mime.startsWith("image/")) return null;
        return `data:${mime};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
      } catch {
        return null;
      }
    })
  );
  return fetched.filter((c): c is string => !!c).slice(0, max);
}

/** Natural pixel size of a PNG / JPEG / WebP / GIF from its header (0×0 if unknown). */
export function imageSize(buf: Buffer): { w: number; h: number } {
  try {
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") {
      return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    }
    if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
      const chunk = buf.toString("ascii", 12, 16);
      if (chunk === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
      }
      if (chunk === "VP8X") return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      // walk the segments to the frame header (SOFn)
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) return { w: 0, h: 0 };
        const m = buf[i + 1];
        if (m === 0xff) {
          i++;
          continue;
        }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch {}
  return { w: 0, h: 0 };
}

/** Like coverDataUris, keeping each cover's medium and natural size (for frames). */
export async function coverImages(
  rows: { image_url: string; media_type: string }[],
  max: number
): Promise<{ src: string; w: number; h: number; media_type: string }[]> {
  const fetched = await Promise.all(
    rows.slice(0, max * 2).map(async (row) => {
      try {
        const u = row.image_url;
        const src = u.includes(".supabase.co/storage/") ? thumbCover(u, 400) : u;
        const r = await fetch(src, {
          signal: AbortSignal.timeout(4000),
          headers: { Accept: "image/jpeg,image/png,image/*;q=0.8" },
        });
        if (!r.ok) return null;
        const mime = r.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
        if (!mime.startsWith("image/") || mime === "image/svg+xml") return null;
        const buf = Buffer.from(await r.arrayBuffer());
        const { w, h } = imageSize(buf);
        if (!w || !h) return null;
        return { src: `data:${mime};base64,${buf.toString("base64")}`, w, h, media_type: row.media_type };
      } catch {
        return null;
      }
    })
  );
  return fetched.filter((c): c is NonNullable<typeof c> => !!c).slice(0, max);
}
