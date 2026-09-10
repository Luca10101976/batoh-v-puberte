import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LEGACY_LOCATION_ID_BY_MISSION_ID, legacyLocationIdForMission, legacyMissionIdForLocation } from "./legacy-location-ids.ts";
import { loadPlayedGames } from "./played-games-server.ts";
import { POINTS_PER_TASK } from "./game-rules.ts";

// R38: databáze a Mozek jsou jediný zdroj herního obsahu.
//
// Testy hlídají dvě věci: že v produkčním kódu nezbyl žádný herní obsah, a že se
// při chybějících nebo nedostupných datech nesmí potichu použít stará verze hry.

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const code = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function walk(dir: string, files: string[] = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      walk(relative, files);
    } else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
}

const PRODUCTION_FILES = [...walk("app"), ...walk("components"), ...walk("lib"), ...walk("scripts")].filter(
  (file) => !file.endsWith(".test.ts")
);

// ---------------------------------------------------------------------------
// A. Obsah v kódu je pryč
// ---------------------------------------------------------------------------

test("A1 – soubory s herním obsahem v kódu neexistují", () => {
  for (const file of ["lib/mock-data.ts", "lib/task-answers.ts", "lib/scoring.ts", "lib/leaderboard-scoring.ts"]) {
    assert.ok(!fs.existsSync(path.join(ROOT, file)), `${file} pořád existuje`);
  }
});

