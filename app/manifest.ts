import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pan Batoh",
    short_name: "Batoh",
    description: "Městská hra pro děti 10+ s fyzickými úkoly po městě.",
    start_url: "/",
    display: "standalone",
    background_color: "#07111f",
    theme_color: "#07111f",
    lang: "cs",
    orientation: "portrait",
    categories: ["games", "education", "travel"]
  };
}
