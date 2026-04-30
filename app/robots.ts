import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://batoh-v-puberte.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/profile", "/paper-score", "/auth/callback"]
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
