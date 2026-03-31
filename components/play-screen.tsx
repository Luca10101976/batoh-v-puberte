"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppState } from "@/components/app-state-provider";
import { type MapLocation, type Task } from "@/lib/mock-data";

type TaskStatus = "idle" | "correct" | "manual" | "unknown";

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const taskAnswers: Record<string, string[]> = {
  "klamovka-chramek-1": ["16", "sestnact"],
  "klamovka-chramek-2": ["12", "dvanact"],
  "klamovka-chramek-3": ["11", "jedenact"],
  "klamovka-chramek-4": ["nebe a peklo", "peklo a nebe"],
  "klamovka-cassel-1": ["telo"],
  "klamovka-cassel-2": ["otec kristian krystof", "kristian krystof", "otec"],
  "klamovka-cassel-3": ["15", "patnact"],
  "klamovka-altan-1": ["4", "ctyri"],
  "klamovka-altan-2": ["galerie", "vystavni prostor", "galerie / vystavni prostor"],
  "klamovka-altan-3": ["vlci a medvedi", "vlci medvedi"],
  "klamovka-hodiny-3": ["kosire a praha 5", "kosire praha 5"],
  "klamovka-hodiny-4": ["ne"],
  "klamovka-rodina-1": ["3", "tri"],
  "klamovka-rodina-2": ["piskovec"]
};

function isManualTask(task: Task) {
  return task.type === "photo" || !taskAnswers[task.id];
}

