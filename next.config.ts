import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /** Tree-shake barrel imports: only pull symbols actually used */
    optimizePackageImports: [
      "chart.js",
      "react-chartjs-2",
      "@supabase/supabase-js",
    ],
  },
  async redirects() {
    return [
      { source: '/tools/financial-health-check', destination: '/dashboard/financial-health', permanent: true },
      { source: '/dashboard/tools/financial-health', destination: '/dashboard/financial-health', permanent: true },
    ]
  },
};

export default nextConfig;
