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
