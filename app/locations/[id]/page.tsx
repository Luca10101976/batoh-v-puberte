import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocationDetailScreen } from "@/components/location-detail-screen";
import { getGameplayLocation } from "@/lib/gameplay-server";

type LocationDetailPageProps = {
  params: { id: string };
};

export async function generateMetadata({ params }: LocationDetailPageProps): Promise<Metadata> {
  const location = await getGameplayLocation(params.id);

  if (!location) {
    return {
      title: "Lokace nenalezena"
    };
  }

  return {
    title: `${location.name} | Batoh v pubertě`,
    description: location.teaser,
    alternates: {
      canonical: `/locations/${location.id}`
    },
    openGraph: {
      title: `${location.name} | Batoh v pubertě`,
      description: location.teaser,
      url: `/locations/${location.id}`,
      images: [
        {
          url: location.image,
          alt: location.name
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: `${location.name} | Batoh v pubertě`,
      description: location.teaser,
      images: [location.image]
    }
  };
}

export default async function LocationDetailPage({
  params
}: LocationDetailPageProps) {
  const location = await getGameplayLocation(params.id);

  if (!location) {
    notFound();
  }

  return <LocationDetailScreen location={location} />;
}
