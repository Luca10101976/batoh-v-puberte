import type { Metadata } from "next";
import { HomeScreen } from "@/components/home-screen";
import { getCatalog, getGameplayLocation } from "@/lib/gameplay-server";

// R20: katalog je z DB; ISR zajistí, že se publikace/odpublikování hry projeví
// do 60 s bez nového deploye (stránka zůstává cachovatelná pro service worker).
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Domů | Traki na stopě tajemství",
  description: "Vyber hru, plň úkoly a sbírej body v městské hře pro děti.",
  alternates: {
    canonical: "/"
  }
};

export default async function HomePage() {
  const catalog = await getCatalog();
  const publishedLocations = (
    await Promise.all(catalog.map((entry) => getGameplayLocation(entry.locationId, catalog)))
  ).filter((location): location is NonNullable<Awaited<ReturnType<typeof getGameplayLocation>>> => Boolean(location));

  return <HomeScreen publishedLocations={publishedLocations} />;
}
