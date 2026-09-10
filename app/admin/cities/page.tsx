import Link from "next/link";
import { deleteCityAction, toggleCityActiveAction } from "@/app/admin/cities/actions";
import { loadCities } from "@/lib/cities-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function statusText(status?: string) {
  switch (status) {
    case "created":
      return { text: "✅ Město bylo vytvořené.", tone: "ok" as const };
    case "activated":
      return { text: "✅ Město je aktivní a nabízí se u nových her.", tone: "ok" as const };
    case "deactivated":
      return { text: "🙈 Město je vypnuté a u nových her se nenabízí.", tone: "ok" as const };
    case "deleted":
      return { text: "🗑️ Město bylo smazané.", tone: "ok" as const };
    case "city_has_missions":
      return {
        text: "🚫 Tohle město má hry, takže ho nejde smazat. Když ho nechceš nabízet, vypni ho.",
        tone: "error" as const
      };
    case "error":
      return { text: "❌ Akce se nepovedla.", tone: "error" as const };
    default:
      return null;
  }
}

export default async function AdminCitiesPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const supabase = getSupabaseServerClient();
  const cities = await loadCities(supabase);
  const { data: missionRows } = await supabase.from("missions").select("id, city_id, is_published");
  const missions = (missionRows as Array<{ id: string; city_id: string | null; is_published: boolean }> | null) ?? [];
  const status = statusText(resolved?.status);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-10">
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Mozek</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Města</h1>
            <p className="mt-2 max-w-2xl text-sm text-mist">
              Města, ve kterých Traki nabízí hry. Vypnuté město se u nových her nenabízí, ale jeho publikované hry
              zůstávají hráčům dostupné.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/mozek" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
              Hry
            </Link>
            <Link href="/mozek/cities/new" className="rounded-2xl bg-lime px-4 py-3 text-sm font-semibold text-night">
              ➕ Nové město
            </Link>
          </div>
        </div>
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
        </section>
      ) : null}

      <section className="space-y-3">
        {cities.length === 0 ? (
          <div className="glass-card p-5 text-sm text-mist">Zatím tu není žádné město.</div>
        ) : null}

        {cities.map((city) => {
          const cityMissions = missions.filter((mission) => mission.city_id === city.id);
          const published = cityMissions.filter((mission) => mission.is_published).length;

          return (
            <article key={city.id} className="glass-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{city.name}</h2>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        city.isActive ? "bg-lime/15 text-lime" : "bg-white/10 text-mist"
                      }`}
                    >
                      {city.isActive ? "Aktivní" : "Vypnuté"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-mist">
                    Hry v {city.nameLocative || city.name} • pořadí {city.displayOrder} • identifikátor {city.slug}
                  </p>
                  <p className="mt-1 text-sm text-mist">
                    {cityMissions.length === 0
                      ? "Zatím tu není žádná hra."
                      : `${cityMissions.length} her, z toho ${published} publikovaných`}
                  </p>
                </div>

                <div className="grid w-full gap-2 sm:w-56">
                  <Link
                    href={`/mozek/cities/${city.id}`}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold"
                  >
                    Upravit město
                  </Link>
                  <form action={toggleCityActiveAction}>
                    <input type="hidden" name="city_id" value={city.id} />
                    <input type="hidden" name="next_active" value={city.isActive ? "false" : "true"} />
                    <button
                      type="submit"
                      className={`w-full rounded-xl px-4 py-3 text-center text-sm font-semibold ${
                        city.isActive
                          ? "border border-amber-300/30 bg-amber-300/10 text-amber-100"
                          : "bg-lime/20 text-lime"
                      }`}
                    >
                      {city.isActive ? "Vypnout město" : "Zapnout město"}
                    </button>
                  </form>
                  {cityMissions.length === 0 ? (
                    <form action={deleteCityAction}>
                      <input type="hidden" name="city_id" value={city.id} />
                      <button
                        type="submit"
                        className="w-full rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral"
                      >
                        Smazat město
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
