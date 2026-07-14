import type { Metadata } from "next";
import { HomeScreen } from "@/components/home-screen";
import { getGameplayLocation, getPublishedLocationIds } from "@/lib/gameplay-server";

export const metadata: Metadata = {
  title: "Domů | Traki na stopě tajemství",
  description: "Vyber hru, plň úkoly a sbírej body v městské hře pro děti.",
  alternates: {
    canonical: "/"
  }
};

export default async function HomePage() {
  const publishedLocationIds = await getPublishedLocationIds();
  const publishedLocations = (
    await Promise.all(publishedLocationIds.map((locationId) => getGameplayLocation(locationId)))
  ).filter((location): location is NonNullable<Awaited<ReturnType<typeof getGameplayLocation>>> => Boolean(location));

  return <HomeScreen publishedLocations={publishedLocations} />;
}
