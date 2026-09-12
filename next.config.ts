import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["playroomkit"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
