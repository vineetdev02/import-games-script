import type { NextConfig } from "next";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /* Local admin tool — allow any remote image host so thumbnails/banners
   * from any provider render in the dashboard without per-host config. */
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
} as NextConfig;

export default nextConfig;
