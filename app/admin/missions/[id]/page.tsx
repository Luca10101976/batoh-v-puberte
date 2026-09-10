import Link from "next/link";
import {
  deleteMissionAction,
  deleteStopAction,
  moveStopAction,
  toggleMissionPublishAction,
  updateMissionAction
} from "@/app/admin/missions/actions";
import type { MissionRow, MissionStopRow } from "@/app/admin/types";
import { MissionForm } from "@/components/admin/mission-form";
import { loadActiveCities, loadCities } from "@/lib/cities-server";
import { describeUsage } from "@/lib/mission-usage";
import { getMissionUsage } from "@/lib/mission-usage-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function statusText(status?: string) {
  switch (status) {
    case "created":
      return { text: "✅ Hra byla vytvořená jako koncept. Pokračuj přidáním zastavení.", tone: "ok" as const };
    case "saved":
      return { text: "✅ Hra byla uložená.", tone: "ok" as const };
    case "published":
      return { text: "✅ Hra je publikovaná a hráči ji vidí v katalogu.", tone: "ok" as const };
    case "unpublished":
      return {
        text: "🙈 Hra je teď koncept a hráči ji nevidí. Body, které v ní hráči získali, jim zůstávají.",
        tone: "ok" as const
      };
    case "stop_created":
      return { text: "✅ Zastavení bylo přidané.", tone: "ok" as const };
    case "stop_deleted":
      return { text: "🗑️ Zastavení bylo smazané.", tone: "ok" as const };
    case "reordered":
      return { text: "✅ Pořadí zastavení bylo změněné.", tone: "ok" as const };
    case "reorder_edge":
      return { text: "Zastavení už je na kraji, dál se posunout nedá.", tone: "ok" as const };
    case "reorder_blocked":
      return { text: "🚫 Pořadí teď měnit nejde:", tone: "error" as const };
    case "publish_blocked":
      return { text: "🚫 Hru zatím nejde publikovat, protože by nešla dohrát. Oprav prosím tohle:", tone: "error" as const };
    case "delete_blocked":
      return { text: "🚫 Smazat to nejde:", tone: "error" as const };
    case "delete_not_confirmed":
      return { text: "Smazání se neprovedlo, protože nebylo potvrzené.", tone: "error" as const };
    case "error":
      return { text: "❌ Akce se nepovedla.", tone: "error" as const };
    default:
      return null;
  }
}

const MISSION_COLUMNS =
  "id, title, city, city_id, intro_text, short_description, hero_image_url, difficulty, duration_min, points, catalog_order, unlock_after_mission_id, is_published, first_published_at, created_at, ending_title, ending_text, ending_player_message";

