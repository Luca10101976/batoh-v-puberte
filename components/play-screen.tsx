"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppState } from "@/components/app-state-provider";
import type { MapLocation } from "@/lib/gameplay-types";
import { parseRequestedPlayStep, resolveResumeTarget } from "@/lib/play-resume";
import {
  flattenTasks,
  resolveCurrentTask,
  resolvePendingStopTransition,
  type OrderedTaskRow
} from "@/lib/task-order";
import type { FinishSummary } from "@/lib/game-result";
import type { GameplayEnding } from "@/lib/gameplay-types";
import { hasHistoricalLocationCompletion, isActiveInProgressLocation, isCompletedLocationProgress } from "@/lib/location-progress-state";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { PublicGameplayEpisode, PublicGameplayTask } from "@/lib/gameplay-types";
import { POINTS_PER_TASK, POINTS_PER_TASK_WITH_HINT, formatRemainingAttempts, getLocationMaxScore } from "@/lib/game-rules";
import { fetchWithSessionRecovery } from "@/lib/session-recovery";
import { illustrationSrc, type IllustrationName } from "@/lib/illustrations";

type TaskStatus = "idle" | "correct" | "manual" | "unknown" | "wrong";
const SELF_MEMBER_ID = "self";
const MAX_WRONG_ATTEMPTS_BEFORE_AUTO_UNKNOWN = 2;

// R26: závěr hry přijde ze serveru až po dokončení výpravy, ne v datech stránky.
type PlayLocation = Omit<MapLocation, "episodes" | "endingTitle" | "endingStory" | "playerMessage"> & {
  episodes: PublicGameplayEpisode[];
};

function isExternalImage(src: string) {
  return /^https?:\/\//i.test(src);
}

function isManualTask(task: PublicGameplayTask) {
  return task.type === "photo";
}

