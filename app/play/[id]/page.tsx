import { notFound } from "next/navigation";
import { PlayScreen } from "@/components/play-screen";
import { getGameplayLocation } from "@/lib/gameplay-server";

export default async function PlayPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const location = await getGameplayLocation(id);

  if (!location) {
    notFound();
  }

  return <PlayScreen location={location} />;
}
