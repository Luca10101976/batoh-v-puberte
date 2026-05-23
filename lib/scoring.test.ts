import test from "node:test";
import assert from "node:assert/strict";
import { computeMissionScore, getLocationMaxScore, getLocationTaskCount } from "./scoring.ts";

test("game with four tasks has maximum 40 points", () => {
  assert.equal(getLocationMaxScore(4), 40);
});

test("game with twelve tasks has maximum 120 points", () => {
  assert.equal(getLocationMaxScore(12), 120);
});

test("nevim gives zero points for the task and lowers final score accordingly", () => {
  const totalTasks = getLocationTaskCount("klamovka");
  const result = computeMissionScore("klamovka", {
    unknownCount: 1
  });

  assert.equal(result.maxScore, getLocationMaxScore(totalTasks));
  assert.equal(result.score, getLocationMaxScore(totalTasks) - 10);
  assert.equal(result.unknownCount, 1);
  assert.equal(result.missingPoints, 10);
});
