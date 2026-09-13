/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { loadMissionPreview } from "@/lib/mission-preview-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// R37: náhled hry pro administrátorku. Je jen uvnitř Mozku za admin ochranou,
// nikam se nedá poslat a nic nezapisuje: nezakládá výpravu, neukládá postup,
// nepřidává body ani neodemyká hry. Obsah čte stejnou cestou jako hráčská hra.

function TaskCard({
  index,
  task
}: {
  index: number;
  task: {
    title: string;
    content: string;
    typeLabel: string;
    options?: string[];
    correctAnswers: string[];
    minCorrectMatches?: number;
    hintText?: string;
  };
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-sky">
        Úkol {index + 1} • {task.typeLabel}
      </p>
      <h4 className="mt-1 text-lg font-semibold">{task.title}</h4>
      <p className="mt-2 text-sm leading-6 text-white/90">{task.content}</p>

      {task.options && task.options.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-mist">
          {task.options.map((option) => (
            <li key={option}>• {option}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 rounded-xl border border-lime/20 bg-lime/5 px-3 py-2 text-sm text-lime">
        <strong>Uznávané odpovědi:</strong>{" "}
        {task.correctAnswers.length > 0 ? task.correctAnswers.join(" | ") : "zatím žádné"}
        {task.minCorrectMatches ? ` • stačí ${task.minCorrectMatches}` : ""}
      </div>

      {task.hintText ? (
        <div className="mt-2 rounded-xl border border-white/10 bg-night/30 px-3 py-2 text-sm text-mist">
          <strong>Nápověda (za 5 bodů):</strong> {task.hintText}
        </div>
      ) : null}
    </article>
  );
}

export default async function MissionPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preview = await loadMissionPreview(getSupabaseServerClient(), id);

  if (!preview) {
    return (
      <main className="mx-auto w-full max-w-4xl py-8">
        <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          Hru se nepodařilo načíst.
        </div>
      </main>
    );
  }

  const taskCount = preview.episodes.reduce((sum, episode) => sum + episode.tasks.length, 0);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 pb-10">
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Mozek • Náhled</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{preview.title}</h1>
            <p className="mt-2 text-sm text-mist">
              {preview.isPublished ? "Publikováno" : "Koncept"} • {preview.episodes.length} zastavení • {taskCount} úkolů
            </p>
          </div>
          <Link
            href={`/mozek/missions/${preview.id}`}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          >
            Zpět na hru
          </Link>
        </div>
        <p className="mt-4 rounded-2xl border border-sky/30 bg-sky/10 px-4 py-3 text-sm text-sky">
          Tohle je jen náhled pro tebe. Nezakládá výpravu, nepočítá body a hráči ho nevidí. Správné odpovědi a nápovědy
          jsou tu schválně – ve hře i v tiskovém sešitu zůstávají skryté.
        </p>
      </section>

      <section className="glass-card overflow-hidden">
        {preview.heroImageUrl ? (
          <img src={preview.heroImageUrl} alt="" className="h-56 w-full object-cover" />
        ) : (
          <div className="flex h-56 w-full items-center justify-center bg-white/5 text-sm text-mist">
            Hra zatím nemá titulní obrázek
          </div>
        )}
        <div className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-mist">
            Hry v {preview.cityLocative} • {preview.difficulty}
            {preview.durationMin ? ` • ${preview.durationMin} min` : ""}
          </p>
          <h2 className="mt-2 text-2xl font-bold">{preview.title}</h2>
          {preview.shortDescription ? (
            <p className="mt-2 text-sm text-mist">{preview.shortDescription}</p>
          ) : (
            <p className="mt-2 text-sm text-mist">Bez krátkého popisu se v katalogu použije první věta úvodu.</p>
          )}
          <p className="mt-4 whitespace-pre-line text-sm leading-6 text-white/90">{preview.introStory}</p>
        </div>
      </section>

      {preview.episodes.length === 0 ? (
        <section className="glass-card p-5 text-sm text-mist">Hra zatím nemá žádné zastavení.</section>
      ) : null}

      {preview.episodes.map((episode, index) => (
        <section key={episode.id} className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-sky">Zastavení {index + 1}</p>
          <h3 className="mt-1 text-2xl font-semibold">{episode.name}</h3>

          {episode.illustrationImage ? (
            <img
              src={episode.illustrationImage}
              alt=""
              className="mt-3 max-h-64 w-full rounded-2xl object-cover"
            />
          ) : null}

          <p className="mt-3 text-sm font-semibold text-white/90">{episode.intro}</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-mist">{episode.background}</p>

          <div className="mt-4 space-y-3">
            {episode.tasks.length === 0 ? (
              <p className="text-sm text-coral">Tahle zastávka nemá žádný úkol, takže hru nejde dohrát.</p>
            ) : null}
            {episode.tasks.map((task, taskIndex) => (
              <TaskCard key={task.id} index={taskIndex} task={task} />
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-night/30 px-4 py-3 text-sm text-mist">
            <strong>Přechod na další zastávku:</strong>{" "}
            {episode.transitionText?.trim() || "bez vlastního textu – hráč uvidí jen název dalšího místa"}
          </div>
        </section>
      ))}

      <section className="glass-card p-5">
        <h3 className="section-title">Závěr hry</h3>
        {preview.endingTitle || preview.endingText ? (
          <div className="mt-3 space-y-2">
            <p className="text-xl font-semibold">{preview.endingTitle || "(bez titulku)"}</p>
            <p className="whitespace-pre-line text-sm leading-6 text-white/90">{preview.endingText}</p>
            {preview.endingPlayerMessage ? (
              <p className="whitespace-pre-line text-sm leading-6 text-mist">{preview.endingPlayerMessage}</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-coral">
            Hra zatím nemá závěr. Bez něj ji nejde publikovat, protože by hráč po dohrání neviděl nic.
          </p>
        )}
      </section>
    </main>
  );
}
