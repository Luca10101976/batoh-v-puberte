import Link from "next/link";
import { deleteMissionAction, deleteStopAction, enableMozekEditingAction, toggleMissionPublishAction } from "@/app/admin/missions/actions";
import type { MissionRow, MissionStopRow } from "@/app/admin/types";
import { normalizeMissionTaskAnswersInDatabase } from "@/lib/mission-task-normalization";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { locations, nearbyMissions } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

function statusText(status?: string) {
  switch (status) {
    case "bootstrapped":
      return { text: "✅ Mozek jsme naplnili aktuálním obsahem webu.", tone: "ok" as const };
    case "import_enabled":
      return { text: "✅ Obsah webu jsme propsali do databáze. Teď už jde normálně editovat.", tone: "ok" as const };
    case "already_ready":
      return { text: "✅ Databázový obsah už je připravený. Editace je zapnutá.", tone: "ok" as const };
    case "import_failed":
      return { text: "❌ Nepodařilo se převést obsah webu do databáze.", tone: "error" as const };
    case "published":
      return { text: "✅ Mise je publikovaná a viditelná pro hráče.", tone: "ok" as const };
    case "unpublished":
      return { text: "🙈 Mise je teď jen koncept a hráči ji nevidí.", tone: "ok" as const };
    case "created":
      return { text: "✅ Mise byla vytvořená.", tone: "ok" as const };
    case "deleted":
      return { text: "🗑️ Mise byla smazaná.", tone: "ok" as const };
    case "stop_created":
      return { text: "✅ Zastavení bylo přidané.", tone: "ok" as const };
    case "stop_deleted":
      return { text: "🗑️ Zastavení bylo smazané.", tone: "ok" as const };
    case "error":
      return { text: "❌ Akce se nepovedla. Zkus to prosím znovu.", tone: "error" as const };
    default:
      return null;
  }
}

function mockMissionId(locationId: string) {
  return `mock-${locationId}`;
}

function mockStopId(locationId: string, episodeId: string) {
  return `mock-${locationId}-${episodeId}`;
}

function getFallbackMissions(): MissionRow[] {
  return nearbyMissions.flatMap((mission, index) => {
    const location = locations.find((item) => item.id === mission.locationId);
    if (!location) {
      return [];
    }

    return {
      id: mockMissionId(location.id),
      title: mission.name,
      city: location.city,
      intro_text: location.introStory || location.story || location.teaser,
      difficulty: location.difficulty === "Lehká" ? "lehka" : location.difficulty === "Vyšší" ? "tezka" : "stredni",
      duration_min: Math.max(
        ...((location.duration.match(/\d+/g) ?? ["45"])
          .map((item) => Number(item))
          .filter((item) => Number.isFinite(item)) || [45])
      ),
      points: Number(mission.boost.match(/\d+/)?.[0] ?? 120),
      is_published: true,
      created_at: new Date(Date.UTC(2024, 0, index + 1)).toISOString()
    };
  });
}

function getFallbackStops(): MissionStopRow[] {
  return nearbyMissions.flatMap((mission) => {
    const location = locations.find((item) => item.id === mission.locationId);
    if (!location) {
      return [];
    }

    return location.episodes.map((episode, index) => ({
      id: mockStopId(location.id, episode.id),
      mission_id: mockMissionId(location.id),
      title: episode.name,
      description: [episode.intro, episode.background].filter(Boolean).join("\n\n"),
      image_url: episode.illustrationImage || location.image,
      order: index + 1
    }));
  });
}

function missionCanonicalKey(mission: { city: string; title: string }) {
  return `${mission.city.trim().toLowerCase()}::${mission.title.trim().toLowerCase()}`;
}

function getCanonicalMissionKeys() {
  return new Set(
    nearbyMissions
      .map((mission) => {
        const location = locations.find((item) => item.id === mission.locationId);
        if (!location) {
          return null;
        }

        return missionCanonicalKey({ city: location.city, title: mission.name });
      })
      .filter((value): value is string => Boolean(value))
  );
}

