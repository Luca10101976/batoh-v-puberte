"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EndingStory, GameIntroCard, StopArrival, StopTransitionCard, TaskPrompt, Bubliny } from "@/components/game/game-ui";
import type { GameplayBubble, GameplayEpisode, GameplayTask } from "@/lib/gameplay-types";
import { buildWalkthroughSteps, describeStep } from "@/lib/mission-walkthrough";

// R54: projít hru očima hráče přímo v Mozku. Kreslí se stejnými komponentami
// jako hra; nic se neukládá, nevzniká hráč ani body, funguje i u konceptu.

export type WalkthroughData = {
  missionId: string;
  title: string;
  heroImageUrl: string;
  introStory: string;
  episodes: GameplayEpisode[];
  endingTitle: string;
  endingText: string;
  endingPlayerMessage: string;
  endingBubbles: GameplayBubble[];
};

function OdpovedniCast({ task, ukazat }: { task: GameplayTask; ukazat: boolean }) {
  const spravne = new Set(task.correctAnswers.map((a) => a.trim().toLowerCase()));
  if (task.type === "choice") {
    return (
      <div className="space-y-2">
        {task.options?.map((option) => {
          const ok = ukazat && spravne.has(option.trim().toLowerCase());
          return (
            <div
              key={option}
              className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${ok ? "border-lime bg-lime/10 text-white" : "border-white/10 bg-white/5"}`}
            >
              {option}
              {ok ? <span className="ml-2 text-xs font-semibold text-lime">✓ správně</span> : null}
            </div>
          );
        })}
      </div>
    );
  }
  if (task.type === "order") {
    return (
      <div className="space-y-3">
        <p className="text-xs leading-5 text-mist">Seřaď položky šipkami. Body jsou za celé správné pořadí.</p>
        <ol className="space-y-2">
          {(task.options ?? []).map((polozka, index) => (
            <li key={polozka} className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 p-2 pl-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime/15 text-sm font-bold text-lime">{index + 1}</span>
              <span className="text-sm font-medium text-white">{polozka}</span>
            </li>
          ))}
        </ol>
        {ukazat ? (
          <p className="text-sm text-lime">Správné pořadí: {(task.correctAnswers[0] ?? "").split("\n").join(" → ")}</p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-mist">Sem napiš odpověď</div>
      {task.minCorrectMatches ? (
        <p className="text-xs text-mist">Stačí {task.minCorrectMatches} správné odpovědi. Odděl je mezerou nebo čárkou.</p>
      ) : null}
      {ukazat ? (
        <p className="text-sm text-lime">
          Uznává se: {task.correctAnswers.join(" · ")}
          {task.minCorrectMatches ? ` (stačí ${task.minCorrectMatches})` : ""}
        </p>
      ) : null}
    </div>
  );
}

export function MissionWalkthrough({ data }: { data: WalkthroughData }) {
  const steps = useMemo(() => buildWalkthroughSteps(data.episodes), [data.episodes]);
  const [index, setIndex] = useState(0);
  const [ukazat, setUkazat] = useState(false);
  const step = steps[index];
  const jdi = (cil: number) => {
    setIndex(Math.max(0, Math.min(steps.length - 1, cil)));
    setUkazat(false);
  };
  const dalsi = (
    <button onClick={() => jdi(index + 1)} className="mt-6 w-full rounded-[24px] bg-lime px-5 py-4 text-center text-base font-bold text-night">
      {step.kind === "intro" ? "Vyrážíme" : "Pokračovat na další zastavení"}
    </button>
  );

  const stopId =
    step.kind === "task" || step.kind === "empty-stop"
      ? data.episodes[step.stopIndex].id
      : step.kind === "transition"
        ? data.episodes[step.fromStopIndex].id
        : null;

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* Ovládání průchodu – patří Mozku, ne hře. */}
      <div className="sticky top-[60px] z-20 rounded-2xl border border-sky/30 bg-night/90 p-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            onClick={() => jdi(index - 1)}
            disabled={index === 0}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold disabled:opacity-30"
          >
            ← Zpět
          </button>
          <select
            value={index}
            onChange={(event) => jdi(Number(event.target.value))}
            aria-label="Přejít na obrazovku"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
          >
            {steps.map((s, i) => (
              <option key={i} value={i}>
                {i + 1}/{steps.length} · {describeStep(s, data.episodes)}
              </option>
            ))}
          </select>
          <button
            onClick={() => jdi(index + 1)}
            disabled={index === steps.length - 1}
            className="rounded-xl bg-sky/20 px-3 py-2 text-sm font-semibold text-sky disabled:opacity-30"
          >
            Další →
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-mist">
          <span>Náhled – nic se neukládá, body se nepočítají.</span>
          {stopId ? (
            <Link href={`/mozek/stops/${stopId}`} className="shrink-0 font-semibold text-lime underline">
              Upravit zastavení
            </Link>
          ) : step.kind === "intro" || step.kind === "ending" ? (
            <Link href={`/mozek/missions/${data.missionId}`} className="shrink-0 font-semibold text-lime underline">
              Upravit hru
            </Link>
          ) : null}
        </div>
      </div>

      {/* Obrazovka hry – stejné komponenty jako ve hře. */}
      <div className="flex flex-col gap-5">
        {step.kind === "intro" ? (
          <GameIntroCard
            image={data.heroImageUrl || data.episodes[0]?.illustrationImage || ""}
            name={data.title}
            introStory={data.introStory}
            firstStopName={data.episodes[0]?.name}
            action={dalsi}
          />
        ) : null}

        {step.kind === "task" ? (
          (() => {
            const stop = data.episodes[step.stopIndex];
            const task = stop.tasks[step.taskIndex];
            return (
              <>
                <StopArrival locationName={data.title} stop={stop} showContext={step.firstOfStop} />
                <Bubliny bubliny={task.bubbles} />
                <section className="glass-card p-5">
                  <TaskPrompt task={task} />
                  <div className="mt-5 rounded-[24px] border border-dashed border-white/15 bg-night/70 p-4">
                    <OdpovedniCast task={task} ukazat={ukazat} />
                  </div>
                  {task.hintText ? (
                    <details className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                      <summary className="cursor-pointer font-semibold text-white">Nápověda (za ni hráč dostane 5 bodů místo 10)</summary>
                      <p className="mt-2 whitespace-pre-line text-mist">{task.hintText}</p>
                    </details>
                  ) : null}
                  <button
                    onClick={() => setUkazat((v) => !v)}
                    className="mt-4 w-full rounded-[24px] border border-lime/40 bg-lime/10 px-5 py-3 text-sm font-semibold text-lime"
                  >
                    {ukazat ? "Skrýt správnou odpověď" : "Ukázat správnou odpověď"}
                  </button>
                </section>
              </>
            );
          })()
        ) : null}

        {step.kind === "empty-stop" ? (
          <>
            <StopArrival locationName={data.title} stop={data.episodes[step.stopIndex]} showContext />
            <p className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
              Tohle zastavení nemá žádný úkol – hráč by tu uvízl a hru nejde publikovat.
            </p>
          </>
        ) : null}

        {step.kind === "transition" ? (
          <StopTransitionCard
            toStopName={data.episodes[step.toStopIndex].name}
            transitionText={data.episodes[step.fromStopIndex].transitionText}
            action={dalsi}
          />
        ) : null}

        {step.kind === "ending" ? (
          <EndingStory
            eyebrow="Závěrečné odhalení"
            title={data.endingTitle || data.title}
            bubbles={data.endingBubbles}
            story={data.endingText}
            playerMessage={data.endingPlayerMessage}
          />
        ) : null}
      </div>
    </div>
  );
}
