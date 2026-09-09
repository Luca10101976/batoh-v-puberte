export type ExistingCompletionRow = {
  penalty_points?: number | null;
  first_completed_at?: string | null;
  best_score?: number | null;
  status?: "in_progress" | "completed" | null;
};

export function deriveCompletionUpdate(args: {
  existing: ExistingCompletionRow | null;
  finalScore: number;
  finalMissingPoints: number;
  source: "gameplay" | "manual" | "expedition";
  hasExtendedProgressColumns?: boolean;
}) {
  const { existing, finalScore, finalMissingPoints, source, hasExtendedProgressColumns = true } = args;
  const gameplayUnlockEligible = source === "gameplay" || source === "expedition";
  const finalBestScore = Math.max(0, finalScore);

  if (!existing) {
    return {
      shouldInsert: true,
      shouldUpdate: false,
      firstCompletionTriggered: gameplayUnlockEligible,
      bestScoreUpdated: true,
      missingPointsUpdated: true,
      nextStatus: hasExtendedProgressColumns ? ("completed" as const) : null
    };
  }

  // R23: monotónnost („výsledek se nikdy nezhorší“) se smí porovnávat jen se
  // SKUTEČNÝM dřívějším dokončením. Rozehraný řádek má penalty_points ve výchozí
  // nule, což vypadalo jako bezchybný dřívější průchod, a skutečná ztráta bodů
  // se pak při prvním dokončení nezapsala.
  const previouslyCompleted = existing.status === "completed" || Boolean(existing.first_completed_at);
  const shouldImproveMissingPoints = !previouslyCompleted
    ? true
    : typeof existing.penalty_points === "number"
      ? existing.penalty_points > finalMissingPoints
      : hasExtendedProgressColumns;
  const shouldSetFirstCompleted = gameplayUnlockEligible && !existing.first_completed_at;
  const shouldFinalizeStatus = hasExtendedProgressColumns && existing.status !== "completed";
  const bestScoreUpdated = typeof existing.best_score !== "number" || existing.best_score < finalBestScore;
  const shouldUpdate = shouldImproveMissingPoints || shouldSetFirstCompleted || shouldFinalizeStatus || bestScoreUpdated;

  return {
    shouldInsert: false,
    shouldUpdate,
    firstCompletionTriggered: shouldSetFirstCompleted,
    bestScoreUpdated,
    missingPointsUpdated: shouldImproveMissingPoints,
    nextStatus: hasExtendedProgressColumns ? ("completed" as const) : null
  };
}
