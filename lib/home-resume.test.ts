import test from "node:test";
import assert from "node:assert/strict";
import { buildResumeMissionCard, pickLatestActiveMission } from "./home-resume.ts";

const sampleLocation = {
  id: "klamovka",
  name: "Park Klamovka",
  episodes: [
    {
      name: "Chrámek noci a poznání",
      tasks: [
        { id: "t1", title: "Hadí hlavy" },
        { id: "t2", title: "Hvězdy v nebi" }
      ]
    },
    {
      name: "Cassel",
      tasks: [
        { id: "t3", title: "Splašily se a utekly" },
        { id: "t4", title: "Kolik mu mohlo být" }
      ]
    }
  ]
};

test("když neexistuje rozehraná mise, blok Pokračovat se nevytvoří", () => {
  const card = buildResumeMissionCard(sampleLocation, {
    location: { status: null },
    task_progress: []
  });

  assert.equal(card, null);
});

test("když existuje jedna rozehraná mise, blok se zobrazí s jejím názvem", () => {
  const card = buildResumeMissionCard(sampleLocation, {
    location: { status: "in_progress" },
    task_progress: [{ task_id: "t1", status: "correct", attempts: 1 }]
  });

  assert.ok(card);
  assert.equal(card.missionName, "Park Klamovka");
  assert.equal(card.stopName, "Chrámek noci a poznání");
  assert.equal(card.taskLabel, "Hvězdy v nebi");
  assert.equal(card.href, "/play/klamovka?episode=1&task=2");
});

test("když existují dvě rozehrané mise, vybere se ta naposledy aktivní", () => {
  const activeMission = pickLatestActiveMission([
    {
      location_id: "klamovka",
      status: "in_progress",
      completed_at: "2026-05-20T10:00:00.000Z",
      updated_at: "2026-05-20T10:30:00.000Z"
    },
    {
      location_id: "budejovice-zaba",
      status: "in_progress",
      completed_at: "2026-05-20T09:00:00.000Z",
      updated_at: "2026-05-20T12:00:00.000Z"
    }
  ]);

  assert.deepEqual(activeMission, {
    locationId: "budejovice-zaba",
    updatedAt: "2026-05-20T12:00:00.000Z"
  });
});

test("CTA Pokračovat vede na přesný rozehraný krok hry", () => {
  const card = buildResumeMissionCard(sampleLocation, {
    location: { status: "in_progress" },
    task_progress: [{ task_id: "t1", status: "correct", attempts: 1 }]
  });

  assert.ok(card);
  assert.equal(card.href, "/play/klamovka?episode=1&task=2");
});
