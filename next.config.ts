import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // artwork hosts the app actually uses (TMDB, iTunes, Deezer, Open Library, our bucket)
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "*.mzstatic.com" },
      { protocol: "https", hostname: "*.dzcdn.net" },
      { protocol: "https", hostname: "covers.openlibrary.org" },
      { protocol: "https", hostname: "bvpruvuenqdwilysgojy.supabase.co" },
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
};

export default nextConfig;
