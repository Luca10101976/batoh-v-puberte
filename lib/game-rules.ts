export const MAX_TASK_ATTEMPTS = 3;
export const POINTS_PER_TASK = 10;

export function getLocationMaxScore(totalTasks: number) {
  return Math.max(0, totalTasks * POINTS_PER_TASK);
}
