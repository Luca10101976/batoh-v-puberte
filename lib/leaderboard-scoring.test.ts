import test from "node:test";
import assert from "node:assert/strict";
import { scoreRowsByProfile } from "./leaderboard-scoring.ts";

test("in-progress row does not grant 120 points in leaderboard", () => {
  const scoreMap = scoreRowsByProfile([
    {
      profile_code: "BAT-TEST",
      location_id: "klamovka",
      status: "in_progress",
      completed_at: "2026-05-22T10:00:00.000Z",
      penalty_points: 0
    }
  ]);

  assert.equal(scoreMap.get("BAT-TEST"), undefined);
});

test("completed row grants score for finished game", () => {
  const scoreMap = scoreRowsByProfile([
    {
      profile_code: "BAT-TEST",
      location_id: "klamovka",
      status: "completed",
      completed_at: "2026-05-22T10:00:00.000Z",
      first_completed_at: "2026-05-22T10:00:00.000Z",
      penalty_points: 10,
      best_score: 170
    }
  ]);

  assert.equal(scoreMap.get("BAT-TEST")?.score, 170);
  assert.equal(scoreMap.get("BAT-TEST")?.locations.size, 1);
});

test("replay row still counts historical best completion only once", () => {
  const scoreMap = scoreRowsByProfile([
    {
      profile_code: "BAT-TEST",
      location_id: "klamovka",
      status: "completed",
      completed_at: "2026-05-20T10:00:00.000Z",
      first_completed_at: "2026-05-20T10:00:00.000Z",
      penalty_points: 10,
      best_score: 170
    },
    {
      profile_code: "BAT-TEST",
      location_id: "klamovka",
      status: "in_progress",
      completed_at: "2026-05-22T10:00:00.000Z",
      first_completed_at: "2026-05-20T10:00:00.000Z",
      penalty_points: 0,
      best_score: 180
    }
  ]);

  assert.equal(scoreMap.get("BAT-TEST")?.score, 170);
  assert.equal(scoreMap.get("BAT-TEST")?.locations.size, 1);
});
