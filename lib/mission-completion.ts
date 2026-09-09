import { POINTS_PER_TASK, POINTS_PER_TASK_WITH_HINT, getLocationMaxScore } from "./game-rules.ts";

// R23: JEDINÁ autoritativní definice výsledku hry pro jednoho hráče v jednom rozehrání.
//
// Čistá funkce bez databáze a bez klientského vstupu. Vstupem je seznam úkolů hry
// (z DB) a uzavřené výsledky úkolů daného hráče v dané výpravě (z DB).
//
// Pravidla podle produktových rozhodnutí:
//   P3 – hra je dokončená, jen když jsou uzavřené VŠECHNY úkoly hry
//        (správně, explicitní Nevím, nebo automatické Nevím po vyčerpání pokusů),
//   P4 – nula bodů je platné dokončení, když hráč všechny úkoly skutečně uzavřel,
//   T1 – skóre nikdy nevzniká z hodnoty poslané klientem,
//   R25/P6 – správná odpověď po otevřené nápovědě má poloviční hodnotu.

export type MissionTaskStatus = "correct" | "wrong" | "unknown";

export type TaskProgressLike = {
  task_id: string;
  status: MissionTaskStatus;
  /** R25: hráč u tohoto úkolu otevřel nápovědu, takže správná odpověď platí za polovinu. */
  hintUsed?: boolean;
};

/** R25: kolik bodů má uzavřený úkol. Bez nápovědy 10, s nápovědou 5, Nevím 0. */
export function pointsForTask(status: MissionTaskStatus | undefined, hintUsed: boolean) {
  if (status !== "correct") {
    return 0;
  }
  return hintUsed ? POINTS_PER_TASK_WITH_HINT : POINTS_PER_TASK;
}

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
  const finalByTask = new Map<string, TaskProgressLike>();
  rows.forEach((row) => {
    if (!validTaskIds.has(row.task_id)) {
      return;
    }
    finalByTask.set(row.task_id, row);
  });

  let resolvedTasks = 0;
  let correctTasks = 0;
  let unknownTasks = 0;
  let score = 0;
  for (const taskId of taskIds) {
    const row = finalByTask.get(taskId);
    const status = row?.status;
    if (status === "correct") {
      resolvedTasks += 1;
      correctTasks += 1;
      // R25: hodnota úkolu závisí na tom, jestli hráč otevřel nápovědu.
      score += pointsForTask(status, Boolean(row?.hintUsed));
      continue;
    }
    if (status === "unknown") {
      resolvedTasks += 1;
      unknownTasks += 1;
    }
  }

  const missingTasks = Math.max(0, totalTasks - resolvedTasks);
  const maxScore = getLocationMaxScore(totalTasks);

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
