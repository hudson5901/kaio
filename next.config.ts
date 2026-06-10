import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "static.mercdn.net",
      },
    ],
  },
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
