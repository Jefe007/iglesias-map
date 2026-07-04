import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Browsers/CDNs must always re-check for a new service worker so a
        // phone that hasn't opened the app in a while updates its offline
        // caching logic instead of running whatever shipped the last time it
        // happened to be online.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
