import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  // Must match BASE_PATH in lib/config.ts and the GitHub Pages project path.
  basePath: "/greenclaim-bond",
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {},
};

export default nextConfig;
