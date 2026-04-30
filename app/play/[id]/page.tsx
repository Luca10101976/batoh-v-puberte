import { notFound } from "next/navigation";
import { PlayScreen } from "@/components/play-screen";
import { getGameplayLocation } from "@/lib/gameplay-server";

export default async function PlayPage({
  params
}: {
  params: { id: string };
}) {
  const location = await getGameplayLocation(params.id);

  if (!location) {
    notFound();
  }

  return <PlayScreen location={location} />;
}
