import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@knox/shared", "@knox/config", "@knox/db"],
};

export default nextConfig;
