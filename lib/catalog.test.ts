import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCatalog,
  firstSentence,
  getCatalogCities,
  getCatalogEntriesForCity,
  resolveCatalogCity,
  resolveCatalogTeaser,
  resolveCatalogEntryForLocation,
  type CatalogMissionRow
} from "./catalog.ts";

const mission = (over: Partial<CatalogMissionRow> & { id: string }): CatalogMissionRow => ({
  title: `Hra ${over.id}`,
  city: "Praha",
  intro_text: "První věta intra. Druhá věta.",
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

const slugs: Record<string, string> = { klamovka: "klamovka" };
const resolve = (row: CatalogMissionRow) => slugs[row.id] ?? row.id;

test("unpublished mission se v katalogu nezobrazí, published ano", () => {
  const catalog = buildCatalog([mission({ id: "a", is_published: true }), mission({ id: "b", is_published: false }), mission({ id: "c", is_published: null })]);
  assert.deepEqual(catalog.map((e) => e.missionId), ["a"]);
});

test("město bez publikované hry se nezobrazí", () => {
  const catalog = buildCatalog([mission({ id: "a", city: "Praha" }), mission({ id: "b", city: "Brno", is_published: false })]);
  assert.deepEqual(getCatalogCities(catalog), ["Praha"]);
});

test("dvě publikované hry ve stejném městě se zobrazí obě", () => {
  const catalog = buildCatalog([mission({ id: "a", city: "Praha" }), mission({ id: "b", city: "Praha" })]);
  assert.equal(getCatalogEntriesForCity(catalog, "Praha").length, 2);
});

test("catalog_order určuje pořadí her v městě", () => {
  const catalog = buildCatalog([mission({ id: "x", catalog_order: 2, title: "A" }), mission({ id: "y", catalog_order: 1, title: "Z" }), mission({ id: "z", catalog_order: null, title: "M" })]);
  assert.deepEqual(catalog.map((e) => e.missionId), ["z", "y", "x"]);
});

test("při shodném catalog_order rozhodne název (cs)", () => {
  const catalog = buildCatalog([mission({ id: "1", title: "Šumava" }), mission({ id: "2", title: "Cheb" }), mission({ id: "3", title: "Beroun" }), mission({ id: "4", title: "Chrudim" })]);
  assert.deepEqual(catalog.map((e) => e.title), ["Beroun", "Cheb", "Chrudim", "Šumava"]);
});

test("města jsou abecedně (cs)", () => {
  const catalog = buildCatalog([mission({ id: "a", city: "Praha" }), mission({ id: "b", city: "České Budějovice" }), mission({ id: "c", city: "Brno" })]);
  assert.deepEqual(getCatalogCities(catalog), ["Brno", "České Budějovice", "Praha"]);
});

test("neplatné zapamatované město fallbackne na první dostupné; platné zůstane", () => {
  assert.equal(resolveCatalogCity("Ostrava", ["Brno", "Praha"]), "Brno");
  assert.equal(resolveCatalogCity("Praha", ["Brno", "Praha"]), "Praha");
  assert.equal(resolveCatalogCity("", ["Brno"]), "Brno");
  assert.equal(resolveCatalogCity("Praha", []), null);
});

test("short_description fallback: short_description → první věta intro_text → prázdné", () => {
  assert.equal(resolveCatalogTeaser({ short_description: "  Krátký popis  ", intro_text: "Intro. Další." }), "Krátký popis");
  assert.equal(resolveCatalogTeaser({ short_description: "", intro_text: "Park s hlavou koně. A peklem." }), "Park s hlavou koně.");
  assert.equal(resolveCatalogTeaser({ short_description: null, intro_text: "Bez tečky" }), "Bez tečky");
  assert.equal(resolveCatalogTeaser({ short_description: "", intro_text: "" }), "");
  assert.equal(firstSentence("Otázka? Odpověď."), "Otázka?");
});

test("unlock_after_mission_id se přenese jako locationId vyžadované hry (slug i UUID)", () => {
  const catalog = buildCatalog(
    [
      mission({ id: "klamovka", title: "Klamovka" }),
      mission({ id: "uuid-2", title: "Druhá", unlock_after_mission_id: "klamovka" }),
      mission({ id: "uuid-3", title: "Třetí", unlock_after_mission_id: "uuid-2" }),
      mission({ id: "uuid-4", title: "Čtvrtá", unlock_after_mission_id: "neexistuje" })
    ],
    resolve
  );
  const byId = Object.fromEntries(catalog.map((e) => [e.missionId, e]));
  assert.equal(byId.klamovka.locationId, "klamovka");
  assert.equal(byId.klamovka.unlockAfterLocationId, null);
  assert.equal(byId["uuid-2"].unlockAfterLocationId, "klamovka");
  assert.equal(byId["uuid-3"].unlockAfterLocationId, "uuid-2");
  assert.equal(byId["uuid-4"].unlockAfterLocationId, "neexistuje", "fail-closed: nevyhodnotitelná vazba zůstává nastavená (hra zamčená)");
});

test("nepublikovaná mise může být cílem zámku, ale sama se nezobrazí", () => {
  const catalog = buildCatalog([mission({ id: "hidden", is_published: false }), mission({ id: "open", unlock_after_mission_id: "hidden" })]);
  assert.deepEqual(catalog.map((e) => e.missionId), ["open"]);
  assert.equal(catalog[0].unlockAfterLocationId, "hidden");
});

test("karta bere DB hodnoty: hero (trim/null), obtížnost, délka, pořadí", () => {
  const [entry] = buildCatalog([mission({ id: "a", hero_image_url: "  https://x/y.jpg ", difficulty: "tezka", duration_min: 90, catalog_order: 3 })]);
  assert.equal(entry.heroImageUrl, "https://x/y.jpg");
  assert.equal(entry.difficulty, "tezka");
  assert.equal(entry.durationMin, 90);
  assert.equal(entry.catalogOrder, 3);
  const [empty] = buildCatalog([mission({ id: "b", hero_image_url: "   " })]);
  assert.equal(empty.heroImageUrl, null);
});

test("UUID alias mise s kanonickým slugem se rozpozná (zámek nejde obejít druhou URL)", () => {
  const catalog = buildCatalog([mission({ id: "c81ee324", title: "Budějovický kód" }), mission({ id: "uuid-only", title: "Nová hra" })], (row) => (row.id === "c81ee324" ? "budejovice-zaba" : row.id));
  assert.deepEqual(resolveCatalogEntryForLocation(catalog, "budejovice-zaba").isAlias, false);
  const alias = resolveCatalogEntryForLocation(catalog, "c81ee324");
  assert.equal(alias.isAlias, true);
  assert.equal(alias.entry?.locationId, "budejovice-zaba");
  assert.equal(resolveCatalogEntryForLocation(catalog, "uuid-only").isAlias, false, "DB-only hra bez slugu má UUID jako kanonické ID");
  assert.equal(resolveCatalogEntryForLocation(catalog, "nezname").entry, null);
});
