import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { MissionWalkthrough } from "@/components/admin/mission-walkthrough";
import { loadMissionPreview } from "@/lib/mission-preview-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// R54: průchod hrou očima hráče. Čte stejný obsah jako hra (getGameplayEpisodes
// i pro koncept) a kreslí ho stejnými komponentami. Je za heslem Mozku, takže
// smí ukázat i správné odpovědi a nápovědy.
export const dynamic = "force-dynamic";

export default async function MissionWalkthroughPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preview = await loadMissionPreview(getSupabaseServerClient(), id);
  if (!preview) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-24">
      <section className="glass-card p-5">
        <Breadcrumbs
          items={[
            { label: "Hry", href: "/mozek" },
            { label: preview.title, href: `/mozek/missions/${preview.id}` },
            { label: "Projít jako hráč" }
          ]}
        />
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Projít jako hráč</h1>
        <p className="mt-2 text-sm text-mist">
          Obrazovky jdou za sebou tak, jak je uvidí hráč. {preview.isPublished ? "Hra je publikovaná." : "Hra je koncept – hráči ji zatím nevidí."}
        </p>
      </section>

      <MissionWalkthrough
        data={{
          missionId: preview.id,
          title: preview.title,
          heroImageUrl: preview.heroImageUrl,
          introStory: preview.introStory,
          episodes: preview.episodes,
          endingTitle: preview.endingTitle,
          endingText: preview.endingText,
          endingPlayerMessage: preview.endingPlayerMessage,
          endingBubbles: preview.endingBubbles
        }}
      />
    </main>
  );
}
