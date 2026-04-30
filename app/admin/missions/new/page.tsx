import Link from "next/link";
import { createMissionAction } from "@/app/admin/missions/actions";
import { MissionForm } from "@/components/admin/mission-form";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function NewMissionPage() {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from("missions").select("city").order("city", { ascending: true });
  const cities = [...new Set((data ?? []).map((row) => String(row.city || "").trim()).filter(Boolean))];
  const cityOptions = cities.length > 0 ? cities : ["Praha"];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-10">
      <section className="glass-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Mozek • Mise</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Nová mise</h1>
          </div>
          <Link href="/mozek" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            Zpět
          </Link>
        </div>
      </section>

      <MissionForm action={createMissionAction} submitLabel="Vytvořit misi" cities={cityOptions} />
    </main>
  );
}
