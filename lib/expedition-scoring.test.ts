import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskProgressFromClientInput } from "./expedition-scoring.ts";

const TASKS = ["t1", "t2", "t3", "t4"];

test("bez údajů z klienta jsou všechny DB úkoly správně", () => {
  const rows = buildTaskProgressFromClientInput(TASKS, {}, 10);
  assert.deepEqual(rows.map((r) => r.status), ["correct", "correct", "correct", "correct"]);
});

test("unknownTaskIds označí jen skutečné úkoly hry, cizí ID se ignorují", () => {
  const rows = buildTaskProgressFromClientInput(TASKS, { unknownTaskIds: ["t2", " t4 ", "cizi", 7] }, 10);
  assert.deepEqual(rows.filter((r) => r.status === "unknown").map((r) => r.task_id), ["t2", "t4"]);
});

test("unknownCount označí prvních N úkolů, omezeno počtem úkolů", () => {
  assert.equal(buildTaskProgressFromClientInput(TASKS, { unknownCount: 3 }, 10).filter((r) => r.status === "unknown").length, 3);
  assert.equal(buildTaskProgressFromClientInput(TASKS, { unknownCount: 99 }, 10).filter((r) => r.status === "unknown").length, 4);
});

test("legacy penaltyPoints se přepočtou na počet úkolů", () => {
  assert.equal(buildTaskProgressFromClientInput(TASKS, { penaltyPoints: 25 }, 10).filter((r) => r.status === "unknown").length, 2);
});

test("hra bez úkolů v DB dává prázdný postup (žádné body z mocku)", () => {
  assert.deepEqual(buildTaskProgressFromClientInput([], { unknownTaskIds: ["t1"] }, 10), []);
});
