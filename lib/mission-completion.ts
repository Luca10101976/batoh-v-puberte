import { POINTS_PER_TASK, getLocationMaxScore } from "./game-rules.ts";

// R23: JEDINÁ autoritativní definice výsledku hry pro jednoho hráče v jednom rozehrání.
//
// Čistá funkce bez databáze a bez klientského vstupu. Vstupem je seznam úkolů hry
// (z DB) a uzavřené výsledky úkolů daného hráče v dané výpravě (z DB).
//
// Pravidla podle produktových rozhodnutí:
//   P3 – hra je dokončená, jen když jsou uzavřené VŠECHNY úkoly hry
//        (správně, explicitní Nevím, nebo automatické Nevím po vyčerpání pokusů),
//   P4 – nula bodů je platné dokončení, když hráč všechny úkoly skutečně uzavřel,
//   T1 – skóre nikdy nevzniká z hodnoty poslané klientem.
//
// P6 (nápověda za poloviční body) se sem doplní v R25; datový model na to má místo
// ve výsledku úkolu, tato funkce se kvůli tomu nebude muset měnit tvarem.

export type MissionTaskStatus = "correct" | "wrong" | "unknown";

export type TaskProgressLike = {
  task_id: string;
  status: MissionTaskStatus;
};

export type MissionResult = {
  totalTasks: number;
  resolvedTasks: number;
  correctTasks: number;
  unknownTasks: number;
  missingTasks: number;
  maxScore: number;
  score: number;
  missingPoints: number;
};

export const EMPTY_MISSION_RESULT: MissionResult = {
  totalTasks: 0,
  resolvedTasks: 0,
  correctTasks: 0,
  unknownTasks: 0,
  missingTasks: 0,
  maxScore: 0,
  score: 0,
  missingPoints: 0
};

/** Výsledek hráče podle úkolů hry a jeho uzavřených odpovědí. Nic se nedopočítává. */
export function scoreTaskProgress(taskIds: string[], rows: TaskProgressLike[]): MissionResult {
  const totalTasks = taskIds.length;
  if (totalTasks === 0) {
    return EMPTY_MISSION_RESULT;
  }

  const validTaskIds = new Set(taskIds);
  const finalByTask = new Map<string, MissionTaskStatus>();
  rows.forEach((row) => {
    if (!validTaskIds.has(row.task_id)) {
      return;
    }
    finalByTask.set(row.task_id, row.status);
  });

  let resolvedTasks = 0;
  let correctTasks = 0;
  let unknownTasks = 0;
  for (const taskId of taskIds) {
    const status = finalByTask.get(taskId);
    if (status === "correct") {
      resolvedTasks += 1;
      correctTasks += 1;
      continue;
    }
    if (status === "unknown") {
      resolvedTasks += 1;
      unknownTasks += 1;
    }
  }

  const missingTasks = Math.max(0, totalTasks - resolvedTasks);
  const maxScore = getLocationMaxScore(totalTasks);
  const score = correctTasks * POINTS_PER_TASK;

  return {
    totalTasks,
    resolvedTasks,
    correctTasks,
    unknownTasks: unknownTasks + missingTasks,
    missingTasks,
    maxScore,
    score,
    missingPoints: Math.max(0, maxScore - score)
  };
}

/**
 * P3: smí se tento výsledek zapsat jako dokončení hry?
 * Hra bez úkolů se nedokončuje – jinak by šlo „dokončit“ prázdnou nebo nenačtenou hru.
 */
export function isMissionCompleted(result: MissionResult) {
  return result.totalTasks > 0 && result.missingTasks === 0;
}
