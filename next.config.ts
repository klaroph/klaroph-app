import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/tools/financial-health-check', destination: '/dashboard/financial-health', permanent: true },
      { source: '/dashboard/tools/financial-health', destination: '/dashboard/financial-health', permanent: true },
    ]
  },
};

export default nextConfig;