export function PlayScreen({ location }: { location: MapLocation }) {
  const { state, setActiveMode, toggleMember, completeLocation, isLocationUnlocked } = useAppState();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [episodeIndex, setEpisodeIndex] = useState(0);
  const [taskIndex, setTaskIndex] = useState(0);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<TaskStatus>("idle");
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState(false);
  const [taskOutcomes, setTaskOutcomes] = useState<Record<string, "known" | "unknown">>({});

  useEffect(() => {
    const mode = searchParams.get("mode");

    if (mode === "solo" || mode === "group") {
      setActiveMode(mode);
    }
  }, [searchParams, setActiveMode]);

  const activeEpisode = location.episodes[episodeIndex];
  const activeTask = activeEpisode.tasks[taskIndex];
  const isLastTask = taskIndex === activeEpisode.tasks.length - 1;
  const isLastEpisode = episodeIndex === location.episodes.length - 1;
  const joinedCount = state.squadMembers.filter((member) => member.joined).length;
  const totalTasks = location.episodes.reduce((sum, episode) => sum + episode.tasks.length, 0);
  const completedTasksBeforeCurrent = location.episodes
    .slice(0, episodeIndex)
    .reduce((sum, episode) => sum + episode.tasks.length, 0);
  const progress = Math.round(((completedTasksBeforeCurrent + taskIndex + 1) / totalTasks) * 100);
  const alreadyUnlocked = isLocationUnlocked(location.id, location.unlocked);
  const knownCount = Object.values(taskOutcomes).filter((outcome) => outcome === "known").length;
  const unknownCount = Object.values(taskOutcomes).filter((outcome) => outcome === "unknown").length;

  const completionLabel = useMemo(() => {
    if (state.activeMode === "solo") {
      return `Body se připíšou hráči ${state.profile.name}.`;
    }

    return `Body se připíšou ${joinedCount} potvrzeným členům skupiny ${state.squadName}.`;
  }, [joinedCount, state.activeMode, state.profile.name, state.squadName]);

  function advance() {
    setInput("");
    setStatus("idle");
    setMessage("");

    if (!isLastTask) {
      setTaskIndex((current) => current + 1);
      return;
    }

    if (!isLastEpisode) {
      setEpisodeIndex((current) => current + 1);
      setTaskIndex(0);
      return;
    }

    completeLocation(location.id);
    setFinished(true);
  }

  function handleValidate() {
    if (isManualTask(activeTask)) {
      setStatus("manual");
      setMessage("Hotovo, tenhle úkol máš splněný.");
      setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "known" }));
      return;
    }

    const acceptedAnswers = taskAnswers[activeTask.id] ?? [];
    const valid = acceptedAnswers.some((answer) => normalize(answer) === normalize(input));

    if (valid) {
      setStatus("correct");
      setMessage("Správně.");
      setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "known" }));
      return;
    }

    setStatus("idle");
    setMessage("Tohle nesedí. Zkus to ještě jednou.");
  }

  function handleUnknown() {
    setStatus("unknown");
    setMessage("Nevadí, jdeme dál.");
    setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "unknown" }));
  }

  function handlePhotoConfirmAndAdvance() {
    setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "known" }));
    setStatus("manual");
    setMessage("");
    advance();
  }

  function handlePhotoUnknownAndAdvance() {
    setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "unknown" }));
    setStatus("unknown");
    setMessage("");
    advance();
  }

  if (finished) {
    return (
      <main className="flex flex-1 flex-col gap-5 pb-24">
        <section className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-coral">Závěrečné odhalení</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{location.endingTitle}</h1>
          <p className="mt-4 text-sm leading-7 text-mist">{location.endingStory}</p>
        </section>

        <section className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-lime">Zpráva pro hráče</p>
          <p className="mt-3 text-base leading-7 text-white/90">{location.playerMessage}</p>
          <p className="mt-4 text-sm leading-6 text-mist">{completionLabel}</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xl font-semibold text-lime">{knownCount}</div>
              <div className="text-xs text-mist">Věděl jsem</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xl font-semibold">{unknownCount}</div>
              <div className="text-xs text-mist">Nevím</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xl font-semibold">{totalTasks}</div>
              <div className="text-xs text-mist">Celkově</div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/" className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 text-center font-semibold">
            Zpět na mapu
          </Link>
          <button
            onClick={() => router.push("/leaderboard")}
            className="rounded-[24px] bg-lime px-5 py-4 text-center font-semibold text-night"
          >
            Zobrazit žebříček
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <section className="glass-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-lime">Aktivní mise</p>
            <h1 className="mt-2 text-2xl font-bold">{location.name}</h1>
            <p className="mt-2 text-sm text-mist">{location.subtitle}</p>
          </div>
          <div className="rounded-full bg-lime/15 px-3 py-2 text-xs font-semibold text-lime">
            {state.activeMode === "group" ? "Skupinový režim" : "Sólo režim"}
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-mist">{location.story}</p>
      </section>

      <section className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-coral">Výprava</p>
            <h2 className="mt-2 text-xl font-semibold">{state.squadName}</h2>
          </div>
          <div className="rounded-full bg-white/5 px-3 py-2 text-xs text-mist">{joinedCount} hráči</div>
        </div>
        <div className="mt-4 space-y-3">
          {state.squadMembers.map((member) => (
            <button
              key={member.id}
              onClick={() => toggleMember(member.id)}
              disabled={member.id === "self"}
              className="flex w-full items-center justify-between rounded-2xl bg-white/5 p-4 text-left disabled:cursor-not-allowed disabled:opacity-80"
            >
              <div className="font-medium">
                {member.name}
                {member.id === "self" ? " (ty)" : ""}
              </div>
              <div
                className={`rounded-full px-3 py-2 text-xs ${
                  member.joined ? "bg-lime/15 text-lime" : "bg-white/8 text-mist"
                }`}
              >
                {member.joined ? "Potvrzeno" : "Mimo výpravu"}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="glass-card p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-sky">Bezpečnostní check-in</p>
        <div className="mt-4 rounded-[24px] border border-coral/20 bg-coral/10 p-4">
          <p className="text-sm font-medium text-white">{location.areaHint}</p>
          <p className="mt-2 text-sm leading-6 text-mist">
            {state.safetyEmailsEnabled
              ? "Rodičovský dohled je aktivní. Start a konec mise by odeslal e-mail rodiči."
              : "Rodičovský dohled je vypnutý. Misi ale můžeš odehrát normálně."}
          </p>
        </div>
      </section>

      <section className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-lime">Postup mise</p>
            <h2 className="mt-2 text-xl font-semibold">
              Zastavení {episodeIndex + 1} z {location.episodes.length}
            </h2>
          </div>
          <div className="rounded-full bg-white/5 px-3 py-2 text-xs text-mist">{progress}% hotovo</div>
        </div>
        <div className="mt-4 h-2 rounded-full bg-white/10">
          <div className="h-2 rounded-full bg-lime" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="glass-card p-5">
        <span className="rounded-full bg-sky/12 px-3 py-1 text-xs uppercase tracking-[0.2em] text-sky">
          {activeEpisode.name}
        </span>
        <p className="mt-4 text-base leading-7 text-white/90">{activeEpisode.intro}</p>

        <div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-coral">Co je na tom místě skutečné</p>
          <p className="mt-3 text-sm leading-6 text-mist">{activeEpisode.background}</p>
        </div>
      </section>

      <section className="glass-card p-5">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-mist">{activeTask.typeLabel}</span>
          <span className="text-xs text-mist">
            Úkol {taskIndex + 1} z {activeEpisode.tasks.length}
          </span>
        </div>
        <h2 className="mt-4 text-2xl font-semibold">{activeTask.title}</h2>
        <p className="mt-2 text-sm leading-6 text-mist">{activeTask.content}</p>

        <div className="mt-5 rounded-[24px] border border-dashed border-white/15 bg-night/70 p-4">
          {activeTask.type === "choice" ? (
            <div className="space-y-2">
              {activeTask.options?.map((option) => (
                <button
                  key={option}
                  onClick={() => setInput(option)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                    input === option ? "border-lime bg-lime/10 text-white" : "border-white/10 bg-white/5"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : activeTask.type === "photo" ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-mist">
              Tohle je úkol na místě. Splň ho a klikni na potvrzení.
            </div>
          ) : (
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Sem napiš odpověď"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white outline-none placeholder:text-mist"
            />
          )}
        </div>

        {message ? <p className="mt-4 text-sm text-mist">{message}</p> : null}

        {activeTask.type === "photo" ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              onClick={handlePhotoUnknownAndAdvance}
              className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold text-mist"
            >
              Nevím
            </button>
            <button
              onClick={handlePhotoConfirmAndAdvance}
              className="rounded-[24px] bg-lime px-4 py-4 text-sm font-semibold text-night"
            >
              {isLastTask && isLastEpisode ? "Potvrdit a dokončit misi" : "Potvrdit a pokračovat"}
            </button>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-3 gap-3">
            <button
              onClick={handleValidate}
              className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold"
            >
              Ověřit úkol
            </button>
            <button
              onClick={handleUnknown}
              className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold text-mist"
            >
              Nevím
            </button>
            <button
              onClick={advance}
              disabled={status === "idle"}
              className="rounded-[24px] bg-lime px-4 py-4 text-sm font-semibold text-night disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-mist"
            >
              {isLastTask && isLastEpisode ? "Dokončit misi" : "Další stopa"}
            </button>
          </div>
        )}
      </section>

      <section className="glass-card p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-lime">Co se tu ztratilo z příběhu</p>
        <div className="mt-3 space-y-2">
          {activeEpisode.clue.map((line) => (
            <p key={line} className="text-sm leading-6 text-white/90">
              {line}
            </p>
          ))}
        </div>
        {location.interludes[episodeIndex] ? (
          <div className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-sm text-mist">
            {location.interludes[episodeIndex]}
          </div>
        ) : null}
      </section>

      {alreadyUnlocked ? (
        <div className="rounded-[24px] border border-lime/20 bg-lime/10 p-4 text-sm text-mist">
          Tuhle lokaci už máš jednou dokončenou. Klidně si ji projdi znovu, ale ve sbírce už je odemčená.
        </div>
      ) : null}
    </main>
  );
}
