// R23/R25: tenká vrstva nad herními daty. Pravidlo správnosti bydlí v lib/answer-matching.ts,
// bodování v lib/mission-completion.ts. Tady zůstává jen napojení na databázi.
import { scoreTaskProgress, type MissionTaskStatus, type TaskProgressLike } from "@/lib/mission-completion";
import { getGameplayTask, getGameplayTaskIds } from "@/lib/gameplay-server";
import { isTaskAnswerCorrect } from "@/lib/answer-matching";

export type { MissionTaskStatus, TaskProgressLike };

export async function getTaskByLocationAndId(locationId: string, taskId: string) {
  return getGameplayTask(locationId, taskId);
}

export async function getLocationTaskIds(locationId: string) {
  return getGameplayTaskIds(locationId);
}

export { isTaskAnswerCorrect };

export async function isAnswerCorrect(locationId: string, taskId: string, answer: string) {
  const task = await getGameplayTask(locationId, taskId);
  return isTaskAnswerCorrect(task, answer);
}

export async function computeScoreFromTaskProgress(locationId: string, rows: TaskProgressLike[]) {
  // R23/T4: jediná implementace bodování – lib/mission-completion.ts. Tady se jen
  // doplní seznam úkolů hry z databáze.
  return scoreTaskProgress(await getLocationTaskIds(locationId), rows);
}
