import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages ship as prerendered static shells (public data cached with
  // `use cache` + tags); only per-request parts stream. Partial prefetching
  // makes every in-app link land instantly. See PLAN.md §4.3.
  cacheComponents: true,
  partialPrefetching: true,
  // v2 lives inside the v1 repo (two lockfiles) — pin the root to this app
  turbopack: { root: process.cwd() },
  // v1 addresses that moved: Explore and Friends became the feed, the
  // profile editor became Settings
  async redirects() {
    return [
      { source: "/explore", destination: "/feed", permanent: true },
      { source: "/friends", destination: "/feed", permanent: true },
      { source: "/profile", destination: "/settings", permanent: true },
    ];
  },
  // No `images` config on purpose: covers render as plain <img> straight from
  // their source CDNs (no optimizer hop), so the /_next/image endpoint stays
  // closed to remote hosts.
};

export default nextConfig;
