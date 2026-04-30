import { locations } from "@/lib/mock-data";

export const UNKNOWN_PENALTY_POINTS = 15;

type ScoreInput = {
  unknownTaskIds?: string[];
  unknownCount?: number;
  penaltyPoints?: number;
};

export type ComputedScore = {
  totalTasks: number;
  unknownCount: number;
  penaltyPoints: number;
};

function toSafeInteger(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.floor(numeric));
}

export function computeMissionPenalty(locationId: string, input: ScoreInput): ComputedScore {
  const location = locations.find((item) => item.id === locationId);
  const taskIds = new Set<string>();

  location?.episodes.forEach((episode) => {
    episode.tasks.forEach((task) => taskIds.add(task.id));
  });

  const totalTasks = taskIds.size;
  if (totalTasks <= 0) {
    return {
      totalTasks: 0,
      unknownCount: 0,
      penaltyPoints: 0
    };
  }

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
    // Legacy compatibility fallback: convert old client payload to task-based unknown count.
    unknownCount = toSafeInteger(input.penaltyPoints) / UNKNOWN_PENALTY_POINTS;
    unknownCount = Math.floor(unknownCount);
  }

  unknownCount = Math.min(totalTasks, Math.max(0, unknownCount));

  return {
    totalTasks,
    unknownCount,
    penaltyPoints: unknownCount * UNKNOWN_PENALTY_POINTS
  };
}
