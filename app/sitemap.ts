import type { MetadataRoute } from "next";
import { locations } from "@/lib/mock-data";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://batoh-v-puberte.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      changeFrequency: "daily",
      priority: 1
    },
    {
      url: `${siteUrl}/leaderboard`,
      changeFrequency: "weekly",
      priority: 0.7
    }
  ];

  const locationRoutes: MetadataRoute.Sitemap = locations.map((location) => ({
    url: `${siteUrl}/locations/${location.id}`,
    changeFrequency: "weekly",
    priority: 0.8
  }));

  return [...staticRoutes, ...locationRoutes];
}
