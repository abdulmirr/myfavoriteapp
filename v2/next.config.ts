import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages ship as prerendered static shells (public data cached with
  // `use cache` + tags); only per-request parts stream. Partial prefetching
  // makes every in-app link land instantly. See PLAN.md §4.3.
  cacheComponents: true,
  partialPrefetching: true,
  // v2 lives inside the v1 repo (two lockfiles) — pin the root to this app
  turbopack: { root: process.cwd() },
  // addresses that moved: v1's Explore became the feed, its Friends tab
  // (/?feed=following) is the Friends page again, the profile editor became
  // Settings, and the profile Activity tab folded into Friends
  async redirects() {
    return [
      { source: "/explore", destination: "/feed", permanent: true },
      { source: "/", has: [{ type: "query", key: "feed", value: "following" }], destination: "/friends", permanent: true },
      { source: "/profile", destination: "/settings", permanent: true },
      { source: "/:username/activity", destination: "/:username", permanent: true },
    ];
  },
  // No `images` config on purpose: covers render as plain <img> straight from
  // their source CDNs (no optimizer hop), so the /_next/image endpoint stays
  // closed to remote hosts.
};

export default nextConfig;
