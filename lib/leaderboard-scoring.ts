import { getLocationMaxScore, getLocationTaskCount } from "./scoring.ts";

export type LeaderboardProgressRow = {
  profile_code: string;
  location_id: string;
  penalty_points?: number | null;
  best_score?: number | null;
  first_completed_at?: string | null;
  completed_at?: string | null;
  status?: "in_progress" | "completed" | null;
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function hasHistoricalLocationCompletion(row: LeaderboardProgressRow) {
  if (row.status === "completed") {
    return true;
  }

  return typeof row.first_completed_at === "string" && row.first_completed_at.trim().length > 0;
}

export function scoreRowsByProfile(rows: LeaderboardProgressRow[]) {
  const map = new Map<string, { locations: Set<string>; score: number }>();

  rows.forEach((row) => {
    if (!hasHistoricalLocationCompletion(row)) {
      return;
    }

    const code = normalizeCode(row.profile_code);
    if (!map.has(code)) {
      map.set(code, { locations: new Set<string>(), score: 0 });
    }

    const entry = map.get(code);
    if (!entry) {
      return;
    }
    if (entry.locations.has(row.location_id)) {
      return;
    }

    entry.locations.add(row.location_id);
    const explicitBestScore = Number(row.best_score);
    if (Number.isFinite(explicitBestScore) && explicitBestScore >= 0) {
      entry.score += explicitBestScore;
      return;
    }

    const maxScore = getLocationMaxScore(getLocationTaskCount(row.location_id));
    const missingPoints = Math.max(0, Number(row.penalty_points) || 0);
    entry.score += Math.max(0, maxScore - missingPoints);
  });

  return map;
}
