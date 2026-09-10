import test from "node:test";
import assert from "node:assert/strict";
import { getUnlockRequirement, isLocationUnlockedByChain } from "./location-unlock.ts";
import type { MapLocation } from "./gameplay-types.ts";

const loc = (id: string, unlockedByPlaceId: string | null): MapLocation =>
  ({ id, unlockedByPlaceId, city: "Praha", name: id, unlocked: false } as unknown as MapLocation);

const klamovka = loc("klamovka", null);
const druha = loc("uuid-2", "klamovka");
const zavisla = loc("uuid-3", "uuid-hidden"); // vazba na hru, která v seznamu není
const all = [klamovka, druha, zavisla];

test("unlock: bez vazby = dostupná", () => {
  assert.equal(isLocationUnlockedByChain(klamovka, [], all), true);
});

test("unlock: platná vazba + prerequisite nedokončen = zamčená; dokončen = dostupná", () => {
  assert.equal(isLocationUnlockedByChain(druha, [], all), false);
  assert.equal(isLocationUnlockedByChain(druha, ["klamovka"], all), true);
});

test("unlock FAIL-CLOSED: nastavená, ale nevyhodnotitelná vazba = zamčená", () => {
  assert.equal(getUnlockRequirement(zavisla, all), null, "vyžadovaná hra není v seznamu");
  assert.equal(isLocationUnlockedByChain(zavisla, [], all), false);
  assert.equal(isLocationUnlockedByChain(zavisla, ["klamovka", "uuid-2"], all), false, "dokončení jiných her neodemyká");
  assert.equal(isLocationUnlockedByChain(zavisla, ["uuid-hidden"], all), true, "odemkne jen dokončení vyžadované hry");
});

test("unlock: defaultUnlocked = true má přednost (stávající chování mock her)", () => {
  assert.equal(isLocationUnlockedByChain(druha, [], all, true), true);
});
