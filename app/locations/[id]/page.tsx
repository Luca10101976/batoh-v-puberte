import { notFound } from "next/navigation";
import { LocationDetailScreen } from "@/components/location-detail-screen";
import { locations } from "@/lib/mock-data";

export default function LocationDetailPage({
  params
}: {
  params: { id: string };
}) {
  const location = locations.find((item) => item.id === params.id);

  if (!location) {
    notFound();
  }

  return <LocationDetailScreen location={location} />;
}
