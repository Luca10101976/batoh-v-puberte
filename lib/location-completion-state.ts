export type ExistingCompletionRow = {
  penalty_points?: number | null;
  first_completed_at?: string | null;
  best_score?: number | null;
  status?: "in_progress" | "completed" | null;
};

export function deriveCompletionUpdate(args: {
  existing: ExistingCompletionRow | null;
  finalPenalty: number;
  source: "gameplay" | "manual" | "expedition";
  hasExtendedProgressColumns?: boolean;
}) {
  const { existing, finalPenalty, source, hasExtendedProgressColumns = true } = args;
  const gameplayUnlockEligible = source === "gameplay" || source === "expedition";
  const finalBestScore = Math.max(0, 120 - Math.max(0, finalPenalty));

  if (!existing) {
    return {
      shouldInsert: true,
      shouldUpdate: false,
      firstCompletionTriggered: gameplayUnlockEligible,
      bestScoreUpdated: true,
      nextStatus: hasExtendedProgressColumns ? ("completed" as const) : null
    };
  }

  const shouldImprovePenalty =
    typeof existing.penalty_points === "number" ? existing.penalty_points > finalPenalty : hasExtendedProgressColumns;
  const shouldSetFirstCompleted = gameplayUnlockEligible && !existing.first_completed_at;
  const shouldFinalizeStatus = hasExtendedProgressColumns && existing.status !== "completed";
  const bestScoreUpdated = typeof existing.best_score !== "number" || existing.best_score < finalBestScore;
  const shouldUpdate = shouldImprovePenalty || shouldSetFirstCompleted || shouldFinalizeStatus;

  return {
    shouldInsert: false,
    shouldUpdate,
    firstCompletionTriggered: shouldSetFirstCompleted,
    bestScoreUpdated,
    nextStatus: hasExtendedProgressColumns ? ("completed" as const) : null
  };
}
