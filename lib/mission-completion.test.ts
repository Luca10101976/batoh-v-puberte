import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { scoreTaskProgress, isMissionCompleted } from "./mission-completion.ts";

// R23/T1: server nikdy nesmí uložit skóre dodané klientem. Body vznikají výhradně
// z uzavřených úkolů v databázi. Tyto testy hlídají pravidlo i konkrétní exploit,
// kterým šlo po resetu opakovaného hraní získat plný počet bodů bez odpovědí.

const TASKS = ["t1", "t2", "t3", "t4"];
const ROOT = path.resolve(import.meta.dirname, "..");

test("dokončení bez jediné odpovědi nedá žádné body a není dokončením", () => {
  const r = scoreTaskProgress(TASKS, []);
  assert.equal(r.score, 0);
  assert.equal(r.missingTasks, 4);
  assert.equal(isMissionCompleted(r), false);
});

test("částečně vyřešená hra není dokončená", () => {
  const r = scoreTaskProgress(TASKS, [
    { task_id: "t1", status: "correct" },
    { task_id: "t2", status: "unknown" }
  ]);
  assert.equal(r.score, 10);
  assert.equal(r.missingTasks, 2);
  assert.equal(isMissionCompleted(r), false);
});

test("P4: všechny úkoly uzavřené jako Nevím = platné dokončení za nula bodů", () => {
  const r = scoreTaskProgress(TASKS, TASKS.map((task_id) => ({ task_id, status: "unknown" as const })));
  assert.equal(r.score, 0);
  assert.equal(r.maxScore, 40);
  assert.equal(r.missingPoints, 40);
  assert.equal(isMissionCompleted(r), true);
});

test("všechny úkoly správně = plný počet bodů a dokončení", () => {
  const r = scoreTaskProgress(TASKS, TASKS.map((task_id) => ({ task_id, status: "correct" as const })));
  assert.equal(r.score, 40);
  assert.equal(r.missingPoints, 0);
  assert.equal(isMissionCompleted(r), true);
});

test("špatná odpověď úkol neuzavírá", () => {
  const rows = TASKS.map((task_id) => ({ task_id, status: "correct" as const }));
  rows[3] = { task_id: "t4", status: "wrong" as unknown as "correct" };
  const r = scoreTaskProgress(TASKS, rows);
  assert.equal(r.missingTasks, 1);
  assert.equal(isMissionCompleted(r), false);
});

test("cizí úkoly z jiné hry se do výsledku nezapočítají", () => {
  const r = scoreTaskProgress(TASKS, [
    { task_id: "cizi-1", status: "correct" },
    { task_id: "cizi-2", status: "correct" },
    { task_id: "t1", status: "correct" }
  ]);
  assert.equal(r.score, 10);
  assert.equal(isMissionCompleted(r), false);
});

test("hra bez úkolů se nedá dokončit", () => {
  const r = scoreTaskProgress([], [{ task_id: "t1", status: "correct" }]);
  assert.equal(r.totalTasks, 0);
  assert.equal(r.maxScore, 0);
  assert.equal(isMissionCompleted(r), false);
});

test("dokončovací endpoint nečte skóre z klienta a vynucuje uzavřené úkoly", () => {
  const src = fs.readFileSync(path.join(ROOT, "app/api/game/complete-location/route.ts"), "utf8");
  assert.ok(!src.includes("computeMissionScore"), "mock scoring musí být pryč");
  assert.ok(!/=\s*body\.(unknownTaskIds|unknownCount|penaltyPoints)/.test(src), "klientské skóre se nesmí číst");
  assert.ok(!/new Date\(body\.completedAt\)/.test(src), "T7: čas dokončení nesmí určovat klient");
  assert.match(src, /mission_not_finished/, "P3: nedokončená hra musí být odmítnuta");
  assert.match(src, /outcome\.completedCodes\.includes/, "zapisují se jen skutečně dokončení hráči");
  const shared = fs.readFileSync(path.join(ROOT, "lib/game-completion.ts"), "utf8");
  assert.match(shared, /isMissionCompleted\(result\)/, "P3: kontrola uzavřených úkolů");
  assert.ok(!/body\.\w|request\.json/.test(shared), "dokončovací vrstva nesmí číst nic z požadavku");
});

test("jediná implementace bodování: task-validation deleguje na mission-completion", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/task-validation.ts"), "utf8");
  assert.match(src, /scoreTaskProgress\(await getLocationTaskIds\(locationId\), rows\)/);
});