export function PlayScreen({ location }: { location: PlayLocation }) {
  const { state, setActiveMode, completeLocation, isLocationUnlocked, startRun } = useAppState();
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
  // R26: závěr a body přicházejí ze serveru; klient si nic nepřepočítává.
  const [finishSummary, setFinishSummary] = useState<(FinishSummary & { ending: GameplayEnding | null }) | null>(null);
  // R26/Q8: dokončená hra bez běžící výpravy – hotový výsledek místo tichého replaye.
  const [completedSummary, setCompletedSummary] = useState<
    | {
        bestScore: number;
        maxScore: number;
        totalTasks: number;
        completedAt: string | null;
        ending: GameplayEnding | null;
      }
    | null
  >(null);
  // R26/Q4: přechody, které hráč v téhle výpravě už odklikl. Serverový stav.
  const [confirmedStopIds, setConfirmedStopIds] = useState<string[]>([]);
  const [confirmingTransition, setConfirmingTransition] = useState(false);
  const [startingReplay, setStartingReplay] = useState(false);
  const [taskOutcomes, setTaskOutcomes] = useState<Record<string, "known" | "unknown">>({});
  const [wrongAttemptsByTask, setWrongAttemptsByTask] = useState<Record<string, number>>({});
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  // R25: nápovědy otevřené v této výpravě. Text přichází ze serveru až po otevření.
  const [hintTextByTask, setHintTextByTask] = useState<Record<string, string>>({});
  const [hintUsedByTask, setHintUsedByTask] = useState<Record<string, boolean>>({});
  const [loadingHint, setLoadingHint] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [resuming, setResuming] = useState(true);
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    // R25: intro se ukazuje jen na skutečném začátku výpravy. Detail hry ho zapne
    // po zahájení nové výpravy; pokračování rozehrané hry ho nikdy nevyvolá.
    if (searchParams.get("intro") === "1") {
      setIntroOpen(true);
    }
    setActiveMode("solo");
    // R26/Q1: číslo v adrese už obrazovku nikam neposouvá. Pozici určuje výhradně
    // pravidlo pořadí nad uzavřenými úkoly výpravy, stejné jako na serveru.
  }, [searchParams, setActiveMode]);

  // R44: jediná autoritativní cesta do nové hry.
  //
  // Hráč se sem může dostat i tak, že mezitím prošel registrací nebo obnovením
  // Traki klíčem – v tu chvíli výprava ještě neexistuje. Dřív se hra přesto
  // vykreslila a tvářila se jako rozehraná. Teď se výprava založí tady, stejnou
  // operací jako u existujícího hráče, a teprve pak se ukáže úvod.
  const pendingStart = searchParams.get("start") === "1";
  const startRequestedRef = useRef(false);
  useEffect(() => {
    if (!pendingStart || startRequestedRef.current) {
      return;
    }
    if (!state.registrationCompleted || !state.profileCode) {
      return;
    }
    startRequestedRef.current = true;
    void (async () => {
      const started = await startRun(location.id);
      if (started.created) {
        setIntroOpen(true);
      }
      router.replace(`/play/${location.id}?mode=solo`);
    })();
  }, [location.id, pendingStart, router, startRun, state.profileCode, state.registrationCompleted]);

  const locationUnlocked = isLocationUnlocked(location.id, location.unlocked, location.unlockedByPlaceId ?? null);
  // R38: název vyžadované hry spočítal server z katalogu v databázi (R21).
  // Dřív se dohledával v obsahu v kódu, takže hru z Mozku neuměl pojmenovat.
  const unlockRequirementName = location.unlockRequirementName ?? null;
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
  // R44: kontext zastávky (uvedení, historie, fotka) patří k příchodu na místo,
  // tedy k jejímu prvnímu úkolu. U dalších úkolů téže zastávky se neopakuje.
  const isFirstTaskOfEpisode = taskIndex === 0;
  const isLastEpisode = episodeIndex === location.episodes.length - 1;
  const totalTasks = location.episodes.reduce((sum, episode) => sum + episode.tasks.length, 0);
  // R44: procentuální postup se hráči nikde neukazuje, takže se ani nepočítá.
  // totalTasks zůstává – rozhoduje jen o tom, jestli hra vůbec má nějaké úkoly.
  // R26: postup výpravy v podobě, které rozumí autoritativní pravidlo pořadí.
  const taskProgressRows: OrderedTaskRow[] = useMemo(
    () =>
      Object.entries(taskOutcomes).map(([taskId, outcome]) => ({
        task_id: taskId,
        status: outcome === "known" ? ("correct" as const) : ("unknown" as const)
      })),
    [taskOutcomes]
  );
  // R26/Q4: přechodová obrazovka není stav v paměti, ale důsledek uzavřených úkolů
  // a toho, co hráč potvrdil. Proto přežije reload i druhé zařízení.
  const pendingTransition = useMemo(
    () =>
      resolvePendingStopTransition({
        episodes: location.episodes,
        taskProgress: taskProgressRows,
        confirmedStopIds
      }),
    [confirmedStopIds, location.episodes, taskProgressRows]
  );
  const historicallyCompleted = state.completedLocationIds.includes(location.id);
  const knownCount = Object.values(taskOutcomes).filter((outcome) => outcome === "known").length;
  const unknownCount = Object.values(taskOutcomes).filter((outcome) => outcome === "unknown").length;
  const canAdvance =
    status === "correct" ||
    status === "unknown" ||
    status === "manual";
  const verificationFinished = status === "correct" || status === "unknown" || status === "manual";
  // R44: úkol může být uzavřený i bez čerstvé odpovědi – třeba když se hráč vrátí
  // do rozehrané hry na úkol, který už vyřešil. Stav `status` je po načtení „idle“,
  // ale výsledek úkolu známe z uzavřených odpovědí výpravy. Pro nabídku akcí
  // rozhoduje tohle, aby hráči nikdy nechyběla cesta dál.
  const taskAlreadyClosed =
    taskOutcomes[activeTask.id] === "known" || taskOutcomes[activeTask.id] === "unknown";
  const taskResolved = verificationFinished || taskAlreadyClosed;
  // Ilustrace stavu odpovědi (schválené mapování samolepek Traki)
  const statusIllustration: IllustrationName | null =
    status === "correct" || status === "manual"
      ? "hvezda"
      : status === "wrong"
        ? "otaznik"
        : status === "unknown"
          ? "pokrceni"
          : null;

  const completionLabel = useMemo(() => `Body se připíšou hráči ${state.profile.name}.`, [state.profile.name]);
  const hintUsedHere = Boolean(hintUsedByTask[activeTask?.id ?? ""]);
  const revealedHint = hintTextByTask[activeTask?.id ?? ""] ?? "";
  const pointsForThisTask = hintUsedHere ? POINTS_PER_TASK_WITH_HINT : POINTS_PER_TASK;
  const hasAnyTasks = totalTasks > 0;

  useEffect(() => {
    async function hydrateInProgressMission() {
      setTaskOutcomes({});
      setWrongAttemptsByTask({});
      setStatus("idle");
      setMessage("");
      setInput("");
      setFinished(false);
      setFinishSummary(null);
      setCompletedSummary(null);
      setConfirmedStopIds([]);

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
            task_progress?: Array<{
              task_id: string;
              status: "correct" | "wrong" | "unknown";
              attempts: number;
              hintUsed?: boolean;
            }>;
            location?: { status?: "in_progress" | "completed" | null };
            run?: { id: string; mode: string; startedAt: string | null } | null;
            confirmedStopTransitions?: string[];
            completed?: {
              bestScore: number;
              maxScore: number;
              totalTasks: number;
              completedAt: string | null;
              ending: GameplayEnding | null;
            } | null;
          }
        | null;

      const rows = payload?.task_progress ?? [];
      const locationProgress = payload?.location ?? null;
      setConfirmedStopIds(payload?.confirmedStopTransitions ?? []);

      // R26/Q8: dokončená hra bez běžící výpravy se sama znovu nespustí. Hráč
      // uvidí výsledek a novou výpravu založí až vědomým „Hrát znovu".
      if (payload?.completed) {
        setCompletedSummary(payload.completed);
        setIntroOpen(false);
        setResuming(false);
        return;
      }

      if (rows.length === 0) {
        // R24: o rozehranosti rozhoduje BĚŽÍCÍ VÝPRAVA, kterou vrací server.
        // Když žádná neběží (přímý vstup na adresu hry), zahájí se stejnou
        // operací jako tlačítko Hrát – žádná druhá cesta zakládání neexistuje.
        // R26/Q8: startRun se tu volá jen pro hru, kterou hráč nikdy nedokončil.
        // Dokončená hra bez výpravy se vyřídila výš a nový průchod nezakládá.
        if (!payload?.run) {
          await startRun(location.id);
        }

        const target = resolveResumeTarget({
          episodes: location.episodes,
          taskProgress: [],
          requestedEpisodeIndex,
          requestedTaskIndex
        });
        setEpisodeIndex(target.episodeIndex);
        setTaskIndex(target.taskIndex);

        if (historicallyCompleted || hasHistoricalLocationCompletion(locationProgress)) {
          setMessage("Tohle je opakované hraní. Nejlepší výsledek si tím nezhoršíš.");
        }
        setStatus("idle");
        setResuming(false);
        return;
      }

      const outcomes: Record<string, "known" | "unknown"> = {};
      const attempts: Record<string, number> = {};

      const hints: Record<string, boolean> = {};
      rows.forEach((row) => {
        attempts[row.task_id] = Math.max(0, row.attempts ?? 0);
        if (row.hintUsed) {
          hints[row.task_id] = true;
        }
        if (row.status === "correct") {
          outcomes[row.task_id] = "known";
        }
        if (row.status === "unknown") {
          outcomes[row.task_id] = "unknown";
        }
      });

      setTaskOutcomes((current) => ({ ...current, ...outcomes }));
      setWrongAttemptsByTask((current) => ({ ...current, ...attempts }));
      setHintUsedByTask((current) => ({ ...current, ...hints }));
      // Rozehraná výprava už úvod nepotřebuje, i kdyby na ni vedl starý odkaz.
      setIntroOpen(false);

      // R24: pozice se nikam neukládá, počítá se z uzavřených úkolů této výpravy.
      // Číslo v adrese je jen nápověda pro odkaz zvenčí – když na něm leží už
      // uzavřený úkol (zastaralý odkaz), použije se skutečná pozice.
      const target = resolveResumeTarget({
        episodes: location.episodes,
        taskProgress: rows.map((row) => ({ task_id: row.task_id, status: row.status })),
        requestedEpisodeIndex,
        requestedTaskIndex
      });
      setEpisodeIndex(target.episodeIndex);
      setTaskIndex(target.taskIndex);

      if (target.source === "completed") {
        setMessage("Máš vyřešené všechny úkoly. Dokonči hru tlačítkem v posledním kroku.");
        setStatus("idle");
      } else if (target.source === "computed") {
        setMessage("Navázali jsme na tvoji rozehranou hru.");
        setStatus("idle");
      }

      setResuming(false);
    }

    void hydrateInProgressMission();
  }, [historicallyCompleted, location.episodes, location.id, requestedEpisodeIndex, requestedTaskIndex, startRun, state.profileCode, supabase, taskPositionById]);

  // R26/Q6: skóre nevzniká v prohlížeči. Server vrátí hotový výsledek dokončené
  // výpravy, nejlepší historický výsledek, jestli jde o rekord, závěr hry a
  // případnou odemčenou hru – obrazovka to jen vykreslí.
  async function finishLocation() {
    if (!supabase || !state.profileCode) {
      setMessage("Nejdřív se prosím přihlas.");
      return;
    }
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    if (!accessToken) {
      setMessage("Přihlášení vypršelo. Přihlas se prosím znovu Traki klíčem.");
      return;
    }

    const response = await fetch("/api/game/complete-location", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        profileCode: state.profileCode,
        locationId: location.id,
        mode: "solo",
        source: "gameplay"
      })
    }).catch(() => null);

    if (!response?.ok) {
      setMessage("Hru se teď nepodařilo uzavřít. Zkus to prosím znovu.");
      return;
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          participantCodes?: string[];
          result?: FinishSummary["result"] | null;
          bestScore?: number | null;
          isNewBest?: boolean;
          ending?: GameplayEnding | null;
          unlockedGame?: FinishSummary["unlockedGame"];
        }
      | null;

    if (!payload?.result) {
      setMessage("Hru se teď nepodařilo uzavřít. Zkus to prosím znovu.");
      return;
    }

    setFinishSummary({
      result: payload.result,
      bestScore: payload.bestScore ?? payload.result.score,
      isNewBest: Boolean(payload.isNewBest),
      unlockedGame: payload.unlockedGame ?? null,
      ending: payload.ending ?? null
    });
    setFinished(true);

    // Lokální stav se aktualizuje serverovými čísly, ne vlastním výpočtem.
    const participantIds = (payload.participantCodes ?? []).map((code) => code.trim().toUpperCase());
    if (participantIds.length > 0) {
      completeLocation(location.id, {
        participantIds,
        score: payload.result.score,
        maxScore: payload.result.maxScore,
        penaltyPoints: Math.max(0, payload.result.maxScore - payload.result.score),
        source: "gameplay"
      });
    }
  }

  // R26/Q8: opakované hraní vzniká jedině tímhle kliknutím, nikdy reloadem.
  async function handlePlayAgain() {
    if (startingReplay) {
      return;
    }
    setStartingReplay(true);
    const started = await startRun(location.id);
    setStartingReplay(false);
    router.push(`/play/${location.id}?mode=solo${started.created ? "&intro=1" : ""}`);
  }

  async function submitTaskAnswer(action: "answer" | "mark_unknown" | "confirm_manual", answerValue?: string) {
    if (!supabase || !state.profileCode) {
      setStatus("wrong");
      setMessage("Nejdřív se prosím přihlas.");
      return null;
    }

    // Neplatná session (server ji zamítl, lokální JWT ještě nevypršel) → refresh → retry →
    // jinak lokální odhlášení, které otevře PlayerAuthGate („Už mám Traki“).
    const recovery = await fetchWithSessionRecovery(
      (accessToken) =>
        fetch("/api/game/submit-task-answer", {
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
        }).catch(() => null),
      {
        getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
        refreshAccessToken: async () => (await supabase.auth.refreshSession()).data.session?.access_token ?? null,
        signOutLocal: async () => {
          await supabase.auth.signOut({ scope: "local" });
        }
      }
    );

    if (recovery.kind === "no_session" || recovery.kind === "session_invalid") {
      setStatus("wrong");
      setMessage("Přihlášení vypršelo. Přihlas se prosím znovu Traki klíčem – tvůj postup zůstává uložený.");
      return null;
    }

    if (recovery.kind === "network_error") {
      setStatus("wrong");
      setMessage("Ověření odpovědi se nepodařilo. Zkus to znovu.");
      return null;
    }

    // R26/Q2: server odmítl úkol mimo pořadí. Nic se nezapsalo, takže obrazovku
    // jen vrátíme tam, kde hráč doopravdy je – nikdy ho nenecháme v rozbitém stavu.
    if (recovery.response.status === 409) {
      const rejection = (await recovery.response.json().catch(() => null)) as
        | { error?: string; currentTaskId?: string | null; message?: string }
        | null;
      if (rejection?.error === "task_out_of_order") {
        const target = rejection.currentTaskId ? taskPositionById.get(rejection.currentTaskId) : null;
        if (target) {
          setEpisodeIndex(target.episodeIndex);
          setTaskIndex(target.taskIndex);
        }
        setInput("");
        setStatus("idle");
        setMessage(rejection.message ?? "Tenhle úkol ještě není na řadě.");
        return null;
      }
    }

    if (!recovery.response.ok) {
      setStatus("wrong");
      setMessage("Ověření odpovědi se nepodařilo. Zkus to znovu.");
      return null;
    }

    const response = recovery.response;

    return (await response.json()) as {
      ok: boolean;
      status: "correct" | "wrong" | "unknown";
      attempts: number;
      remainingAttempts: number;
      awardedPointsForTask: number;
      locked: boolean;
    };
  }

  // R26: pozici neurčuje počítadlo v prohlížeči, ale stejné pravidlo pořadí, jaké
  // vynucuje server – první neuzavřený úkol hry. Přechodová obrazovka se objeví
  // sama, protože vyplývá z uzavřených úkolů zastávky.
  function advance(closedTaskId?: string) {
    setInput("");
    setStatus("idle");
    setMessage("");

    const progress: OrderedTaskRow[] = closedTaskId
      ? [...taskProgressRows.filter((row) => row.task_id !== closedTaskId), { task_id: closedTaskId, status: "correct" }]
      : taskProgressRows;
    const next = resolveCurrentTask(location.episodes, progress);

    if (!next) {
      void (async () => {
        await finishLocation();
      })();
      return;
    }

    setEpisodeIndex(next.episodeIndex);
    setTaskIndex(next.taskIndex);
  }

  // R24/D3: server je zdroj pravdy. Když úkol mezitím uzavřelo jiné zařízení,
  // server vrátí uložený výsledek s `locked: true` a tahle obrazovka ho jen
  // převezme – nic nepřepisuje a neukazuje hlášku pro odpověď, která se nezapsala.
  function applyLockedResult(result: {
    status: "correct" | "wrong" | "unknown";
    locked: boolean;
    attempts: number;
    awardedPointsForTask?: number;
  }) {
    if (!result.locked || result.status === "wrong") {
      return false;
    }
    setWrongAttemptsByTask((current) => ({ ...current, [activeTask.id]: result.attempts }));
    setTaskOutcomes((current) => ({ ...current, [activeTask.id]: result.status === "correct" ? "known" : "unknown" }));
    setStatus(result.status === "correct" ? "correct" : "unknown");
    setMessage(
      result.status === "correct"
        ? `Tenhle úkol už máš vyřešený správně, třeba na jiném zařízení. Máš za něj ${result.awardedPointsForTask ?? POINTS_PER_TASK} bodů.`
        : "Tenhle úkol už je uzavřený jako Nevím, třeba na jiném zařízení. Pokračuj dál."
    );
    return true;
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

    // R44: prázdný vstup je věc formuláře, ne serveru. Dřív se odeslal a hráč
    // dostal obecnou technickou hlášku, ze které nepoznal, co má udělat.
    if (activeTask.type !== "choice" && !input.trim()) {
      setStatus("wrong");
      setMessage("Napiš nejdřív odpověď.");
      return;
    }
    if (activeTask.type === "choice" && !input.trim()) {
      setStatus("wrong");
      setMessage("Vyber nejdřív odpověď.");
      return;
    }

    setSubmittingAnswer(true);
    const result = await submitTaskAnswer("answer", input);
    setSubmittingAnswer(false);
    if (!result) {
      return;
    }
    if (taskOutcomes[activeTask.id] === undefined && result.locked && applyLockedResult(result)) {
      return;
    }

    setWrongAttemptsByTask((current) => ({ ...current, [activeTask.id]: result.attempts }));
    if (result.status === "correct") {
      setStatus("correct");
      setMessage(`Správně. Za tenhle úkol máš ${result.awardedPointsForTask ?? pointsForThisTask} bodů.`);
      setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "known" }));
      return;
    }

    if (result.status === "unknown") {
      setStatus("unknown");
      setMessage("Třetí pokus nevyšel. Tenhle úkol se uzavírá jako Nevím a je za 0 bodů.");
      setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "unknown" }));
      return;
    }

    const attemptsLeft = Math.max(0, result.remainingAttempts);
    setStatus("wrong");
    setMessage(`Tohle nesedí. Zkus to znovu. ${formatRemainingAttempts(attemptsLeft)}`);
  }

  // R25: nápovědu vydá až server a zároveň si poznamená, že padla. Text se proto
  // nedá přečíst ze zdroje stránky a body se nedají získat obejitím klienta.
  //
  // `silent` je dotažení textu nápovědy, kterou hráč otevřel dřív (jiný den, jiné
  // zařízení). Body už jsou utracené, volání je na serveru idempotentní, takže se
  // tím nic nemění – jen se hráči vrátí to, co si už zaplatil.
  async function handleRevealHint(options?: { silent?: boolean }) {
    const silent = options?.silent === true;
    if (loadingHint || revealedHint) {
      return;
    }
    if (!supabase || !state.profileCode) {
      if (!silent) {
        setMessage("Nejdřív se prosím přihlas.");
      }
      return;
    }
    setLoadingHint(true);
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    const response = accessToken
      ? await fetch("/api/game/reveal-hint", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            profileCode: state.profileCode,
            locationId: location.id,
            taskId: activeTask.id
          })
        }).catch(() => null)
      : null;
    setLoadingHint(false);

    if (!response?.ok) {
      if (!silent) {
        setMessage("Nápovědu se teď nepodařilo načíst. Zkus to prosím znovu.");
      }
      return;
    }
    const payload = (await response.json().catch(() => null)) as { hintText?: string } | null;
    if (!payload?.hintText) {
      return;
    }
    setHintTextByTask((current) => ({ ...current, [activeTask.id]: payload.hintText as string }));
    setHintUsedByTask((current) => ({ ...current, [activeTask.id]: true }));
  }

  // R25: otevřená nápověda musí přežít reload i přechod na druhé zařízení. Server
  // stav zná (hint_used_at), ale text v prohlížeči po načtení chybí – bez tohohle
  // by obrazovka znovu nabízela „ukázat za 5 bodů" za něco, co je už zaplacené.
  const hintRefetchedRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const taskId = activeTask?.id;
    if (!taskId || !activeTask?.hasHint || !hintUsedHere || revealedHint || loadingHint) {
      return;
    }
    if (hintRefetchedRef.current[taskId]) {
      return;
    }
    hintRefetchedRef.current[taskId] = true;
    void handleRevealHint({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTask?.id, activeTask?.hasHint, hintUsedHere, revealedHint, loadingHint]);

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
    if (result.locked && result.status !== "unknown" && applyLockedResult(result)) {
      return;
    }
    setStatus("unknown");
    setMessage("Nevadí, jdeme dál. Za tenhle úkol je 0 bodů.");
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
    if (result.locked && result.status !== "correct" && applyLockedResult(result)) {
      return;
    }
    setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "known" }));
    setStatus("manual");
    setMessage("");
    advance(activeTask.id);
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
    if (result.locked && result.status !== "unknown" && applyLockedResult(result)) {
      return;
    }
    setTaskOutcomes((current) => ({ ...current, [activeTask.id]: "unknown" }));
    setStatus("unknown");
    setMessage("");
    advance(activeTask.id);
  }

  // R26/Q4: potvrzení se zapisuje k účastníkovi výpravy, takže obrazovka zůstane
  // zavřená i po reloadu a na druhém zařízení. Volání je idempotentní.
  async function continueToNextEpisode() {
    if (!pendingTransition || confirmingTransition) {
      return;
    }
    setConfirmingTransition(true);
    const accessToken = supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? "" : "";
    if (accessToken && state.profileCode) {
      const response = await fetch("/api/game/confirm-stop-transition", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          profileCode: state.profileCode,
          locationId: location.id,
          stopId: pendingTransition.fromStopId
        })
      }).catch(() => null);

      if (!response?.ok) {
        setConfirmingTransition(false);
        setMessage("Přechod se nepodařilo uložit. Zkus to prosím znovu.");
        return;
      }
      const payload = (await response.json().catch(() => null)) as { confirmedStopTransitions?: string[] } | null;
      setConfirmedStopIds(payload?.confirmedStopTransitions ?? [...confirmedStopIds, pendingTransition.fromStopId]);
    } else {
      setConfirmedStopIds((current) => [...current, pendingTransition.fromStopId]);
    }

    setConfirmingTransition(false);
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
            Odemkneš po dokončení: <span className="font-semibold">{unlockRequirementName ?? "předchozí hry"}</span>
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

  if (introOpen) {
    return (
      <main className="flex flex-1 flex-col gap-5 pb-24">
        <section className="glass-card overflow-hidden p-0">
          <div className="relative h-56 w-full">
            {isExternalImage(location.image) ? (
              <img src={location.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <Image src={location.image} alt="" fill priority className="object-cover" sizes="100vw" />
            )}
          </div>
          <div className="p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-lime">Začínáme</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{location.name}</h1>
            {location.introStory ? (
              <p className="mt-4 text-sm leading-7 text-mist">{location.introStory}</p>
            ) : null}
            {location.episodes[0]?.name ? (
              <p className="mt-4 text-sm text-white/90">
                První zastávka: <span className="font-semibold">{location.episodes[0].name}</span>
              </p>
            ) : null}
            <button
              onClick={() => setIntroOpen(false)}
              className="mt-6 w-full rounded-[24px] bg-lime px-5 py-4 text-center text-base font-bold text-night"
            >
              Vyrážíme
            </button>
          </div>
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

  // R26/Q6+Q8: závěr i výsledek pocházejí ze serveru. Stejná obrazovka slouží
  // po dokončení hry i při návratu na hru, kterou má hráč dávno hotovou –
  // v tom druhém případě bez skóre právě dohrané výpravy, protože žádná neběžela.
  const endingView = finishSummary
    ? {
        ending: finishSummary.ending,
        score: finishSummary.result.score,
        maxScore: finishSummary.result.maxScore,
        correctTasks: finishSummary.result.correctTasks,
        unknownTasks: finishSummary.result.unknownTasks,
        bestScore: finishSummary.bestScore,
        isNewBest: finishSummary.isNewBest,
        unlockedGame: finishSummary.unlockedGame,
        justFinished: true
      }
    : completedSummary
      ? {
          ending: completedSummary.ending,
          score: null,
          maxScore: completedSummary.maxScore,
          correctTasks: null,
          unknownTasks: null,
          bestScore: completedSummary.bestScore,
          isNewBest: false,
          unlockedGame: null,
          justFinished: false
        }
      : null;

  if ((finished || completedSummary) && endingView) {
    return (
      <main className="flex flex-1 flex-col gap-5 pb-24">
        <section className="glass-card p-5">
          <div className="flex justify-center">
            <Image
              src={illustrationSrc("konfety")}
              alt=""
              width={140}
              height={140}
              className="h-[140px] w-[140px] object-contain"
            />
          </div>
          <p className="mt-2 text-xs uppercase tracking-[0.24em] text-coral">
            {endingView.justFinished ? "Závěrečné odhalení" : "Hru už máš dohranou"}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{endingView.ending?.endingTitle ?? location.name}</h1>
          {endingView.ending?.endingStory ? (
            <p className="mt-4 text-sm leading-7 text-mist">{endingView.ending.endingStory}</p>
          ) : null}
        </section>

        {endingView.ending?.playerMessage ? (
          <section className="glass-card p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-lime">Zpráva pro hráče</p>
            <p className="mt-3 text-base leading-7 text-white/90">{endingView.ending.playerMessage}</p>
          </section>
        ) : null}

        <section className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-lime">Výsledek</p>
          {endingView.score !== null ? (
            <>
              {/* R44: konec hry není vyhodnocení testu. Žádný zlomek, žádné
                  maximum, žádná bilance správně/Nevím. Uložené skóre se nemění. */}
              <p className="mt-3 text-4xl font-bold">
                {endingView.score}
                <span className="ml-2 text-xl text-mist">bodů</span>
              </p>
              <p className="mt-1 text-sm text-mist">{completionLabel}</p>
              {endingView.isNewBest ? (
                <p className="mt-3 rounded-2xl border border-lime/30 bg-lime/10 px-4 py-3 text-sm font-semibold text-lime">
                  Nový nejlepší výsledek téhle hry.
                </p>
              ) : (
                <p className="mt-3 text-sm text-mist">
                  Tvůj nejlepší výsledek téhle hry zůstává {endingView.bestScore} bodů.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mt-3 text-4xl font-bold">
                {endingView.bestScore}
                <span className="ml-2 text-xl text-mist">bodů</span>
              </p>
              <p className="mt-1 text-sm text-mist">Tvůj nejlepší výsledek téhle hry.</p>
            </>
          )}
        </section>

        {endingView.unlockedGame ? (
          <section className="glass-card p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-coral">Odemkl jsi další hru</p>
            <p className="mt-2 text-xl font-bold">{endingView.unlockedGame.title}</p>
            <Link
              href={`/locations/${endingView.unlockedGame.locationId}`}
              className="mt-4 inline-flex w-full items-center justify-center rounded-[24px] border border-lime/40 bg-lime/10 px-5 py-4 text-center font-semibold text-lime"
            >
              Podívat se na ni
            </Link>
          </section>
        ) : null}

        {/* R26/Q8: novou výpravu založí jedině vědomé kliknutí hráče. */}
        <button
          onClick={() => void handlePlayAgain()}
          disabled={startingReplay}
          className="rounded-[24px] bg-lime px-5 py-4 text-center font-semibold text-night disabled:opacity-70"
        >
          {startingReplay ? "Připravuju hru…" : "Hrát znovu"}
        </button>
        <Link href="/" className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 text-center font-semibold">
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

  // Přechodová obrazovka nastupuje až ve chvíli, kdy hráč potvrdil výsledek
  // posledního úkolu zastávky (status je zpět na „idle"). Jinak by hlášku
  // o získaných bodech okamžitě překryla.
  if (pendingTransition && status === "idle") {
    // R44: přechod říká jen to podstatné – zastávka je hotová a kam se jde dál.
    // Autorský text z Mozku se zobrazí, když existuje; nic se za autora nevymýšlí
    // a chybějící text se ničím nenahrazuje, aby bylo poznat, že chybí.
    const transitionText = pendingTransition.transitionText?.trim() || "";

    return (
      <main className="flex flex-1 flex-col justify-center gap-5 pb-24">
        <section className="rounded-[32px] border-2 border-lime bg-lime/20 p-6 shadow-[0_0_0_1px_rgba(178,247,93,0.35),0_0_36px_rgba(178,247,93,0.2)]">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-lime">Zastávka hotová</p>
          <div className="mt-5 rounded-2xl border border-lime/40 bg-night/35 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-lime">Pokračuješ na</p>
            <p className="mt-1 text-3xl font-bold text-white">{pendingTransition.toStopName}</p>
          </div>
          {transitionText ? (
            <div className="mt-4 flex items-start gap-3">
              <Image
                src={illustrationSrc("rozcestnik")}
                alt=""
                width={72}
                height={72}
                className="h-[72px] w-[72px] shrink-0 object-contain"
              />
              <p className="text-base leading-7 text-white/90">{transitionText}</p>
            </div>
          ) : null}
          <button
            onClick={() => void continueToNextEpisode()}
            disabled={confirmingTransition}
            className="mt-6 w-full rounded-[24px] bg-lime px-5 py-4 text-base font-bold text-night disabled:opacity-70"
          >
            {confirmingTransition ? "Ukládám…" : "Pokračovat na další zastavení"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <section className="glass-card p-4 sm:p-5">
        {/* R44: hra je dobrodružství, které se odkrývá, ne ukazatel postupu.
            Pryč je „Rozehraná hra“, procenta, pruh postupu, počty zastavení
            i úkolů a štítek režimu – hráč si žádný režim nevybíral a skupinové
            hraní je odložené (R34). Evidence postupu na serveru se nemění,
            mění se jen to, co vidí hráč. */}
        {/* R44: název zastávky je na obrazovce jednou. Uvedení místa, historie
            a fotka patří k PŘÍCHODU na zastávku – u dalších úkolů téhož místa už
            se neopakují, protože hráč se nikam nepřesunul a četl je. Kdo se vrací
            do rozehrané hry doprostřed zastávky, úvodem znovu procházet nemusí. */}
        <div>
          <h1 className="text-2xl font-bold">{location.name}</h1>
          <p className="mt-2 text-base font-semibold text-white">{activeEpisode.name}</p>
        </div>

        {isFirstTaskOfEpisode ? (
        <div className="mt-3 rounded-[28px] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-6 text-white/90 sm:leading-7">{activeEpisode.intro}</p>

              {activeEpisode.background ? (
                <div className="mt-3 rounded-[24px] border border-white/10 bg-night/35 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-coral">Trocha nudné historie</p>
                  <p className="mt-3 text-sm leading-6 text-mist">{activeEpisode.background}</p>
                </div>
              ) : null}
            </div>

            {activeEpisode.illustrationImage ? (
              <figure className="mx-auto w-full max-w-[120px] overflow-hidden rounded-[24px] border border-white/10 bg-white/5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:max-w-[160px] lg:mx-0 lg:w-[180px] lg:flex-none">
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
        ) : null}
      </section>

      <section className="glass-card p-5">
        {/* R44: štítek typu úkolu („Výběr“, „Otázka“) hráči nic neříká. Typ zůstává
            interně, jen se nevypisuje. */}
        <h2 className="text-2xl font-semibold">{activeTask.title}</h2>
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
            /* R44: po definitivním vyřešení se volby nesmí tvářit, že jdou měnit.
               Zvolená odpověď zůstane zvýrazněná, ostatní zešednou. aria-pressed
               dává stav výběru i čtečkám obrazovky. */
            <div className="space-y-2">
              {activeTask.options?.map((option) => {
                const zvoleno = input === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setInput(option)}
                    disabled={verificationFinished}
                    aria-pressed={zvoleno}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                      zvoleno ? "border-lime bg-lime/10 text-white" : "border-white/10 bg-white/5"
                    } ${verificationFinished && !zvoleno ? "opacity-40" : ""} disabled:cursor-default`}
                  >
                    {option}
                  </button>
                );
              })}
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
              {activeTask.minCorrectMatches ? (
                <p className="text-xs text-mist">
                  Stačí {activeTask.minCorrectMatches} správné odpovědi. Odděl je mezerou nebo čárkou.
                </p>
              ) : null}
            </div>
          )}
        </div>

        {activeTask.hasHint ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            {revealedHint ? (
              <div className="flex items-start gap-3">
                <Image
                  src={illustrationSrc("zarovka")}
                  alt=""
                  width={56}
                  height={56}
                  className="h-12 w-12 shrink-0 object-contain"
                />
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-lime">Nápověda</p>
                  <p className="mt-2 text-sm leading-6 text-white/90">{revealedHint}</p>
                  <p className="mt-2 text-xs text-mist">
                    Za správnou odpověď máš teď {POINTS_PER_TASK_WITH_HINT} bodů.
                  </p>
                </div>
              </div>
            ) : hintUsedHere ? (
              <div className="flex items-start gap-3">
                <Image
                  src={illustrationSrc("zarovka")}
                  alt=""
                  width={56}
                  height={56}
                  className="h-12 w-12 shrink-0 object-contain"
                />
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-lime">Nápověda</p>
                  <p className="mt-2 text-sm leading-6 text-white/90">
                    {loadingHint ? "Načítám nápovědu…" : "Nápovědu k tomuhle úkolu už máš otevřenou."}
                  </p>
                  <p className="mt-2 text-xs text-mist">
                    Za správnou odpověď máš teď {POINTS_PER_TASK_WITH_HINT} bodů.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-mist">
                  Nevíš si rady? Nápověda ti pomůže, ale za správnou odpověď pak bude{" "}
                  <span className="font-semibold text-white">{POINTS_PER_TASK_WITH_HINT} místo {POINTS_PER_TASK} bodů</span>.
                </p>
                <button
                  onClick={() => void handleRevealHint()}
                  disabled={loadingHint}
                  className="inline-flex min-h-11 flex-none items-center justify-center rounded-[20px] border border-lime/40 bg-lime/10 px-5 py-2 text-sm font-semibold text-lime disabled:opacity-70"
                >
                  {loadingHint ? "Načítám…" : `Ukázat nápovědu za ${POINTS_PER_TASK_WITH_HINT} bodů`}
                </button>
              </div>
            )}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 flex items-center gap-3">
            {statusIllustration ? (
              <Image
                src={illustrationSrc(statusIllustration)}
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 shrink-0 object-contain"
              />
            ) : null}
            <p
              className={`text-sm ${
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
          </div>
        ) : null}

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
          /* R44: dokud úkol není definitivně vyřešený, hráč odpovídá a může to
             zkusit znovu. Jakmile je vyřešený, zůstane jedna cesta dál – nezobrazují
             se akce, které už nejdou použít. */
          <div className="mt-5 space-y-3">
            {taskResolved ? (
              <button
                onClick={() => advance()}
                disabled={!canAdvance && !taskAlreadyClosed}
                className="w-full rounded-[24px] bg-lime px-4 py-4 text-sm font-bold text-night disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLastTask && isLastEpisode
                  ? "Dokončit hru"
                  : isLastTask && !isLastEpisode
                    ? "Další zastavení"
                    : "Další stopa"}
              </button>
            ) : (
              <>
                <button
                  onClick={() => void handleValidate()}
                  disabled={submittingAnswer}
                  className="w-full rounded-[24px] bg-lime px-4 py-4 text-sm font-bold text-night transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingAnswer ? "Ověřuji..." : "Ověřit odpověď"}
                </button>
                <button
                  onClick={() => void handleUnknown()}
                  disabled={submittingAnswer}
                  className="w-full rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold text-mist disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Nevím
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {/* R44: během dobrodružství hráči nepřipomínáme systémovou historii
          předchozího průchodu. Uložené nejlepší skóre se nemění. */}

    </main>
  );
}
