import type { MetadataRoute } from "next";
import { getCatalog } from "@/lib/gameplay-server";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://batoh-v-puberte.vercel.app";

// R38: sitemap vychází z katalogu publikovaných her v databázi. Dřív se skládala
// z pevného seznamu v kódu, takže nabízela i rozepsanou hru, kterou hráč stejně
// nemůže otevřít – a naopak neznala hru vytvořenou v Mozku.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  let locationRoutes: MetadataRoute.Sitemap = [];
  try {
    const catalog = await getCatalog();
    locationRoutes = catalog.map((entry) => ({
      url: `${siteUrl}/locations/${entry.locationId}`,
      changeFrequency: "weekly" as const,
      priority: 0.8
    }));
  } catch {
    // Nedostupný katalog znamená sitemap bez her, ne sitemap ze starého seznamu.
    locationRoutes = [];
  }

  return [...staticRoutes, ...locationRoutes];
}