test("A2 – žádný produkční soubor neimportuje obsah v kódu", () => {
  const offenders = PRODUCTION_FILES.filter((file) => /from ["'][^"']*mock-data/.test(code(file)));
  assert.deepEqual(offenders, [], `obsah v kódu importují: ${offenders.join(", ")}`);
});

test("A3 – nevznikl náhradní soubor se stejným obsahem", () => {
  const offenders = PRODUCTION_FILES.filter((file) => {
    const src = code(file);
    return /klamovka-chramek|klamovka-nebe-peklo|Klamovka zase vypráví|budejovice-zaba["']\s*[,:]/.test(src);
  });
  assert.deepEqual(offenders, [], `herní obsah zůstal v: ${offenders.join(", ")}`);
});

test("A3b – chybějící obrázek hry nenahradí fotka jiné hry", () => {
  const server = code("lib/gameplay-server.ts");
  assert.match(server, /NEUTRAL_GAME_IMAGE = "\/illustrations\/traki\//, "zástup musí být systémová ilustrace");
  assert.ok(!/\/images\/klamovka/.test(server));
  assert.ok(
    fs.existsSync(path.join(ROOT, "public/illustrations/traki/mapa.webp")),
    "neutrální ilustrace neexistuje"
  );
});

test("A4 – mrtvé bodování z kódu je pryč", () => {
  const offenders = PRODUCTION_FILES.filter((file) => /computeMissionScore|getLocationTaskCount/.test(code(file)));
  assert.deepEqual(offenders, []);
});

// ---------------------------------------------------------------------------
// B. Žádné tiché fallbacky
// ---------------------------------------------------------------------------

test("B1 – hra bez obsahu v databázi se prostě nezobrazí", () => {
  const server = code("lib/gameplay-server.ts");
  assert.ok(!/buildEpisodesFromMock/.test(server), "zůstal převod obsahu z kódu");
  assert.match(server, /if \(!mission \|\| !episodes\) \{\s*return null;/, "chybí kontrolované odmítnutí");
});

test("B2 – seznam publikovaných her nemá náhradní zdroj", () => {
  const server = code("lib/gameplay-server.ts");
  const fn = server.slice(server.indexOf("export async function getPublishedLocationIds"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.ok(!/catch/.test(body), "výpadek databáze pořád podává pevný seznam her");
  assert.match(body, /await getCatalog\(\)/);
});

test("B3 – úkol i seznam úkolů čte jen databáze", () => {
  const server = code("lib/gameplay-server.ts");
  for (const fnName of ["getGameplayTask", "getGameplayTaskIds"]) {
    const fn = server.slice(server.indexOf(`export async function ${fnName}`));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    assert.ok(!/sourceEpisodes|locations\.find/.test(body), `${fnName} pořád sahá do obsahu v kódu`);
    assert.match(body, /getGameplayEpisodes\(locationId\)/);
  }
});

test("B4 – závěr hry i katalogová pole berou jen databázi", () => {
  const server = code("lib/gameplay-server.ts");
  assert.ok(!/\|\| location\.endingTitle/.test(server));
  assert.ok(!/\|\| location\.teaser/.test(server));
  assert.ok(!/: location\.image/.test(server));
});

test("B5 – název vyžadované hry přichází z katalogu", () => {
  const server = code("lib/gameplay-server.ts");
  const fn = server.slice(server.indexOf("function resolveLocationDisplayName"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.match(body, /catalog\.find/);
  assert.ok(!/locations\.find/.test(body));
});

// ---------------------------------------------------------------------------
// C. Sitemap
// ---------------------------------------------------------------------------

test("C1 – sitemap se skládá z katalogu v databázi", () => {
  const sitemap = code("app/sitemap.ts");
  assert.match(sitemap, /getCatalog\(\)/);
  assert.ok(!/mock-data/.test(sitemap));
  // Nedostupný katalog znamená sitemap bez her, ne sitemap ze starého seznamu.
  assert.match(sitemap, /locationRoutes = \[\];/);
});

// ---------------------------------------------------------------------------
// D. Profil a historie
// ---------------------------------------------------------------------------

test("D1 – profil bere název, město i maximum hry ze serveru", () => {
  const profile = code("components/profile-screen.tsx");
  assert.ok(!/mock-data|getLocationTaskCount/.test(profile));
  assert.match(profile, /state\.playedGames\[locationId\]/);
  assert.match(profile, /publishedGamesCount/);

  const provider = code("components/app-state-provider.tsx");
  assert.ok(!/mock-data|getLocationTaskCount/.test(provider));
  assert.match(provider, /playedGames\[game\.locationId\]/);
});

test("D2 – maximum hry se počítá z úkolů v databázi", async () => {
  const admin = fakeAdmin({
    missions: [{ id: "mission-1", title: "Hra z Mozku", city: "Olomouc" }],
    stops: [
      { id: "s1", mission_id: "mission-1" },
      { id: "s2", mission_id: "mission-1" }
    ],
    tasks: [{ stop_id: "s1" }, { stop_id: "s1" }, { stop_id: "s2" }]
  });

  const games = await loadPlayedGames(admin, ["mission-1"]);
  assert.equal(games.length, 1);
  assert.equal(games[0].name, "Hra z Mozku");
  assert.equal(games[0].city, "Olomouc");
  assert.equal(games[0].maxScore, 3 * POINTS_PER_TASK);
});

test("D3 – historická hra se najde přes svůj slug", async () => {
  const missionId = Object.keys(LEGACY_LOCATION_ID_BY_MISSION_ID)[0];
  const slug = LEGACY_LOCATION_ID_BY_MISSION_ID[missionId];
  const admin = fakeAdmin({
    missions: [{ id: missionId, title: "Ztracený příběh Klamovky", city: "Praha" }],
    stops: [{ id: "s1", mission_id: missionId }],
    tasks: Array.from({ length: 19 }, () => ({ stop_id: "s1" }))
  });

  const games = await loadPlayedGames(admin, [slug]);
  assert.equal(games[0].locationId, slug, "historie hráče je vedená pod slugem");
  assert.equal(games[0].maxScore, 190, "Klamovka má v databázi 19 úkolů");
});

test("D4 – hra stažená z nabídky nezmizí z historie", () => {
  const server = code("lib/played-games-server.ts");
  assert.ok(!/is_published/.test(server), "historie by přišla o hru po odpublikování");
});

// ---------------------------------------------------------------------------
// E. Mozek bez bootstrapu
// ---------------------------------------------------------------------------

test("E1 – bootstrap z obsahu v kódu neexistuje", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "app/admin/missions/bootstrap.ts")));
  const actions = code("app/admin/missions/actions.ts");
  assert.ok(!/enableMozekEditingAction|bootstrapMozekContent/.test(actions));
  const page = code("app/admin/missions/page.tsx");
  assert.ok(!/getFallbackMissions|isUsingFallbackContent|mock-/.test(page), "přehled pořád nabízí obsah z kódu");
});

test("E2 – publikaci nejde obejít vytvořením historického obsahu", () => {
  const actions = code("app/admin/missions/actions.ts");
  // Jediné místo, kde vzniká hra, ji zakládá jako koncept.
  assert.match(actions, /is_published: false/);
  assert.equal((actions.match(/is_published: true/g) ?? []).length, 0);
});

// ---------------------------------------------------------------------------
// F. Co zůstává
// ---------------------------------------------------------------------------

test("F1 – historická mapa id zůstává funkční", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "lib/legacy-location-ids.ts")));
  assert.equal(legacyLocationIdForMission("70b31e6d-6a24-4e3a-a48e-dfbc3dbd2b43"), "klamovka");
  assert.equal(legacyMissionIdForLocation("klamovka"), "70b31e6d-6a24-4e3a-a48e-dfbc3dbd2b43");
  assert.equal(legacyMissionIdForLocation("hra-z-mozku"), null);
});

test("F2 – systémové ilustrace a tiskové assety zůstávají", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "public/illustrations/traki/batoh.webp")));
  assert.ok(fs.existsSync(path.join(ROOT, "assets/print/fonts/DejaVuSans.ttf")));
  assert.ok(fs.existsSync(path.join(ROOT, "lib/illustrations.ts")));
});

