import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalog, type CatalogMissionRow } from "./catalog.ts";
import { resolveGameAccess } from "./game-access.ts";

const mission = (over: Partial<CatalogMissionRow> & { id: string }): CatalogMissionRow => ({
  title: `Hra ${over.id}`,
  city: "Praha",
  intro_text: "Intro.",
  short_description: "",
  hero_image_url: "",
  difficulty: "stredni",
  duration_min: 50,
  points: 120,
  catalog_order: 0,
  is_published: true,
  unlock_after_mission_id: null,
  ...over
});

const slugs: Record<string, string> = { klamovka: "klamovka", "budejovice-zaba": "budejovice-zaba" };
const resolve = (row: CatalogMissionRow) => slugs[row.id] ?? row.id;

// Praha: klamovka (bez podmínky) -> praha2 (po klamovce), praha3 (druhá startovní)
// České Budějovice: budejovice-zaba (vstupní, BEZ vazby na Prahu)
const rows = [
  mission({ id: "klamovka", title: "Ztracený příběh Klamovky" }),
  mission({ id: "praha2", title: "Druhá pražská", unlock_after_mission_id: "klamovka" }),
  mission({ id: "praha3", title: "Třetí pražská" }),
  mission({ id: "budejovice-zaba", title: "Budějovický kód", city: "České Budějovice" }),
  mission({ id: "skryta", title: "Nepublikovaná pražská", is_published: false }),
  mission({ id: "poSkryte", title: "Po nepublikované", unlock_after_mission_id: "skryta" }),
  mission({ id: "crossCity", title: "Budějovická po Klamovce", city: "České Budějovice", unlock_after_mission_id: "klamovka" }),
  mission({ id: "brokenLink", title: "Vazba na neexistující", unlock_after_mission_id: "neexistuje" })
];
const catalog = buildCatalog(rows, resolve);

test("hra bez prerequisite je herně dostupná", () => {
  assert.deepEqual(resolveGameAccess(catalog, "klamovka", []), { allowed: true, locationId: "klamovka" });
  assert.equal(resolveGameAccess(catalog, "praha3", []).allowed, true, "druhá startovní hra v Praze");
});

test("vstupní hra jiného města nevyžaduje postup z Prahy", () => {
  assert.equal(resolveGameAccess(catalog, "budejovice-zaba", []).allowed, true);
});

test("hra s prerequisite je zamčená, dokud hráč vyžadovanou hru nedokončí", () => {
  assert.deepEqual(resolveGameAccess(catalog, "praha2", []), { allowed: false, reason: "locked" });
  assert.deepEqual(resolveGameAccess(catalog, "praha2", ["praha3"]), { allowed: false, reason: "locked" });
  assert.equal(resolveGameAccess(catalog, "praha2", ["klamovka"]).allowed, true);
});

test("cross-city vazba je neplatná: hra zůstane zamčená i po dokončení cizí hry", () => {
  assert.deepEqual(resolveGameAccess(catalog, "crossCity", ["klamovka"]), {
    allowed: false,
    reason: "prerequisite_invalid"
  });
});

test("vazba na neexistující nebo nepublikovanou hru = zamčeno (fail-closed)", () => {
  assert.deepEqual(resolveGameAccess(catalog, "brokenLink", ["klamovka"]), {
    allowed: false,
    reason: "prerequisite_invalid"
  });
  assert.deepEqual(resolveGameAccess(catalog, "poSkryte", ["skryta"]), {
    allowed: false,
    reason: "prerequisite_invalid"
  });
});

test("nepublikovaná hra i neznámé ID = not_published", () => {
  assert.deepEqual(resolveGameAccess(catalog, "skryta", []), { allowed: false, reason: "not_published" });
  assert.deepEqual(resolveGameAccess(catalog, "neznama", []), { allowed: false, reason: "not_published" });
  assert.deepEqual(resolveGameAccess(catalog, "", []), { allowed: false, reason: "not_published" });
  assert.deepEqual(resolveGameAccess([], "klamovka", []), { allowed: false, reason: "not_published" });
});

test("UUID alias hry s kanonickým slugem neobejde zámek", () => {
  const aliasCatalog = buildCatalog(
    [mission({ id: "klamovka" }), mission({ id: "praha2", unlock_after_mission_id: "klamovka" })],
    resolve
  );
  assert.deepEqual(resolveGameAccess(aliasCatalog, "praha2", []), { allowed: false, reason: "locked" });
  // stejná mise pod svým UUID (alias) se vůbec nesmí chytit
  const withUuid = buildCatalog([mission({ id: "uuid-1", title: "Ztracený příběh Klamovky" })], (row) =>
    row.title === "Ztracený příběh Klamovky" ? "klamovka" : row.id
  );
  assert.deepEqual(resolveGameAccess(withUuid, "uuid-1", []), { allowed: false, reason: "not_published" });
  assert.equal(resolveGameAccess(withUuid, "klamovka", []).allowed, true);
});

test("katalog označí neplatnou vazbu příznakem", () => {
  const byId = Object.fromEntries(catalog.map((e) => [e.missionId, e]));
  assert.equal(byId.praha2.unlockPrerequisiteInvalid, false);
  assert.equal(byId.crossCity.unlockPrerequisiteInvalid, true);
  assert.equal(byId.brokenLink.unlockPrerequisiteInvalid, true);
  assert.equal(byId.poSkryte.unlockPrerequisiteInvalid, false, "stejné město, jen nepublikovaná – řeší až přístup");
  assert.equal(byId.klamovka.unlockPrerequisiteInvalid, false);
});
