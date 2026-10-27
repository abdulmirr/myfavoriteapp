import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

type Rows = {
  profiles: { username: string; created_at: string | null }[];
  canonicals: string[];
  lists: { username: string; slug: string; updated_at: string | null }[];
};

/** Everyone, every public list, every favorited work — refreshed hourly, never per request. */
async function sitemapRows(): Promise<Rows> {
  "use cache";
  cacheLife("hours");
  // an env-less build (Vercel preview without Preview env vars) still gets
  // the static entries rather than dying in prerender
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { profiles: [], canonicals: [], lists: [] };
  const db = supabaseServer();
  const [{ data: profiles }, { data: canon }, { data: lists }] = await Promise.all([
    db.from("profiles").select("username, created_at").not("user_id", "is", null).limit(5000),
    // one page per canonical work anyone has favorited — the long-tail surface
    db.from("items").select("canonical_id").not("canonical_id", "is", null).limit(10000),
    db
      .from("lists")
      .select("slug, updated_at, owner:profiles!lists_profile_id_fkey(username)")
      .eq("is_public", true)
      .limit(5000),
  ]);
  type ListRow = { slug: string; updated_at: string | null; owner: { username: string } | null };
  return {
    profiles: (profiles ?? []) as Rows["profiles"],
    canonicals: [...new Set(((canon ?? []) as { canonical_id: string }[]).map((c) => c.canonical_id))],
    lists: ((lists ?? []) as unknown as ListRow[])
      .filter((l) => l.owner)
      .map((l) => ({ username: l.owner!.username, slug: l.slug, updated_at: l.updated_at })),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://myfavoriteapp.com";
  const { profiles, canonicals, lists } = await sitemapRows();
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/feed`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
    ...profiles.map((p) => ({
      url: `${base}/${p.username}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      lastModified: p.created_at ? new Date(p.created_at) : undefined,
    })),
    ...lists.map((l) => ({
      url: `${base}/${l.username}/lists/${encodeURIComponent(l.slug)}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      lastModified: l.updated_at ? new Date(l.updated_at) : undefined,
    })),
    ...canonicals.map((id) => ({
      url: `${base}/item/${id.split("/").map(encodeURIComponent).join("/")}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
