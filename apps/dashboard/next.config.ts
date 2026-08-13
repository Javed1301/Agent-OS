import type { NextConfig } from "next";

const GATEWAY_URL =
  process.env.GATEWAY_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  "http://localhost:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${GATEWAY_URL}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${GATEWAY_URL}/health`,
      },
    ];
  },
};

export default nextConfig;
