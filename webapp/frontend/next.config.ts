import type { NextConfig } from "next";

const rawBackendUrl = process.env.BACKEND_URL || "http://localhost:8000";
const backendUrl = rawBackendUrl.startsWith("http") ? rawBackendUrl : `https://${rawBackendUrl}`;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
