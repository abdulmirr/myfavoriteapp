import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes "add to home screen" produce a real app tile
 * instead of a bookmark glyph. Icons are the star mark rasterized from
 * src/app/icon.svg (regenerate with Playwright if the mark changes).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Favorites",
    short_name: "Favorites",
    description: "A library for everything you love.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
