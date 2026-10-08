import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { updateCityAction } from "@/app/admin/cities/actions";
import { CityForm } from "@/components/admin/city-form";
import { loadCities } from "@/lib/cities-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function CityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cities = await loadCities(getSupabaseServerClient());
  const city = cities.find((item) => item.id === id) ?? null;

  if (!city) {
    return (
      <main className="mx-auto w-full max-w-4xl py-8">
        <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          Město se nepodařilo načíst.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 pb-10">
      <section className="glass-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Breadcrumbs items={[{ label: "Města", href: "/mozek/cities" }, { label: city.name }]} />
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{city.name}</h1>
          </div>
        </div>
      </section>

      <CityForm action={updateCityAction} submitLabel="Uložit město" city={city} />
    </main>
  );
}
