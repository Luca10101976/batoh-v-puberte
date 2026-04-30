import Link from "next/link";
import { createStopAction } from "@/app/admin/stops/actions";
import { StopNewForm } from "@/components/admin/stop-new-form";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default async function NewStopPage({
  searchParams
}: {
  searchParams?: { missionId?: string | string[] };
}) {
  const missionId = firstValue(searchParams?.missionId).trim();
  if (!missionId) {
    return (
      <main className="mx-auto w-full max-w-5xl py-8">
        <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          Chybí missionId. Otevři stránku přes detail mise.
        </div>
      </main>
    );
  }

  const supabase = getSupabaseServerClient();
  const { data: mission } = await supabase
    .from("missions")
    .select("id, title")
    .eq("id", missionId)
    .maybeSingle<{ id: string; title: string }>();

  if (!mission) {
    return (
      <main className="mx-auto w-full max-w-5xl py-8">
        <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          Misi se nepodařilo najít.
        </div>
      </main>
    );
  }

  const { data: lastStop } = await supabase
    .from("mission_stops")
    .select("order")
    .eq("mission_id", mission.id)
    .order("order", { ascending: false })
    .limit(1)
    .maybeSingle<{ order: number }>();

  const nextOrder = (lastStop?.order ?? 0) + 1;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-10">
      <section className="glass-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Mozek • Zastavení</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Přidat zastavení</h1>
            <p className="mt-1 text-sm text-mist">Mise: {mission.title}</p>
          </div>
          <Link href={`/mozek/missions/${mission.id}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            Zpět na misi
          </Link>
        </div>
      </section>

      <StopNewForm missionId={mission.id} initialOrder={nextOrder} action={createStopAction} />
    </main>
  );
}
