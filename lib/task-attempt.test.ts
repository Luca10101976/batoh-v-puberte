import test from "node:test";
import assert from "node:assert/strict";
import { resolveAnswerAttempt, MAX_TASK_ATTEMPTS, POINTS_PER_TASK } from "./task-attempt.ts";

test("three wrong answers create unknown with zero awarded points", () => {
  const first = resolveAnswerAttempt({ currentAttempts: 0, isCorrect: false });
  const second = resolveAnswerAttempt({ currentAttempts: first.attempts, isCorrect: false });
  const third = resolveAnswerAttempt({ currentAttempts: second.attempts, isCorrect: false });

  assert.equal(MAX_TASK_ATTEMPTS, 3);
  assert.equal(third.status, "unknown");
  assert.equal(third.attempts, 3);
  assert.equal(third.remainingAttempts, 0);
  assert.equal(third.awardedPointsForTask, 0);
});

test("correct answer gives ten points for the task", () => {
  const result = resolveAnswerAttempt({ currentAttempts: 0, isCorrect: true });

  assert.equal(result.status, "correct");
  assert.equal(result.awardedPointsForTask, POINTS_PER_TASK);
  assert.equal(POINTS_PER_TASK, 10);
});
