import type { MetadataRoute } from "next";

/** KlaroPH PWA manifest — premium fintech, standalone app feel */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KlaroPH",
    short_name: "KlaroPH",
    description: "Financial clarity for every Filipino. Track goals, income, and expenses.",
    start_url: "/",
    display: "standalone",
    theme_color: "#0038A8",
    background_color: "#0038A8",
    orientation: "portrait-primary",
    scope: "/",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}
