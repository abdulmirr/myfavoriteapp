import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://myfavoriteapp.com";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/profile", "/signin", "/auth/", "/welcome"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
