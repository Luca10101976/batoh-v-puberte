import Link from "next/link";
import { deleteStopAction, toggleMissionPublishAction, updateMissionAction } from "@/app/admin/missions/actions";
import type { MissionRow, MissionStopRow } from "@/app/admin/types";
import { MissionForm } from "@/components/admin/mission-form";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function statusText(status?: string) {
  switch (status) {
    case "created":
      return { text: "✅ Mise byla vytvořená. Pokračuj přidáním zastavení.", tone: "ok" as const };
    case "saved":
      return { text: "✅ Mise byla uložená.", tone: "ok" as const };
    case "published":
      return { text: "✅ Mise je publikovaná a viditelná pro hráče.", tone: "ok" as const };
    case "unpublished":
      return { text: "🙈 Mise je teď jen koncept a hráči ji nevidí.", tone: "ok" as const };
    case "stop_created":
      return { text: "✅ Zastavení bylo přidané.", tone: "ok" as const };
    case "stop_deleted":
      return { text: "🗑️ Zastavení bylo smazané.", tone: "ok" as const };
    case "error":
      return { text: "❌ Akce se nepovedla.", tone: "error" as const };
    default:
      return null;
  }
}

export default async function MissionDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { status?: string };
}) {
  const supabase = getSupabaseServerClient();
  let missionQuery = await supabase
    .from("missions")
    .select("id, title, city, intro_text, hero_image_url, difficulty, duration_min, points, is_published, created_at")
    .eq("id", params.id)
    .maybeSingle<MissionRow>();

  if (missionQuery.error?.message?.toLowerCase().includes("hero_image_url")) {
    missionQuery = await supabase
      .from("missions")
      .select("id, title, city, intro_text, difficulty, duration_min, points, is_published, created_at")
      .eq("id", params.id)
      .maybeSingle<MissionRow>();
  }

  const { data: mission, error: missionError } = missionQuery;

  if (!mission || missionError) {
    return (
      <main className="mx-auto w-full max-w-5xl py-8">
        <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          Misi se nepodařilo načíst.
        </div>
      </main>
    );
  }

  const { data: cityRows } = await supabase.from("missions").select("city").order("city", { ascending: true });
  const cities = [...new Set((cityRows ?? []).map((row) => String(row.city || "").trim()).filter(Boolean))];
  if (!cities.includes(mission.city)) {
    cities.push(mission.city);
  }

  const { data: stops, error: stopsError } = await supabase
    .from("mission_stops")
    .select("id, mission_id, title, description, image_url, order")
    .eq("mission_id", mission.id)
    .order("order", { ascending: true });

  const orderedStops = ((stops ?? []) as MissionStopRow[]) ?? [];
  const status = statusText(searchParams?.status);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-10">
      <section className="glass-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Mozek • Mise</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{mission.title}</h1>
            <p className="mt-2 text-sm text-mist">{mission.is_published ? "Publikováno pro hráče" : "Koncept - skryto pro hráče"}</p>
          </div>
          <div className="flex items-center gap-2">
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
                {mission.is_published ? "Stáhnout z publikace" : "Publikovat misi"}
              </button>
            </form>
            <Link href="/mozek" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
              Zpět
            </Link>
          </div>
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

      <MissionForm action={updateMissionAction} submitLabel="Uložit misi" mission={mission} cities={cities} />

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

          {orderedStops.map((stop) => (
            <article key={stop.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{stop.title}</p>
                  <p className="text-xs text-mist">Pořadí: {stop.order}</p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/mozek/stops/${stop.id}`}
                    className="rounded-xl border border-white/10 bg-night/30 px-3 py-2 text-xs font-semibold"
                  >
                    Edit
                  </Link>
                  <form action={deleteStopAction}>
                    <input type="hidden" name="mission_id" value={mission.id} />
                    <input type="hidden" name="stop_id" value={stop.id} />
                    <button
                      type="submit"
                      className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-xs font-semibold text-coral"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
