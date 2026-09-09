export const MAX_TASK_ATTEMPTS = 3;
export const POINTS_PER_TASK = 10;
/** R25: správná odpověď po otevření nápovědy má poloviční hodnotu. */
export const POINTS_PER_TASK_WITH_HINT = 5;

export function getLocationMaxScore(totalTasks: number) {
  return Math.max(0, totalTasks * POINTS_PER_TASK);
}

/**
 * R25: české skloňování zbývajících pokusů.
 * Dřív hráč viděl „Zbývá 2 pokus.“
 */
export function formatRemainingAttempts(remaining: number) {
  const value = Math.max(0, Math.floor(remaining));
  if (value === 0) {
    return "Další pokus už nemáš.";
  }
  if (value === 1) {
    return "Zbývá 1 pokus.";
  }
  if (value < 5) {
    return `Zbývají ${value} pokusy.`;
  }
  return `Zbývá ${value} pokusů.`;
}
