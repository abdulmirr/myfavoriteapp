import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes "add to home screen" produce a real app tile
 * instead of a bookmark glyph. Icons are the star mark rasterized from
 * src/app/icon.svg (regenerate with Playwright if the mark changes).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Favorite",
    short_name: "Favorite",
    description: "Discover what people with taste love — books, films, music and more, picked fresh every day.",
    start_url: "/",
    display: "standalone",
    // the page gray, so the splash and the status bar match the app
    background_color: "#f3f4f6",
    theme_color: "#f3f4f6",
    icons: [
      { src: "/faviconstar.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
