import Link from "next/link";
import { createTaskAction, deleteTaskAction, updateStopAction, updateTaskAction } from "@/app/admin/stops/actions";
import type { MissionStopRow, MissionTaskRow } from "@/app/admin/types";
import { StopForm } from "@/components/admin/stop-form";
import { TaskForm } from "@/components/admin/task-form";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function statusText(status?: string) {
  switch (status) {
    case "saved":
      return { text: "✅ Zastavení bylo uložené.", tone: "ok" as const };
    case "created":
      return { text: "✅ Zastavení bylo vytvořené.", tone: "ok" as const };
    case "task_created":
      return { text: "✅ Úkol byl přidaný.", tone: "ok" as const };
    case "task_saved":
      return { text: "✅ Úkol byl uložený.", tone: "ok" as const };
    case "task_deleted":
      return { text: "🗑️ Úkol byl smazaný.", tone: "ok" as const };
    case "error":
      return { text: "❌ Akce se nepovedla.", tone: "error" as const };
    default:
      return null;
  }
}

export default async function StopEditPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const supabase = getSupabaseServerClient();
  const { data: stop, error: stopError } = await supabase
    .from("mission_stops")
    .select("id, mission_id, title, description, image_url, order")
    .eq("id", id)
    .maybeSingle<MissionStopRow>();

  if (!stop || stopError) {
    return (
      <main className="mx-auto w-full max-w-5xl py-8">
        <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          Zastavení se nepodařilo načíst.
        </div>
      </main>
    );
  }

  const { data: mission } = await supabase
    .from("missions")
    .select("id, title")
    .eq("id", stop.mission_id)
    .maybeSingle<{ id: string; title: string }>();

  const { data: tasksData, error: tasksError } = await supabase
    .from("mission_tasks")
    .select("id, stop_id, type, question, correct_answer, options, order")
    .eq("stop_id", stop.id)
    .order("order", { ascending: true });

  const status = statusText(resolvedSearchParams?.status);
  const tasks = ((tasksData ?? []) as MissionTaskRow[]) ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-10">
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Mozek • Zastavení</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{stop.title}</h1>
            {mission?.title ? <p className="mt-1 text-sm text-mist">Mise: {mission.title}</p> : null}
          </div>
          <Link
            href={`/mozek/missions/${stop.mission_id}`}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          >
            Zpět na misi
          </Link>
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

      <StopForm stop={stop} action={updateStopAction} />

      <section className="glass-card p-5">
        <h2 className="section-title">Úkoly</h2>
        {tasksError ? (
          <div className="mt-4 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
            Nepodařilo se načíst úkoly: {tasksError.message}
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          {tasks.map((task) => (
            <article key={task.id} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-sky">Úkol {task.order}</p>
                  <h3 className="mt-1 text-lg font-semibold">
                    {task.type === "vyber" ? "Výběr" : task.type === "ano-ne" ? "Ano / ne" : "Otevřená odpověď"}
                  </h3>
                </div>
                <form action={deleteTaskAction}>
                  <input type="hidden" name="task_id" value={task.id} />
                  <input type="hidden" name="stop_id" value={stop.id} />
                  <input type="hidden" name="mission_id" value={stop.mission_id} />
                  <button
                    type="submit"
                    className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-sm font-semibold text-coral"
                  >
                    Smazat úkol
                  </button>
                </form>
              </div>

              <TaskForm stopId={stop.id} missionId={stop.mission_id} task={task} action={updateTaskAction} />
            </article>
          ))}

          <section className="rounded-2xl border border-dashed border-white/10 bg-night/20 p-4">
            <h3 className="text-lg font-semibold">Přidat nový úkol</h3>
            <p className="mt-1 text-sm text-mist">Tady můžete doplnit další zadání pro tohle zastavení.</p>
            <div className="mt-4">
              <TaskForm
                stopId={stop.id}
                missionId={stop.mission_id}
                action={createTaskAction}
              />
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
