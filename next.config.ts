import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["playroomkit"],
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
