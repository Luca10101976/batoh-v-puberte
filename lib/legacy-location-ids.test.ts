import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildCatalog, resolveCatalogEntryForLocation, type CatalogMissionRow } from "./catalog.ts";
import { resolveGameAccess } from "./game-access.ts";
import { hasHistoricalLocationCompletion } from "./location-progress-state.ts";
import {
  LEGACY_LOCATION_ID_BY_MISSION_ID,
  legacyLocationIdForMission,
  legacyMissionIdForLocation,
  resolveMissionIdForLocation
} from "./legacy-location-ids.ts";

// Oprava před R23 (audit problém A): identita historické hry stojí na UUID mise,
// ne na dvojici město + název. Stejný resolver používá getCatalog() v gameplay-server.

const KLAMOVKA_ID = "70b31e6d-6a24-4e3a-a48e-dfbc3dbd2b43";
const BUDEJOVICE_ID = "c81ee324-c315-41db-9777-b43c96759dee";
const NEW_GAME_ID = "11111111-2222-4333-8444-555555555555";

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
const resolve = (row: CatalogMissionRow) => legacyLocationIdForMission(row.id) ?? row.id;

test("legacy mapa obsahuje obě historické hry a je obousměrná", () => {
  assert.deepEqual(LEGACY_LOCATION_ID_BY_MISSION_ID, { [KLAMOVKA_ID]: "klamovka", [BUDEJOVICE_ID]: "budejovice-zaba" });
  assert.equal(legacyLocationIdForMission(KLAMOVKA_ID), "klamovka");
  assert.equal(legacyMissionIdForLocation("klamovka"), KLAMOVKA_ID);
  assert.equal(legacyMissionIdForLocation("budejovice-zaba"), BUDEJOVICE_ID);
  assert.equal(resolveMissionIdForLocation("klamovka"), KLAMOVKA_ID);
  assert.equal(resolveMissionIdForLocation(NEW_GAME_ID), NEW_GAME_ID);
  assert.equal(legacyLocationIdForMission(NEW_GAME_ID), null);
  assert.equal(legacyMissionIdForLocation(""), null);
});

test("přejmenování title Klamovky nemění locationId", () => {
  const before = buildCatalog([mission({ id: KLAMOVKA_ID, title: "Ztracený příběh Klamovky" })], resolve);
  const after = buildCatalog([mission({ id: KLAMOVKA_ID, title: "Úplně nový název hry" })], resolve);
  assert.equal(before[0].locationId, "klamovka");
  assert.equal(after[0].locationId, "klamovka");
  assert.equal(after[0].title, "Úplně nový název hry");
});

test("změna city Klamovky nemění locationId", () => {
  const catalog = buildCatalog([mission({ id: KLAMOVKA_ID, city: "Praha 5 – Smíchov", title: "Jiný název" })], resolve);
  assert.equal(catalog[0].locationId, "klamovka");
  assert.equal(catalog[0].city, "Praha 5 – Smíchov");
});

test("DB-only mise bez legacy mapování má locationId = UUID mise", () => {
  const catalog = buildCatalog([mission({ id: NEW_GAME_ID, title: "Ztracený příběh Klamovky", city: "Praha" })], resolve);
  // ani shodný název a město s Klamovkou nesmí ukrást její identitu
  assert.equal(catalog[0].locationId, NEW_GAME_ID);
});

test("přímý UUID alias Klamovky není alternativní veřejná cesta", () => {
  const catalog = buildCatalog([mission({ id: KLAMOVKA_ID, title: "Přejmenováno" })], resolve);
  assert.deepEqual(resolveCatalogEntryForLocation(catalog, "klamovka").isAlias, false);
  assert.equal(resolveCatalogEntryForLocation(catalog, KLAMOVKA_ID).isAlias, true);
  assert.equal(resolveGameAccess(catalog, KLAMOVKA_ID, ["klamovka"]).allowed, false);
  assert.equal(resolveGameAccess(catalog, "klamovka", []).allowed, true);
});

test("existující progress pod `klamovka` zůstává použitelný po změně title i city", () => {
  // Produkční řádky child_location_progress jsou klíčované location_id = "klamovka".
  const progressRows = [{ location_id: "klamovka", status: "completed" as const, first_completed_at: "2026-09-01T10:00:00Z", completed_at: null }];
  const completed = progressRows.filter((row) => hasHistoricalLocationCompletion(row)).map((row) => row.location_id);
  const catalog = buildCatalog(
    [
      mission({ id: KLAMOVKA_ID, title: "Nový název", city: "Praha" }),
      mission({ id: BUDEJOVICE_ID, title: "Nový název Budějovic", city: "Praha", unlock_after_mission_id: KLAMOVKA_ID })
    ],
    resolve
  );
  const klamovka = catalog.find((entry) => entry.missionId === KLAMOVKA_ID)!;
  assert.equal(klamovka.locationId, "klamovka");
  assert.ok(completed.includes(klamovka.locationId), "dokončení se stále páruje s katalogovou identitou");
});

test("dokončení Klamovky se po změně title stále započítá pro prerequisite", () => {
  const catalog = buildCatalog(
    [
      mission({ id: KLAMOVKA_ID, title: "Přejmenovaná Klamovka", city: "Praha" }),
      mission({ id: NEW_GAME_ID, title: "Nová pražská hra", city: "Praha", unlock_after_mission_id: KLAMOVKA_ID })
    ],
    resolve
  );
  const newGame = catalog.find((entry) => entry.missionId === NEW_GAME_ID)!;
  assert.equal(newGame.unlockAfterLocationId, "klamovka");
  assert.equal(newGame.unlockPrerequisiteInvalid, false);
  assert.deepEqual(resolveGameAccess(catalog, NEW_GAME_ID, []), { allowed: false, reason: "locked" });
  assert.deepEqual(resolveGameAccess(catalog, NEW_GAME_ID, ["klamovka"]), { allowed: true, locationId: NEW_GAME_ID });
});

test("gameplay-server už neodvozuje identitu historické hry z city + title", () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, "gameplay-server.ts"), "utf8");
  assert.ok(!src.includes("fetchPublishedMissionByCanonical"), "mrtvá cesta podle city+title musí být pryč");
  assert.ok(!src.includes("canonicalSlugByKey"), "mapa město::název musí být pryč");
  assert.ok(!/\.eq\("title"/.test(src), "mise se nesmí hledat podle title");
  assert.ok(!/toLowerCase\(\)\}::/.test(src), "klíč město::název musí být pryč");
  assert.match(src, /return legacyLocationIdForMission\(row\.id\) \?\? row\.id;/);
  assert.match(src, /legacyMissionIdForLocation\(locationId\)/);
});
