import { Breadcrumbs } from "@/components/admin/breadcrumbs";
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
  searchParams?: Promise<{ missionId?: string | string[] }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const missionId = firstValue(resolvedSearchParams?.missionId).trim();
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
            <Breadcrumbs
              items={[{ label: "Hry", href: "/mozek" }, { label: mission.title, href: `/mozek/missions/${mission.id}` }, { label: "Přidat zastavení" }]}
            />
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Přidat zastavení</h1>
          </div>
        </div>
      </section>

      <StopNewForm missionId={mission.id} initialOrder={nextOrder} action={createStopAction} />
    </main>
  );
}
