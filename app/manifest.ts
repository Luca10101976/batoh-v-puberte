import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Batoh v pubertě",
    short_name: "Traki",
    description: "Městská hra s Trakim pro děti 10+ s fyzickými úkoly po městě.",
    start_url: "/",
    display: "standalone",
    scope: "/",
    background_color: "#07111f",
    theme_color: "#07111f",
    lang: "cs",
    orientation: "portrait",
    categories: ["games", "education", "travel"],
    icons: [
      {
        src: "/icons/traki-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/traki-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/traki-apple-icon-180.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any"
      }
    ]
  };
}
