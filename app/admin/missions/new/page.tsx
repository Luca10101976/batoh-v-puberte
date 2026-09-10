import Link from "next/link";
import { createMissionAction } from "@/app/admin/missions/actions";
import { MissionForm } from "@/components/admin/mission-form";
import { loadActiveCities } from "@/lib/cities-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function NewMissionPage() {
  const supabase = getSupabaseServerClient();
  const cities = await loadActiveCities(supabase);
  const { data } = await supabase.from("missions").select("id, title, city, is_published").order("title");
  const unlockCandidates = ((data as Array<{ id: string; title: string; city: string; is_published: boolean }> | null) ?? []).map(
    (row) => ({ id: row.id, title: row.title, city: row.city, isPublished: row.is_published })
  );

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-10">
      <section className="glass-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Mozek • Mise</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Nová hra</h1>
            <p className="mt-2 text-sm text-mist">Nová hra vzniká jako koncept. Publikuje se až po kontrole.</p>
          </div>
          <Link href="/mozek" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            Zpět
          </Link>
        </div>
      </section>

      <MissionForm
        action={createMissionAction}
        submitLabel="Vytvořit hru"
        cities={cities}
        unlockCandidates={unlockCandidates}
      />
    </main>
  );
}
