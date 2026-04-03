"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppState } from "@/components/app-state-provider";
import { type MapLocation, type Task } from "@/lib/mock-data";
import { taskAnswers } from "@/lib/task-answers";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type TaskStatus = "idle" | "correct" | "manual" | "unknown";
const SELF_MEMBER_ID = "self";
const UNKNOWN_PENALTY_POINTS = 15;
const MAX_WRONG_ATTEMPTS_BEFORE_AUTO_UNKNOWN = 2;

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isManualTask(task: Task) {
  return task.type === "photo" || !taskAnswers[task.id];
}

export function PlayScreen({ location }: { location: MapLocation }) {
  const { state, setActiveMode, completeLocation, isLocationUnlocked } = useAppState();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [episodeIndex, setEpisodeIndex] = useState(0);
  const [taskIndex, setTaskIndex] = useState(0);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<TaskStatus>("idle");
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState(false);
  const [taskOutcomes, setTaskOutcomes] = useState<Record<string, "known" | "unknown">>({});
  const [wrongAttemptsByTask, setWrongAttemptsByTask] = useState<Record<string, number>>({});
  const [partySnapshotIds, setPartySnapshotIds] = useState<string[]>([]);
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const mode = searchParams.get("mode");
    const episodeParam = searchParams.get("episode");

    if (mode === "solo" || mode === "group") {
      setActiveMode(mode);
    }

    if (episodeParam) {
      const episodeNumber = Number(episodeParam);

      if (Number.isInteger(episodeNumber) && episodeNumber >= 1 && episodeNumber <= location.episodes.length) {
        setEpisodeIndex(episodeNumber - 1);
        setTaskIndex(0);
      }
    }
  }, [location.episodes.length, searchParams, setActiveMode]);

  useEffect(() => {
    setPartySnapshotIds([]);
  }, [location.id, state.activeMode]);

  useEffect(() => {
    if (state.activeMode !== "group") {
      setPartySnapshotIds([]);
      return;
    }

    setPartySnapshotIds((current) => {
      if (current.length > 0) {
        return current;
      }

      const joinedIds = state.squadMembers
        .filter((member) => member.joined || member.id === SELF_MEMBER_ID)
        .map((member) => member.id);

      return joinedIds.length > 0 ? joinedIds : [SELF_MEMBER_ID];
    });
  }, [state.activeMode, state.squadMembers]);

  const activeEpisode = location.episodes[episodeIndex];
  const activeTask = activeEpisode.tasks[taskIndex];
  const isLastTask = taskIndex === activeEpisode.tasks.length - 1;
  const isLastEpisode = episodeIndex === location.episodes.length - 1;
  const joinedCount =
    state.activeMode === "group"
      ? Math.max(1, partySnapshotIds.length)
      : 1;
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

  async function finishLocation() {
    const participants =
      state.activeMode === "group" ? (partySnapshotIds.length > 0 ? partySnapshotIds : [SELF_MEMBER_ID]) : [SELF_MEMBER_ID];
    const penaltyPoints = unknownCount * UNKNOWN_PENALTY_POINTS;
    completeLocation(location.id, { participantIds: participants, penaltyPoints });

    if (supabase && state.profileCode) {
      const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";

      if (accessToken) {
        const response = await fetch("/api/game/complete-location", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            profileCode: state.profileCode,
            locationId: location.id,
            expeditionId: state.currentExpeditionId,
            mode: state.activeMode,
            completedAt: new Date().toISOString()
          })
        }).catch(() => null);

        if (response?.ok) {
          const payload = (await response.json()) as { participantCodes?: string[] };
          const participantIds = (payload.participantCodes ?? []).map((code) => code.trim().toUpperCase());
          if (participantIds.length > 0) {
            completeLocation(location.id, { participantIds, penaltyPoints });
          }
        }
      }
    }
  }

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

    void (async () => {
      await finishLocation();
      setFinished(true);
    })();
  }

  function handleValidate() {
    if (taskOutcomes[activeTask.id] === "unknown") {
      setStatus("unknown");
      setMessage("Tento úkol už je označený jako Nevím. Pokračuj na další stopu.");
      return;
    }

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

    const nextWrongAttempts = (wrongAttemptsByTask[activeTask.id] ?? 0) + 1;
    setWrongAttemptsByTask((current) => ({ ...current, [activeTask.id]: nextWrongAttempts }));

    if (nextWrongAttempts > MAX_WRONG_ATTEMPTS_BEFORE_AUTO_UNKNOWN) {
      setStatus("unknown");
      setMessage(`Třetí pokus nevyšel, bereme to jako Nevím (-${UNKNOWN_PENALTY_POINTS} bodů).`);
      setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "unknown" }));
      return;
    }

    const attemptsLeft = MAX_WRONG_ATTEMPTS_BEFORE_AUTO_UNKNOWN + 1 - nextWrongAttempts;
    setStatus("idle");
    setMessage(`Tohle nesedí. Zkus to znovu. Zbývá ${attemptsLeft} pokus.`);
  }

  function handleUnknown() {
    setStatus("unknown");
    setMessage(`Nevadí, jdeme dál. Odečítáme ${UNKNOWN_PENALTY_POINTS} bodů.`);
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
              <div className="text-xs text-mist">Vím</div>
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
            <p className="mt-2 text-sm text-mist">{activeEpisode.name}</p>
          </div>
          <div className="rounded-full bg-lime/15 px-3 py-2 text-xs font-semibold text-lime">
            {state.activeMode === "group" ? "Skupinový režim" : "Sólo režim"}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-mist">
            Zastavení {episodeIndex + 1}/{location.episodes.length} • Úkol {taskIndex + 1}/{activeEpisode.tasks.length}
          </div>
          <div className="rounded-full bg-white/5 px-3 py-2 text-xs text-mist">{progress}% hotovo</div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/10">
          <div className="h-2 rounded-full bg-lime" style={{ width: `${progress}%` }} />
        </div>
      </section>

      {state.activeMode === "group" ? (
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
              <div
                key={member.id}
                className="flex w-full items-center justify-between rounded-2xl bg-white/5 p-4 text-left"
              >
                <div className="font-medium">
                  {member.name}
                  {member.id === "self" ? " (ty)" : ""}
                </div>
                <div
                  className={`rounded-full px-3 py-2 text-xs ${
                    partySnapshotIds.includes(member.id) ? "bg-lime/15 text-lime" : "bg-white/8 text-mist"
                  }`}
                >
                  {partySnapshotIds.includes(member.id) ? "Ve výpravě" : "Mimo výpravu"}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-mist">Sestava je uzamčená od startu mise.</p>
        </section>
      ) : null}

      <section className="glass-card p-5">
        <span className="rounded-full bg-sky/12 px-3 py-1 text-xs uppercase tracking-[0.2em] text-sky">
          {activeEpisode.name}
        </span>
        <p className="mt-4 text-base leading-7 text-white/90">{activeEpisode.intro}</p>

        <div className="mt-5 rounded-[24px] border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-coral">Trocha nudné historie</p>
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
        {activeTask.illustrationImage ? (
          <figure className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <Image
              src={activeTask.illustrationImage}
              alt={activeTask.illustrationImageAlt || `Ilustrační foto k úkolu ${activeTask.title}`}
              width={1000}
              height={560}
              className="h-48 w-full object-cover"
            />
            <figcaption className="px-3 py-2 text-xs text-mist">Ilustrační foto k úkolu</figcaption>
          </figure>
        ) : null}

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

        {message ? (
          <p
            className={`mt-4 text-sm ${
              status === "correct"
                ? "text-lime"
                : status === "unknown"
                  ? "text-mist"
                  : status === "manual"
                    ? "text-sky"
                    : "text-mist"
            }`}
          >
            {message}
          </p>
        ) : null}

        <p className="mt-3 text-xs text-mist/80">
          Pravidlo: Na odpověď máš 2 pokusy. Po 3. špatné odpovědi se úkol označí jako Nevím (−{UNKNOWN_PENALTY_POINTS} bodů).
        </p>

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
              disabled={taskOutcomes[activeTask.id] === "unknown"}
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

      {alreadyUnlocked ? (
        <div className="rounded-[24px] border border-lime/20 bg-lime/10 p-4 text-sm text-mist">
          Tuhle lokaci už máš jednou dokončenou. Klidně si ji projdi znovu, ale ve sbírce už je odemčená.
        </div>
      ) : null}

      <p className="px-1 text-[11px] text-mist/80">
        Bezpečnostní upozornění: {location.areaHint} Při startu hry běží check-in.
      </p>
    </main>
  );
}
