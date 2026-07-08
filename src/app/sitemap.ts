import type { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabase";

// without this the sitemap is prerendered once at build time and new
// profiles never appear until the next deploy
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://myfavoriteapp.com";
  // an env-less build (Vercel preview without Preview env vars) still gets
  // the static entries rather than dying in prerender
  const [{ data: profiles }, { data: canon }] = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? await Promise.all([
        supabaseServer()
          .from("profiles")
          .select("username, created_at")
          .not("user_id", "is", null)
          .limit(5000),
        // one page per canonical work anyone has favorited — the long-tail surface
        supabaseServer()
          .from("items")
          .select("canonical_id")
          .not("canonical_id", "is", null)
          .limit(10000),
      ])
    : [{ data: [] }, { data: [] }];
  const canonicals = [...new Set((canon ?? []).map((c) => c.canonical_id as string))];

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
    ...(profiles ?? []).flatMap((p) => [
      {
        url: `${base}/${p.username}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
        lastModified: p.created_at ? new Date(p.created_at) : undefined,
      },
      {
        url: `${base}/${p.username}/four`,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      },
    ]),
    ...canonicals.map((id) => ({
      url: `${base}/item/${id.split("/").map(encodeURIComponent).join("/")}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