function getVisibleDatabaseMissions(missions: MissionRow[]) {
  const canonicalKeys = getCanonicalMissionKeys();
  const seenKeys = new Set<string>();

  return missions.filter((mission) => {
    const key = missionCanonicalKey(mission);
    if (!canonicalKeys.has(key) || seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

export default async function AdminMissionsPage({
  searchParams
}: {
  searchParams?: { status?: string };
}) {
  const supabase = getSupabaseServerClient();
  await (async () => {
    const { data: tasks } = await supabase
      .from("mission_tasks")
      .select("id, type, question, correct_answer, options");

    if (!tasks?.length) {
      return;
    }

    await normalizeMissionTaskAnswersInDatabase(supabase, tasks as Array<{
      id: string;
      type: "otevrena" | "vyber" | "ano-ne";
      question: string;
      correct_answer: string;
      options: unknown;
    }>);
  })().catch(() => undefined);

  const [{ data, error }, { data: stopsData, error: stopsError }] = await Promise.all([
    supabase
      .from("missions")
      .select("id, title, city, difficulty, is_published, created_at, intro_text, duration_min, points")
      .order("created_at", { ascending: false }),
    supabase
      .from("mission_stops")
      .select("id, mission_id, title, description, image_url, order")
      .order("mission_id", { ascending: true })
      .order("order", { ascending: true })
  ]);

  const dbMissions = ((data ?? []) as MissionRow[]) ?? [];
  const dbStops = ((stopsData ?? []) as MissionStopRow[]) ?? [];
  const status = statusText(searchParams?.status);

  const isUsingFallbackContent = !error && !stopsError && dbMissions.length === 0;
  const visibleDatabaseMissions = getVisibleDatabaseMissions(dbMissions);
  const visibleDatabaseMissionIds = new Set(visibleDatabaseMissions.map((mission) => mission.id));
  const missions = isUsingFallbackContent ? getFallbackMissions() : visibleDatabaseMissions;
  const allStops = isUsingFallbackContent
    ? getFallbackStops()
    : dbStops.filter((stop) => visibleDatabaseMissionIds.has(stop.mission_id));

  const stopsByMission = new Map<string, MissionStopRow[]>();
  allStops.forEach((stop) => {
    const missionStops = stopsByMission.get(stop.mission_id) ?? [];
    missionStops.push(stop);
    stopsByMission.set(stop.mission_id, missionStops);
  });

  const publishedCount = missions.filter((mission) => mission.is_published).length;
  const draftCount = missions.length - publishedCount;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 pb-10">
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Mozek</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Obsah webu</h1>
            <p className="mt-2 max-w-2xl text-sm text-mist">
              Přehled toho, co se opravdu zobrazuje ve hře. Tady můžete přidávat, ubírat a upravovat mise i jejich zastavení.
            </p>
          </div>
          <Link href="/mozek/missions/new" className="rounded-2xl bg-lime px-4 py-3 text-sm font-semibold text-night">
            ➕ Nová mise
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-mist">Mise</p>
          <p className="mt-2 text-3xl font-bold">{missions.length}</p>
          <p className="mt-1 text-sm text-mist">Celkový počet misí</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-mist">Publikováno</p>
          <p className="mt-2 text-3xl font-bold">{publishedCount}</p>
          <p className="mt-1 text-sm text-mist">{draftCount} misí je zatím v konceptu</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-mist">Zastavení</p>
          <p className="mt-2 text-3xl font-bold">{allStops.length}</p>
          <p className="mt-1 text-sm text-mist">Body, které hráči na webu prochází</p>
        </div>
      </section>

      {status ? (
        <section
          className={`rounded-2xl px-4 py-3 text-sm ${
            status.tone === "ok" ? "border border-lime/30 bg-lime/10 text-lime" : "border border-coral/30 bg-coral/10 text-coral"
          }`}
        >
          {status.text}
        </section>
      ) : null}

      {isUsingFallbackContent ? (
        <section className="rounded-2xl border border-sky/30 bg-sky/10 px-4 py-3 text-sm text-sky">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              Databáze je zatím prázdná, takže Mozek teď ukazuje aktuální obsah přímo z webu. Pro skutečnou editaci ho potřebujeme jedním krokem propsat do databáze.
            </p>
            <form action={enableMozekEditingAction}>
              <button
                type="submit"
                className="rounded-xl bg-sky px-4 py-2 text-sm font-semibold text-night"
              >
                Zapnout editaci
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          Nepodařilo se načíst mise: {error.message}
        </section>
      ) : null}

      {stopsError ? (
        <section className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          Nepodařilo se načíst zastavení: {stopsError.message}
        </section>
      ) : null}

      <section className="space-y-4">
        {missions.length === 0 ? (
          <div className="glass-card p-5 text-sm text-mist">Zatím tu není žádná mise.</div>
        ) : null}

        {missions.map((mission) => {
          const missionStops = stopsByMission.get(mission.id) ?? [];

          return (
            <article key={mission.id} className="glass-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-semibold">{mission.title}</h2>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        mission.is_published ? "bg-lime/15 text-lime" : "bg-white/10 text-mist"
                      }`}
                    >
                      {mission.is_published ? "Publikováno" : "Koncept"}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-mist">
                    {mission.city} • obtížnost: {mission.difficulty} • {mission.duration_min} min • {mission.points} bodů
                  </p>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-mist">Úvod mise na webu</p>
                    <p className="mt-2 text-sm leading-6 text-white/90">{mission.intro_text}</p>
                  </div>
                </div>

                <div className="grid w-full gap-3 sm:w-56">
                  {mission.id.startsWith("mock-") ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-mist">
                      Náhled živého obsahu webu. Jakmile mise poběží z databáze, objeví se tu i plná editace.
                    </div>
                  ) : (
                    <>
                      <form action={toggleMissionPublishAction}>
                        <input type="hidden" name="mission_id" value={mission.id} />
                        <input type="hidden" name="next_published" value={mission.is_published ? "false" : "true"} />
                        <button
                          type="submit"
                          className={`w-full rounded-xl px-4 py-3 text-center text-sm font-semibold ${
                            mission.is_published
                              ? "border border-amber-300/30 bg-amber-300/10 text-amber-100"
                              : "bg-lime/20 text-lime"
                          }`}
                        >
                          {mission.is_published ? "Stáhnout z publikace" : "Publikovat"}
                        </button>
                      </form>
                      <Link
                        href={`/mozek/missions/${mission.id}`}
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold"
                      >
                        Upravit misi
                      </Link>
                      <Link
                        href={`/mozek/stops/new?missionId=${mission.id}`}
                        className="rounded-xl bg-lime px-4 py-3 text-center text-sm font-semibold text-night"
                      >
                        Přidat zastavení
                      </Link>
                      <form action={deleteMissionAction}>
                        <input type="hidden" name="mission_id" value={mission.id} />
                        <button
                          type="submit"
                          className="w-full rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral"
                        >
                          Smazat misi
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>

              <section className="mt-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Zastavení v misi</h3>
                    <p className="text-sm text-mist">
                      {missionStops.length === 0 ? "Mise ještě nemá žádné zastavení." : `${missionStops.length} zastavení k editaci`}
                    </p>
                  </div>
                </div>

                {missionStops.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-mist">
                    Tady se zatím nic neukazuje. Přidejte první zastavení a hned bude vidět v obsahu mise.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {missionStops.map((stop) => (
                      <div key={stop.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="max-w-3xl">
                            <p className="text-xs uppercase tracking-[0.2em] text-sky">Zastavení {stop.order}</p>
                            <h4 className="mt-1 text-lg font-semibold">{stop.title}</h4>
                            <p className="mt-2 text-sm leading-6 text-mist">
                              {stop.description?.trim() || "Zatím bez popisu."}
                            </p>
                            <p className="mt-3 text-xs text-mist">
                              {stop.image_url?.trim() ? `Obrázek: ${stop.image_url}` : "Zatím bez obrázku."}
                            </p>
                          </div>

                          {stop.id.startsWith("mock-") ? (
                            <div className="rounded-xl border border-white/10 bg-night/30 px-3 py-2 text-center text-sm text-mist">
                              Náhled z webu
                            </div>
                          ) : (
                            <div className="grid w-full gap-2 sm:w-44">
                              <Link
                                href={`/mozek/stops/${stop.id}`}
                                className="rounded-xl border border-white/10 bg-night/30 px-3 py-2 text-center text-sm font-semibold"
                              >
                                Upravit
                              </Link>
                              <form action={deleteStopAction}>
                                <input type="hidden" name="mission_id" value={mission.id} />
                                <input type="hidden" name="stop_id" value={stop.id} />
                                <button
                                  type="submit"
                                  className="w-full rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-sm font-semibold text-coral"
                                >
                                  Smazat
                                </button>
                              </form>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </article>
          );
        })}
      </section>
    </main>
  );
}
