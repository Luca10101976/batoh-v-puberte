import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildLocationDetailModel } from "./location-detail-model.ts";

const base = {
  name: "Park Klamovka",
  subtitle: "Ztracený příběh Klamovky",
  image: "/images/klamovka-chramek.jpeg",
  shortDescription: "",
  teaser: "Klamovka má divokou historii začínající vinicemi Karla IV.",
  episodes: [{ name: "Chrámek noci a poznání" }, { name: "Cassel" }, { name: "Novogotický altán" }],
  unlockedByPlaceId: null,
  unlockRequirementName: null,
  unlocked: true,
  registered: true
};

test("dostupná hra: tlačítko Hrát, žádný štítek ODEMČENO", () => {
  const m = buildLocationDetailModel(base);
  assert.equal(m.primaryAction, "play");
  assert.equal(m.locked, false);
  assert.equal(m.lockMessage, null);
  assert.ok(!JSON.stringify(m).toLowerCase().includes("odemčeno"));
});

test("nepřihlášený hráč: „Přihlásit a hrát“, hra dostupná", () => {
  assert.equal(buildLocationDetailModel({ ...base, registered: false }).primaryAction, "login_and_play");
});

test("zamčená hra: nejde spustit a ukazuje prerequisite (skutečný název z katalogu)", () => {
  const m = buildLocationDetailModel({ ...base, unlocked: false, unlockedByPlaceId: "klamovka", unlockRequirementName: "Park Klamovka" });
  assert.equal(m.primaryAction, "locked");
  assert.equal(m.locked, true);
  assert.equal(m.lockMessage, "Nejdřív dokonči: Park Klamovka");
});

test("zamčená hra bez určitelného názvu prerequisite: fail-closed + obecný text", () => {
  const m = buildLocationDetailModel({ ...base, unlocked: false, unlockedByPlaceId: "neexistuje", unlockRequirementName: null });
  assert.equal(m.primaryAction, "locked");
  assert.equal(m.lockMessage, "Nejdřív dokonči: předchozí hru");
});

test("místo startu = název první zastávky (Klamovka i Budějovice)", () => {
  assert.equal(buildLocationDetailModel(base).startStopName, "Chrámek noci a poznání");
  assert.equal(buildLocationDetailModel({ ...base, episodes: [{ name: "Černá věž: první číslo" }] }).startStopName, "Černá věž: první číslo");
  assert.equal(buildLocationDetailModel({ ...base, episodes: [] }).startStopName, null);
});

test("popis: short_description má přednost, jinak fallback (první věta intro = teaser)", () => {
  assert.equal(buildLocationDetailModel({ ...base, shortDescription: "  Krátký lákavý popis  " }).description, "Krátký lákavý popis");
  assert.equal(buildLocationDetailModel(base).description, "Klamovka má divokou historii začínající vinicemi Karla IV.");
});

test("hero: Klamovka si drží stávající obrázek (fallback řeší server, model ho nemění)", () => {
  assert.equal(buildLocationDetailModel(base).image, "/images/klamovka-chramek.jpeg");
});

test("subtitle: název mise se ukáže jen když se liší od názvu a není generický", () => {
  assert.equal(buildLocationDetailModel(base).subtitle, "Ztracený příběh Klamovky");
  assert.equal(buildLocationDetailModel({ ...base, name: "Budějovický kód", subtitle: "Městská mise" }).subtitle, null);
  assert.equal(buildLocationDetailModel({ ...base, name: "X", subtitle: "X" }).subtitle, null);
});

test("model neobsahuje věk, délku, obtížnost, počty zastávek/úkolů, body ani čas", () => {
  const keys = Object.keys(buildLocationDetailModel(base));
  for (const forbidden of ["age", "duration", "difficulty", "stopCount", "taskCount", "points", "time", "episodes"]) {
    assert.ok(!keys.includes(forbidden), `model nesmí mít ${forbidden}`);
  }
});

test("komponenta detailu nerenderuje odstraněné údaje (guard nad zdrojem)", () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "../components/location-detail-screen.tsx"), "utf8");
  for (const forbidden of ["Zastavení ve hře", "formatTaskCount", "episodes.length", "episodes.map", "location.difficulty", "location.duration", "location.distance", "Odemčeno", "Dokončeno", " let", "Zastavení {", "a jedna stopa"]) {
    assert.ok(!src.includes(forbidden), `detail nesmí obsahovat „${forbidden}“`);
  }
  assert.ok(src.includes("Začínáme"), "detail musí ukazovat místo startu");
});
