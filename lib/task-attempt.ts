import { MAX_TASK_ATTEMPTS, POINTS_PER_TASK } from "./game-rules.ts";

export { MAX_TASK_ATTEMPTS, POINTS_PER_TASK } from "./game-rules.ts";

export type TaskAttemptOutcome = {
  status: "correct" | "wrong" | "unknown";
  attempts: number;
  remainingAttempts: number;
  awardedPointsForTask: number;
};

export function resolveAnswerAttempt(args: {
  currentAttempts: number;
  isCorrect: boolean;
}): TaskAttemptOutcome {
  const currentAttempts = Math.max(0, args.currentAttempts);

  if (args.isCorrect) {
    const attempts = currentAttempts + 1;
    return {
      status: "correct",
      attempts: Math.min(attempts, MAX_TASK_ATTEMPTS),
      remainingAttempts: 0,
      awardedPointsForTask: POINTS_PER_TASK
    };
  }

  const attempts = Math.min(currentAttempts + 1, MAX_TASK_ATTEMPTS);
  if (attempts >= MAX_TASK_ATTEMPTS) {
    return {
      status: "unknown",
      attempts: MAX_TASK_ATTEMPTS,
      remainingAttempts: 0,
      awardedPointsForTask: 0
    };
  }

  return {
    status: "wrong",
    attempts,
    remainingAttempts: Math.max(0, MAX_TASK_ATTEMPTS - attempts),
    awardedPointsForTask: 0
  };
}