export default async function MissionDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; issues?: string; confirm?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const supabase = getSupabaseServerClient();

  const { data: mission, error: missionError } = await supabase
    .from("missions")
    .select(MISSION_COLUMNS)
    .eq("id", id)
    .maybeSingle<MissionRow>();

  if (!mission || missionError) {
    return (
      <main className="mx-auto w-full max-w-5xl py-8">
        <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          Hru se nepodařilo načíst.
        </div>
      </main>
    );
  }

  const [allCities, activeCities, usage] = await Promise.all([
    loadCities(supabase),
    loadActiveCities(supabase),
    getMissionUsage(supabase, mission.id).catch(() => ({ activeRuns: 0, playersWithResult: 0, answers: 0 }))
  ]);

  // Vypnuté město se u nových her nenabízí, ale hra, která v něm už je, ho musí
  // ve výběru vidět – jinak by se nedala uložit.
  const ownCity = allCities.find((city) => city.id === mission.city_id);
  const cityOptions = ownCity && !activeCities.some((city) => city.id === ownCity.id)
    ? [...activeCities, ownCity]
    : activeCities;

  const { data: catalogRows } = await supabase
    .from("missions")
    .select("id, title, city, is_published")
    .neq("id", mission.id)
    .order("title");
  const unlockCandidates = ((catalogRows as Array<{ id: string; title: string; city: string; is_published: boolean }> | null) ?? []).map(
    (row) => ({ id: row.id, title: row.title, city: row.city, isPublished: row.is_published })
  );

  const { data: stops, error: stopsError } = await supabase
    .from("mission_stops")
    .select("id, mission_id, title, description, image_url, order")
    .eq("mission_id", mission.id)
    .order("order", { ascending: true });

  const orderedStops = ((stops ?? []) as MissionStopRow[]) ?? [];
  const status = statusText(resolvedSearchParams?.status);
  const issues = (resolvedSearchParams?.issues ?? "")
    .split(" | ")
    .map((item) => item.trim())
    .filter(Boolean);
  const confirmingDelete = resolvedSearchParams?.confirm === "delete";
  const isUsed = usage.activeRuns > 0 || usage.playersWithResult > 0 || usage.answers > 0;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-10">
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Mozek • Hra</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{mission.title}</h1>
            <p className="mt-2 text-sm text-mist">
              {mission.is_published ? "Publikováno pro hráče" : "Koncept – hráči ji nevidí"}
              {mission.first_published_at ? " • už byla někdy publikovaná" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/mozek/missions/${mission.id}/preview`}
              className="rounded-xl border border-sky/30 bg-sky/10 px-3 py-2 text-sm font-semibold text-sky"
            >
              Náhled hry
            </Link>
            <form action={toggleMissionPublishAction}>
              <input type="hidden" name="mission_id" value={mission.id} />
              <input type="hidden" name="next_published" value={mission.is_published ? "false" : "true"} />
              <button
                type="submit"
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                  mission.is_published
                    ? "border border-amber-300/30 bg-amber-300/10 text-amber-100"
                    : "bg-lime text-night"
                }`}
              >
                {mission.is_published ? "Vypnout publikaci" : "Publikovat hru"}
              </button>
            </form>
            <Link href="/mozek" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
              Zpět
            </Link>
          </div>
        </div>

        {/* R37: administrátorka musí vidět, že se hry někdo dotkl, dřív než do ní zasáhne. */}
        {isUsed ? (
          <p className="mt-4 rounded-2xl border border-sky/30 bg-sky/10 px-4 py-3 text-sm text-sky">
            {describeUsage(usage)} Zastávky a úkoly proto nejde mazat a pořadí se dá měnit jen ve chvíli, kdy hru nikdo
            nehraje. Když ji nechceš dál nabízet, vypni publikaci – hráčům zůstane v historii i s body.
          </p>
        ) : null}
      </section>

      {status ? (
        <section
          className={`rounded-2xl px-4 py-3 text-sm ${
            status.tone === "ok"
              ? "border border-lime/30 bg-lime/10 text-lime"
              : "border border-coral/30 bg-coral/10 text-coral"
          }`}
        >
          {status.text}
          {issues.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <MissionForm
        action={updateMissionAction}
        submitLabel="Uložit hru"
        mission={mission}
        cities={cityOptions}
        unlockCandidates={unlockCandidates}
      />

      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Zastavení</h2>
          <Link
            href={`/mozek/stops/new?missionId=${mission.id}`}
            className="rounded-xl bg-lime px-4 py-2 text-sm font-semibold text-night"
          >
            ➕ Přidat zastavení
          </Link>
        </div>

        {stopsError ? (
          <p className="mt-3 text-sm text-coral">Načtení zastavení selhalo: {stopsError.message}</p>
        ) : null}

        <div className="mt-4 space-y-3">
          {orderedStops.length === 0 ? (
            <div className="rounded-2xl bg-white/5 p-4">
              <p className="text-sm text-mist">Zatím nemáš žádné zastavení</p>
              <Link
                href={`/mozek/stops/new?missionId=${mission.id}`}
                className="mt-3 inline-flex rounded-xl bg-lime px-4 py-2 text-sm font-semibold text-night"
              >
                ➕ Přidat první zastavení
              </Link>
            </div>
          ) : null}

          {orderedStops.map((stop, index) => (
            <article key={stop.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-sky">Zastavení {index + 1}</p>
                  <p className="mt-1 font-semibold">{stop.title}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* R37: pořadí se mění šipkami a přečísluje se samo. */}
                  <form action={moveStopAction}>
                    <input type="hidden" name="mission_id" value={mission.id} />
                    <input type="hidden" name="stop_id" value={stop.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button
                      type="submit"
                      disabled={index === 0}
                      aria-label="Posunout nahoru"
                      className="rounded-xl border border-white/10 bg-night/30 px-3 py-2 text-xs font-semibold disabled:opacity-40"
                    >
                      ↑
                    </button>
                  </form>
                  <form action={moveStopAction}>
                    <input type="hidden" name="mission_id" value={mission.id} />
                    <input type="hidden" name="stop_id" value={stop.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      disabled={index === orderedStops.length - 1}
                      aria-label="Posunout dolů"
                      className="rounded-xl border border-white/10 bg-night/30 px-3 py-2 text-xs font-semibold disabled:opacity-40"
                    >
                      ↓
                    </button>
                  </form>
                  <Link
                    href={`/mozek/stops/${stop.id}`}
                    className="rounded-xl border border-white/10 bg-night/30 px-3 py-2 text-xs font-semibold"
                  >
                    Upravit
                  </Link>
                  {isUsed ? null : (
                    <form action={deleteStopAction}>
                      <input type="hidden" name="mission_id" value={mission.id} />
                      <input type="hidden" name="stop_id" value={stop.id} />
                      <input type="hidden" name="confirm" value="smazat" />
                      <button
                        type="submit"
                        className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-xs font-semibold text-coral"
                      >
                        Smazat
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* R37: mazání hry má vlastní potvrzovací krok a server ho stejně ověří znovu. */}
      <section className="glass-card p-5">
        <h2 className="section-title">Smazat hru</h2>
        {isUsed ? (
          <p className="mt-3 text-sm text-mist">
            {describeUsage(usage)} Takovou hru nejde smazat, protože by výsledky hráčů ukazovaly do prázdna. Použij
            vypnutí publikace.
          </p>
        ) : confirmingDelete ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-coral">
              Opravdu smazat hru „{mission.title}“ i se všemi jejími zastávkami a úkoly? Tohle nejde vrátit.
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={deleteMissionAction}>
                <input type="hidden" name="mission_id" value={mission.id} />
                <input type="hidden" name="confirm" value="smazat" />
                <button
                  type="submit"
                  className="rounded-xl border border-coral/30 bg-coral/20 px-4 py-3 text-sm font-semibold text-coral"
                >
                  Ano, smazat „{mission.title}“
                </button>
              </form>
              <Link
                href={`/mozek/missions/${mission.id}`}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold"
              >
                Nechat být
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-mist">Tuhle hru zatím nikdo nehrál, takže ji jde smazat.</p>
            <Link
              href={`/mozek/missions/${mission.id}?confirm=delete`}
              className="mt-3 inline-flex rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral"
            >
              Smazat hru…
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
