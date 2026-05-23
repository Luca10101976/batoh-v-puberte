import { locations } from "./mock-data.ts";
import { POINTS_PER_TASK, getLocationMaxScore } from "./game-rules.ts";

export { getLocationMaxScore } from "./game-rules.ts";

type ScoreInput = {
  unknownTaskIds?: string[];
  unknownCount?: number;
  penaltyPoints?: number;
};

export type ComputedScore = {
  totalTasks: number;
  correctCount: number;
  unknownCount: number;
  maxScore: number;
  score: number;
  // Legacy DB compatibility: child_location_progress.penalty_points keeps
  // storing "lost points" (maxScore - score), even though the product/UI
  // now talks only in positive points for correct answers.
  missingPoints: number;
};

function toSafeInteger(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.floor(numeric));
}

export function getLocationTaskCount(locationId: string) {
  const location = locations.find((item) => item.id === locationId);
  const taskIds = new Set<string>();

  location?.episodes.forEach((episode) => {
    episode.tasks.forEach((task) => taskIds.add(task.id));
  });

  return taskIds.size;
}

export function computeMissionScore(locationId: string, input: ScoreInput): ComputedScore {
  const totalTasks = getLocationTaskCount(locationId);

  if (totalTasks <= 0) {
    return {
      totalTasks: 0,
      correctCount: 0,
      unknownCount: 0,
      maxScore: 0,
      score: 0,
      missingPoints: 0
    };
  }

  const location = locations.find((item) => item.id === locationId);
  const taskIds = new Set<string>();
  location?.episodes.forEach((episode) => {
    episode.tasks.forEach((task) => taskIds.add(task.id));
  });

  let unknownCount = 0;
  const rawUnknownTaskIds = Array.isArray(input.unknownTaskIds) ? input.unknownTaskIds : [];
  if (rawUnknownTaskIds.length > 0) {
    const validUnknownIds = new Set(
      rawUnknownTaskIds
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && taskIds.has(item))
    );

    unknownCount = validUnknownIds.size;
  } else if (typeof input.unknownCount === "number") {
    unknownCount = toSafeInteger(input.unknownCount);
  } else if (typeof input.penaltyPoints === "number") {
    // Legacy compatibility fallback: convert lost points back to unknown task count.
    unknownCount = toSafeInteger(input.penaltyPoints) / POINTS_PER_TASK;
    unknownCount = Math.floor(unknownCount);
  }

  unknownCount = Math.min(totalTasks, Math.max(0, unknownCount));
  const correctCount = Math.max(0, totalTasks - unknownCount);
  const maxScore = getLocationMaxScore(totalTasks);
  const score = correctCount * POINTS_PER_TASK;

  return {
    totalTasks,
    correctCount,
    unknownCount,
    maxScore,
    score,
    missingPoints: Math.max(0, maxScore - score)
  };
}