test("F3 – typ hry žije v neutrálním modulu", () => {
  const types = read("lib/gameplay-types.ts");
  assert.match(types, /export type MapLocation = \{/);
  assert.match(types, /episodes: GameplayEpisode\[\]/);
});

// ---------------------------------------------------------------------------
// G. Regrese ostatních bodů
// ---------------------------------------------------------------------------

test("G1 – R23–R27, R33 a R37 zůstávají beze změny", () => {
  assert.match(read("lib/game-rules.ts"), /POINTS_PER_TASK = 10/);
  assert.match(read("app/api/game/submit-task-answer/route.ts"), /resolveServerTaskAvailability\(/);
  assert.match(read("app/api/export/game-content/route.ts"), /"Content-Type": "application\/pdf"/);
  assert.match(read("lib/leaderboard-model.ts"), /entry\.score >= 1/);
  assert.match(read("lib/mission-publish-validation.ts"), /findMissionPublishBlockers/);
  assert.match(read("app/admin/cities/actions.ts"), /export async function createCityAction/);
});

test("G2 – tiskové PDF nemá herní obsah v kódu", () => {
  for (const file of ["lib/print-document.ts", "lib/print-pdf.ts", "app/api/export/game-content/route.ts"]) {
    assert.ok(!/mock-data/.test(code(file)), `${file} pořád zná obsah v kódu`);
  }
});

// ---------------------------------------------------------------------------
// Pomocná databáze pro testy
// ---------------------------------------------------------------------------

function fakeAdmin(data: {
  missions: Array<{ id: string; title: string; city: string }>;
  stops: Array<{ id: string; mission_id: string }>;
  tasks: Array<{ stop_id: string }>;
}) {
  return {
    from(table: string) {
      const rows =
        table === "missions" ? data.missions : table === "mission_stops" ? data.stops : (data.tasks as unknown[]);
      const query = {
        select() {
          return query;
        },
        in(column: string, values: string[]) {
          const filtered = (rows as Array<Record<string, unknown>>).filter((row) =>
            values.includes(String(row[column]))
          );
          return Promise.resolve({ data: filtered, error: null });
        }
      };
      return query;
    }
  };
}
