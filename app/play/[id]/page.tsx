import { notFound } from "next/navigation";
import { PlayScreen } from "@/components/play-screen";
import { locations } from "@/lib/mock-data";

export default function PlayPage({
  params
}: {
  params: { id: string };
}) {
  const location = locations.find((item) => item.id === params.id);

  if (!location) {
    notFound();
  }

  return <PlayScreen location={location} />;
}
