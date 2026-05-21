"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppState } from "@/components/app-state-provider";
import { locations, type MapLocation } from "@/lib/mock-data";
import { getUnlockRequirement } from "@/lib/location-unlock";
import { parseRequestedPlayStep } from "@/lib/play-resume";
import { hasHistoricalLocationCompletion, isActiveInProgressLocation, isCompletedLocationProgress } from "@/lib/location-progress-state";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { GameplayEpisode, GameplayTask } from "@/lib/gameplay-types";

type TaskStatus = "idle" | "correct" | "manual" | "unknown" | "wrong";
const SELF_MEMBER_ID = "self";
const UNKNOWN_PENALTY_POINTS = 15;
const MAX_WRONG_ATTEMPTS_BEFORE_AUTO_UNKNOWN = 2;

type PlayLocation = Omit<MapLocation, "episodes"> & { episodes: GameplayEpisode[] };

function isExternalImage(src: string) {
  return /^https?:\/\//i.test(src);
}

function isManualTask(task: GameplayTask) {
  return task.type === "photo";
}

export function PlayScreen({ location }: { location: PlayLocation }) {
  const { state, setActiveMode, completeLocation, isLocationUnlocked } = useAppState();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedStep = useMemo(
    () =>
      parseRequestedPlayStep({
        episodeParam: searchParams.get("episode"),
        taskParam: searchParams.get("task"),
        episodeCount: location.episodes.length,
        taskCountForEpisode: (episodeIndex) => location.episodes[episodeIndex]?.tasks.length ?? 0
      }),
    [location.episodes, searchParams]
  );
  const requestedEpisodeIndex = requestedStep.episodeIndex;
  const requestedTaskIndex = requestedStep.taskIndex;
  const [episodeIndex, setEpisodeIndex] = useState(0);
  const [taskIndex, setTaskIndex] = useState(0);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<TaskStatus>("idle");
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState(false);
  const [pendingEpisodeTransition, setPendingEpisodeTransition] = useState<{
    fromName: string;
    toName: string;
    nextEpisodeIndex: number;
  } | null>(null);
  const [taskOutcomes, setTaskOutcomes] = useState<Record<string, "known" | "unknown">>({});
  const [wrongAttemptsByTask, setWrongAttemptsByTask] = useState<Record<string, number>>({});
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [resuming, setResuming] = useState(true);
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const mode = searchParams.get("mode");

    setActiveMode("solo");

    if (requestedEpisodeIndex !== null) {
      setEpisodeIndex(requestedEpisodeIndex);
      setTaskIndex(requestedTaskIndex ?? 0);
    }
  }, [requestedEpisodeIndex, requestedTaskIndex, searchParams, setActiveMode]);

  const locationUnlocked = isLocationUnlocked(location.id, location.unlocked);
  const unlockRequirement = getUnlockRequirement(location, locations);
  const taskPositionById = useMemo(() => {
    const map = new Map<string, { episodeIndex: number; taskIndex: number }>();
    location.episodes.forEach((episode, epIndex) => {
      episode.tasks.forEach((task, tIndex) => {
        map.set(task.id, { episodeIndex: epIndex, taskIndex: tIndex });
      });
    });
    return map;
  }, [location.episodes]);

  const activeEpisode = location.episodes[episodeIndex];
  const activeTask = activeEpisode.tasks[taskIndex];
  const isLastTask = taskIndex === activeEpisode.tasks.length - 1;
  const isLastEpisode = episodeIndex === location.episodes.length - 1;
  const totalTasks = location.episodes.reduce((sum, episode) => sum + episode.tasks.length, 0);
  const completedTasksBeforeCurrent = location.episodes
    .slice(0, episodeIndex)
    .reduce((sum, episode) => sum + episode.tasks.length, 0);
  const progress = Math.round(((completedTasksBeforeCurrent + taskIndex + 1) / totalTasks) * 100);
  const historicallyCompleted = state.completedLocationIds.includes(location.id);
  const knownCount = Object.values(taskOutcomes).filter((outcome) => outcome === "known").length;
  const unknownCount = Object.values(taskOutcomes).filter((outcome) => outcome === "unknown").length;
  const canAdvance =
    status === "correct" ||
    status === "unknown" ||
    status === "manual";
  const verificationFinished = status === "correct" || status === "unknown" || status === "manual";

  const completionLabel = useMemo(() => `Body se připíšou hráči ${state.profile.name}.`, [state.profile.name]);
  const hasAnyTasks = totalTasks > 0;

  useEffect(() => {
    async function hydrateInProgressMission() {
      setTaskOutcomes({});
      setWrongAttemptsByTask({});
      setStatus("idle");
      setMessage("");
      setInput("");
      setFinished(false);
      setPendingEpisodeTransition(null);

      if (!supabase || !state.profileCode) {
        setResuming(false);
        return;
      }

      const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      if (!accessToken) {
        setResuming(false);
        return;
      }

      const response = await fetch("/api/game/location-progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          profileCode: state.profileCode,
          locationId: location.id
        })
      }).catch(() => null);

      if (!response?.ok) {
        setResuming(false);
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | {
            task_progress?: Array<{ task_id: string; status: "correct" | "wrong" | "unknown"; attempts: number }>;
            location?: { status?: "in_progress" | "completed" | null };
          }
        | null;

      const rows = payload?.task_progress ?? [];
      const locationProgress = payload?.location ?? null;

      if (rows.length === 0) {
        if (isCompletedLocationProgress(locationProgress)) {
          await fetch("/api/game/reset-location-replay", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              profileCode: state.profileCode,
              locationId: location.id
            })
          }).catch(() => null);

          if (requestedEpisodeIndex !== null) {
            setEpisodeIndex(requestedEpisodeIndex);
            setTaskIndex(requestedTaskIndex ?? 0);
          } else {
            setEpisodeIndex(0);
            setTaskIndex(0);
          }

          setMessage("Tohle je opakované hraní. Začínáš znovu na čisto a nejlepší výsledek už si tím nezhoršíš.");
          setResuming(false);
          return;
        }

        if (isActiveInProgressLocation(locationProgress)) {
          if (requestedEpisodeIndex !== null) {
            setEpisodeIndex(requestedEpisodeIndex);
            setTaskIndex(requestedTaskIndex ?? 0);
          } else {
            setEpisodeIndex(0);
            setTaskIndex(0);
          }

          if (historicallyCompleted || hasHistoricalLocationCompletion(locationProgress)) {
            setMessage("Tohle je opakované hraní. Pokračuješ v novém pokusu.");
          }

          setResuming(false);
          return;
        }

        setResuming(false);
        return;
      }

      const outcomes: Record<string, "known" | "unknown"> = {};
      const attempts: Record<string, number> = {};
      const lockedTasks = new Set<string>();

      rows.forEach((row) => {
        attempts[row.task_id] = Math.max(0, row.attempts ?? 0);
        if (row.status === "correct") {
          outcomes[row.task_id] = "known";
          lockedTasks.add(row.task_id);
        }
        if (row.status === "unknown") {
          outcomes[row.task_id] = "unknown";
          lockedTasks.add(row.task_id);
        }
      });

      setTaskOutcomes((current) => ({ ...current, ...outcomes }));
      setWrongAttemptsByTask((current) => ({ ...current, ...attempts }));

      const firstOpenTask = location.episodes
        .flatMap((episode) => episode.tasks)
        .find((task) => !lockedTasks.has(task.id));

      if (requestedEpisodeIndex !== null) {
        setEpisodeIndex(requestedEpisodeIndex);
        setTaskIndex(requestedTaskIndex ?? 0);
        setResuming(false);
        return;
      }

      if (firstOpenTask) {
        const target = taskPositionById.get(firstOpenTask.id);
        if (target) {
          setEpisodeIndex(target.episodeIndex);
          setTaskIndex(target.taskIndex);
          setMessage("Navázali jsme na tvoji rozehranou hru.");
          setStatus("idle");
        }
      } else if (payload?.location?.status === "in_progress") {
        setMessage("Máš vyřešené všechny úkoly. Dokonči misi tlačítkem v posledním kroku.");
        setStatus("idle");
        const lastEpisodeIndex = location.episodes.length - 1;
        const lastTaskIndex = Math.max(0, location.episodes[lastEpisodeIndex]?.tasks.length - 1);
        setEpisodeIndex(lastEpisodeIndex);
        setTaskIndex(lastTaskIndex);
      }

      setResuming(false);
    }

    void hydrateInProgressMission();
  }, [historicallyCompleted, location.episodes, location.id, requestedEpisodeIndex, requestedTaskIndex, state.profileCode, supabase, taskPositionById]);

  async function finishLocation() {
    const participants = [SELF_MEMBER_ID];
    const unknownTaskIds = Object.entries(taskOutcomes)
      .filter(([, outcome]) => outcome === "unknown")
      .map(([taskId]) => taskId);
    const penaltyPoints = unknownCount * UNKNOWN_PENALTY_POINTS;
    completeLocation(location.id, {
      participantIds: participants,
      penaltyPoints,
      source: "gameplay"
    });

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
            expeditionId: null,
            mode: "solo",
            completedAt: new Date().toISOString(),
            unknownTaskIds,
            unknownCount,
            source: "gameplay",
            childName: state.profile.name,
            childAge: state.profile.age
          })
        }).catch(() => null);

        if (response?.ok) {
          const payload = (await response.json()) as { participantCodes?: string[] };
          const participantIds = (payload.participantCodes ?? []).map((code) => code.trim().toUpperCase());
          if (participantIds.length > 0) {
            completeLocation(location.id, { participantIds, penaltyPoints, source: "gameplay" });
          }
        }
      }
    }
  }

  async function submitTaskAnswer(action: "answer" | "mark_unknown" | "confirm_manual", answerValue?: string) {
    if (!supabase || !state.profileCode) {
      setStatus("wrong");
      setMessage("Nejdřív se prosím přihlas.");
      return null;
    }

    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    if (!accessToken) {
      setStatus("wrong");
      setMessage("Nejdřív se prosím přihlas.");
      return null;
    }

    const response = await fetch("/api/game/submit-task-answer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        profileCode: state.profileCode,
        locationId: location.id,
        taskId: activeTask.id,
        action,
        answer: answerValue ?? "",
        replayAttempts: wrongAttemptsByTask[activeTask.id] ?? 0
      })
    }).catch(() => null);

    if (!response?.ok) {
      setStatus("wrong");
      setMessage("Ověření odpovědi se nepodařilo. Zkus to znovu.");
      return null;
    }

    return (await response.json()) as {
      ok: boolean;
      status: "correct" | "wrong" | "unknown";
      attempts: number;
      remainingAttempts: number;
      penaltyPointsForTask: number;
      locked: boolean;
    };
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
      setPendingEpisodeTransition({
        fromName: activeEpisode.name,
        toName: location.episodes[episodeIndex + 1]?.name ?? "Další zastavení",
        nextEpisodeIndex: episodeIndex + 1
      });
      return;
    }

    void (async () => {
      await finishLocation();
      setFinished(true);
    })();
  }

  async function handleValidate() {
    if (submittingAnswer) {
      return;
    }
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

    setSubmittingAnswer(true);
    const result = await submitTaskAnswer("answer", input);
    setSubmittingAnswer(false);
    if (!result) {
      return;
    }

    setWrongAttemptsByTask((current) => ({ ...current, [activeTask.id]: result.attempts }));
    if (result.status === "correct") {
      setStatus("correct");
      setMessage("Správně.");
      setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "known" }));
      return;
    }

    if (result.status === "unknown") {
      setStatus("unknown");
      setMessage(`Třetí pokus nevyšel, bereme to jako Nevím (-${UNKNOWN_PENALTY_POINTS} bodů).`);
      setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "unknown" }));
      return;
    }

    const attemptsLeft = Math.max(0, result.remainingAttempts);
    setStatus("wrong");
    setMessage(`Tohle nesedí. Zkus to znovu. Zbývá ${attemptsLeft} pokus.`);
  }

  async function handleUnknown() {
    if (submittingAnswer) {
      return;
    }
    setSubmittingAnswer(true);
    const result = await submitTaskAnswer("mark_unknown");
    setSubmittingAnswer(false);
    if (!result) {
      return;
    }
    setStatus("unknown");
    setMessage(`Nevadí, jdeme dál. Odečítáme ${UNKNOWN_PENALTY_POINTS} bodů.`);
    setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "unknown" }));
  }

  async function handlePhotoConfirmAndAdvance() {
    if (submittingAnswer) {
      return;
    }
    setSubmittingAnswer(true);
    const result = await submitTaskAnswer("confirm_manual");
    setSubmittingAnswer(false);
    if (!result) {
      return;
    }
    setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "known" }));
    setStatus("manual");
    setMessage("");
    advance();
  }

  async function handlePhotoUnknownAndAdvance() {
    if (submittingAnswer) {
      return;
    }
    setSubmittingAnswer(true);
    const result = await submitTaskAnswer("mark_unknown");
    setSubmittingAnswer(false);
    if (!result) {
      return;
    }
    setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "unknown" }));
    setStatus("unknown");
    setMessage("");
    advance();
  }

  function continueToNextEpisode() {
    if (!pendingEpisodeTransition) {
      return;
    }

    setEpisodeIndex(pendingEpisodeTransition.nextEpisodeIndex);
    setTaskIndex(0);
    setPendingEpisodeTransition(null);
    setStatus("idle");
    setMessage("");
    setInput("");
  }

  if (!locationUnlocked) {
    return (
      <main className="flex flex-1 flex-col gap-5 pb-24">
        <section className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-coral">Hra je zamčená</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{location.name}</h1>
          <p className="mt-3 text-sm leading-6 text-mist">{location.shortDescription ?? location.teaser}</p>
          <p className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/90">
            Odemkneš po dokončení: <span className="font-semibold">{unlockRequirement?.name ?? "předchozího místa"}</span>
          </p>
        </section>
        <Link href={`/locations/${location.id}`} className="rounded-[24px] bg-lime px-5 py-4 text-center font-semibold text-night">
          Zpět na detail místa
        </Link>
      </main>
    );
  }

  if (resuming) {
    return (
      <main className="flex flex-1 flex-col gap-5 pb-24">
        <section className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-sky">Načítám rozehranou hru</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{location.name}</h1>
          <p className="mt-3 text-sm text-mist">Obnovuju poslední uložený krok hry.</p>
        </section>
      </main>
    );
  }

  if (!hasAnyTasks) {
    return (
      <main className="flex flex-1 flex-col gap-5 pb-24">
        <section className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-coral">Hra ještě není připravená</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{location.name}</h1>
          <p className="mt-3 text-sm leading-6 text-mist">
            Tahle hra zatím není připravená. Zkus si zatím vybrat jinou hru.
          </p>
        </section>
        <Link href={`/locations/${location.id}`} className="rounded-[24px] bg-lime px-5 py-4 text-center font-semibold text-night">
          Zpět na detail místa
        </Link>
      </main>
    );
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

        <Link href="/" className="rounded-[24px] bg-lime px-5 py-4 text-center font-semibold text-night">
          Vybrat další hru
        </Link>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => router.push("/leaderboard")}
            className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 text-center font-semibold"
          >
            Žebříček
          </button>
          <button
            onClick={() => router.push("/profile")}
            className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 text-center font-semibold"
          >
            Profil
          </button>
        </div>
      </main>
    );
  }

  if (pendingEpisodeTransition) {
    return (
      <main className="flex flex-1 flex-col justify-center gap-5 pb-24">
        <section className="rounded-[32px] border-2 border-lime bg-lime/20 p-6 shadow-[0_0_0_1px_rgba(178,247,93,0.35),0_0_36px_rgba(178,247,93,0.2)]">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-lime">Blok splněn</p>
          <div className="mt-2 inline-flex rounded-full border border-lime/40 bg-night/35 px-3 py-1 text-xs font-semibold text-lime">
            Zastavení {pendingEpisodeTransition.nextEpisodeIndex}/{location.episodes.length} dokončeno
          </div>
          <div className="mt-5 rounded-2xl bg-night/45 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-mist">Dokončeno</p>
            <p className="mt-1 text-xl font-bold text-white">{pendingEpisodeTransition.fromName}</p>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lime text-2xl font-bold text-night">→</div>
            <p className="text-base font-semibold text-white">Přechod na další zastavení</p>
          </div>
          <div className="mt-3 rounded-2xl border border-lime/40 bg-night/35 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-lime">Pokračuješ na</p>
            <p className="mt-1 text-3xl font-bold text-white">{pendingEpisodeTransition.toName}</p>
          </div>
          <button
            onClick={continueToNextEpisode}
            className="mt-6 w-full rounded-[24px] bg-lime px-5 py-4 text-base font-bold text-night"
          >
            Pokračovat na další zastavení
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <section className="glass-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-lime">Rozehraná hra</p>
            <h1 className="mt-2 text-2xl font-bold">{location.name}</h1>
            <p className="mt-2 text-sm text-mist">{activeEpisode.name}</p>
          </div>
          <div className="rounded-full bg-lime/15 px-3 py-2 text-xs font-semibold text-lime">
            Sólový režim
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm text-mist">
            Zastavení {episodeIndex + 1}/{location.episodes.length} • Úkol {taskIndex + 1}/{activeEpisode.tasks.length}
          </div>
          <div className="rounded-full bg-white/5 px-3 py-2 text-xs text-mist">{progress}% hotovo</div>
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/10">
          <div className="h-2 rounded-full bg-lime" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 rounded-2xl border border-sky/20 bg-sky/10 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-sky">Aktuální zastavení</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {activeEpisode.name}
          </p>
          <p className="mt-1 text-xs text-mist">
            {isLastTask && !isLastEpisode ? "Po tomhle úkolu se přesuneš na další zastavení." : "Jsi na správném místě ve hře."}
          </p>
        </div>

        <div className="mt-3 rounded-[28px] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.24em] text-sky">O tomhle zastavení</p>
              <h2 className="mt-2 text-lg font-semibold text-white sm:text-xl">{activeEpisode.name}</h2>
              <p className="mt-2 text-sm leading-6 text-white/90 sm:leading-7">{activeEpisode.intro}</p>

              {activeEpisode.background ? (
                <div className="mt-3 rounded-[24px] border border-white/10 bg-night/35 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-coral">Trocha nudné historie</p>
                  <p className="mt-3 text-sm leading-6 text-mist">{activeEpisode.background}</p>
                </div>
              ) : null}
            </div>

            {activeEpisode.illustrationImage ? (
              <figure className="mx-auto w-full max-w-[168px] overflow-hidden rounded-[24px] border border-white/10 bg-white/5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:max-w-[220px] lg:mx-0 lg:w-[220px] lg:flex-none">
                {isExternalImage(activeEpisode.illustrationImage) ? (
                  <img
                    src={activeEpisode.illustrationImage}
                    alt={activeEpisode.illustrationImageAlt || `Ilustrační foto k zastavení ${activeEpisode.name}`}
                    className="aspect-square w-full object-cover object-center"
                  />
                ) : (
                  <Image
                    src={activeEpisode.illustrationImage}
                    alt={activeEpisode.illustrationImageAlt || `Ilustrační foto k zastavení ${activeEpisode.name}`}
                    width={720}
                    height={720}
                    className="aspect-square w-full object-cover object-center"
                  />
                )}
              </figure>
            ) : null}
          </div>
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
          <figure className="mt-4 mx-auto w-full max-w-[280px] overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
            {isExternalImage(activeTask.illustrationImage) ? (
              <img
                src={activeTask.illustrationImage}
                alt={activeTask.illustrationImageAlt || `Ilustrační foto k úkolu ${activeTask.title}`}
                className="aspect-square w-full object-cover object-center"
              />
            ) : (
              <Image
                src={activeTask.illustrationImage}
                alt={activeTask.illustrationImageAlt || `Ilustrační foto k úkolu ${activeTask.title}`}
                width={720}
                height={720}
                className="aspect-square w-full object-cover object-center"
              />
            )}
            <figcaption className="px-3 py-2 text-center text-xs text-mist">Ilustrační foto k úkolu</figcaption>
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
            <div className="space-y-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Sem napiš odpověď"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white outline-none placeholder:text-mist"
              />
              {activeTask.id === "klamovka-cassel-5" ? (
                <p className="text-xs text-mist">
                  Napiš aspoň 3 slova a odděluj je mezerou nebo čárkou, například{" "}
                  <span className="text-white/90">les, las, esa</span> nebo{" "}
                  <span className="text-white/90">les las esa</span>.
                </p>
              ) : null}
            </div>
          )}
        </div>

        {message ? (
          <p
            className={`mt-4 text-sm ${
              status === "correct"
                ? "text-lime"
                : status === "wrong"
                  ? "text-coral"
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
              onClick={() => void handlePhotoUnknownAndAdvance()}
              disabled={submittingAnswer}
              className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold text-mist"
            >
              Nevím
            </button>
            <button
              onClick={() => void handlePhotoConfirmAndAdvance()}
              disabled={submittingAnswer}
              className="rounded-[24px] bg-lime px-4 py-4 text-sm font-semibold text-night"
            >
              {isLastTask && isLastEpisode
                ? "Potvrdit a dokončit hru"
                : isLastTask && !isLastEpisode
                  ? "Potvrdit a přejít na další zastavení"
                  : "Potvrdit a pokračovat"}
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <button
              onClick={() => void handleValidate()}
              disabled={verificationFinished || taskOutcomes[activeTask.id] === "unknown" || submittingAnswer}
              className={`w-full rounded-[24px] px-4 py-4 text-sm font-bold transition-colors ${
                verificationFinished
                  ? "border border-white/10 bg-white/5 text-mist"
                  : "bg-lime text-night"
              } disabled:cursor-not-allowed`}
            >
              {submittingAnswer ? "Ověřuji..." : "Ověřit úkol"}
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => void handleUnknown()}
                disabled={submittingAnswer || verificationFinished}
                className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold text-mist"
              >
                Přeskočit −{UNKNOWN_PENALTY_POINTS}
              </button>
              <button
                onClick={advance}
                disabled={!canAdvance}
                className={`rounded-[24px] px-4 py-4 text-sm font-semibold transition-colors ${
                  canAdvance
                    ? "bg-lime text-night"
                    : "border border-white/10 bg-white/5 text-mist"
                } disabled:cursor-not-allowed`}
              >
                {isLastTask && isLastEpisode
                  ? "Dokončit hru"
                  : isLastTask && !isLastEpisode
                    ? "Další zastavení"
                    : "Další stopa"}
              </button>
            </div>
          </div>
        )}
      </section>

      {historicallyCompleted ? (
        <div className="rounded-[24px] border border-lime/20 bg-lime/10 p-4 text-sm text-mist">
          Tuhle hru už máš jednou dokončenou. Klidně si ji projdi znovu, ale nejlepší výsledek už si tím nezhoršíš.
        </div>
      ) : null}

    </main>
  );
}
