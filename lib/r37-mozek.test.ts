import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CITY_NAME_MAX_LENGTH,
  cityCoordinates,
  cityLocative,
  slugifyCityName,
  validateCity,
  FALLBACK_CITY_COORDINATES
} from "./cities.ts";
import {
  describeUsage,
  guardContentDelete,
  guardMissionDelete,
  guardReorder,
  isMissionUsed,
  type MissionUsage
} from "./mission-usage.ts";
import { findMissionPublishBlockers, type PublishStopInput } from "./mission-publish-validation.ts";
import { planImageProcessing, processedFileName, MAX_IMAGE_EDGE } from "./image-processing.ts";
import { totalsByProfile, maxScoreForTaskCount } from "./leaderboard-model.ts";

// R37: Mozek jako plnohodnotná administrace.
//
// Testy hlídají schválená produktová pravidla: město je entita, publikovat jde
// jen kompletní hru a jedinou cestou, jednou získané body přežijí odpublikování,
// hraná hra se nedá rozbít a náhled nesmí sáhnout na gameplay.

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const code = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const MIGRATION = "supabase/migrations/20260910163000_r37_cities_and_content_admin.sql";

const NO_USAGE: MissionUsage = { activeRuns: 0, playersWithResult: 0, answers: 0 };

// ---------------------------------------------------------------------------
// A. Města
// ---------------------------------------------------------------------------

test("A1 – identifikátor města vzniká bez diakritiky a mezer", () => {
  assert.equal(slugifyCityName("České Budějovice"), "ceske-budejovice");
  assert.equal(slugifyCityName("Praha"), "praha");
  assert.equal(slugifyCityName("  Ústí nad Labem  "), "usti-nad-labem");
  assert.equal(slugifyCityName("Žďár nad Sázavou"), "zdar-nad-sazavou");
});

test("A2 – formulář města hlídá název, pořadí i souřadnice", () => {
  assert.equal(validateCity({ name: "A" }).ok, false);
  assert.equal(validateCity({ name: "x".repeat(CITY_NAME_MAX_LENGTH + 1) }).ok, false);

  const ok = validateCity({ name: "Olomouc", nameLocative: "Olomouci", displayOrder: "2", lat: "49,5938", lng: "17.2509" });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.slug, "olomouc");
    assert.equal(ok.value.displayOrder, 2);
    assert.equal(ok.value.lat, 49.5938);
    assert.equal(ok.value.lng, 17.2509);
    assert.equal(ok.value.isActive, true);
  }

  const badLat = validateCity({ name: "Olomouc", lat: "300" });
  assert.equal(badLat.ok, false);
});

test("A3 – skloňování a souřadnice mají rozumnou zálohu", () => {
  assert.equal(cityLocative({ name: "Praha", nameLocative: "Praze" }), "Praze");
  assert.equal(cityLocative({ name: "Olomouc", nameLocative: "" }), "Olomouc");
  assert.deepEqual(cityCoordinates({ lat: 1, lng: 2 }), { lat: 1, lng: 2 });
  assert.deepEqual(cityCoordinates(null), FALLBACK_CITY_COORDINATES);
});

test("A4 – nové město nezávisí na obsahu v kódu", () => {
  const server = code("lib/gameplay-server.ts");
  assert.ok(!/getCityAnchor/.test(server), "poloha města se pořád hledá v obsahu v kódu");
  assert.match(server, /resolveCityMeta\(/);
  assert.match(server, /loadCityMap\(/);
  const home = code("components/home-screen.tsx");
  assert.match(home, /cityLocative\(state\.city, cityLocatives\)/, "skloňování se nebere z databáze");
});

test("A5 – město se spravuje v Mozku", () => {
  for (const file of [
    "app/admin/cities/page.tsx",
    "app/admin/cities/new/page.tsx",
    "app/admin/cities/[id]/page.tsx",
    "app/admin/cities/actions.ts",
    "app/mozek/cities/page.tsx",
    "components/admin/city-form.tsx"
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `chybí ${file}`);
  }
  const actions = read("app/admin/cities/actions.ts");
  for (const fn of ["createCityAction", "updateCityAction", "toggleCityActiveAction", "deleteCityAction"]) {
    assert.match(actions, new RegExp(`export async function ${fn}`), `chybí akce ${fn}`);
  }
  // Přejmenování města musí srovnat i názvy u jeho her.
  assert.match(actions, /from\("missions"\)\s*\.update\(\{ city: parsed\.value\.name \}\)/);
  // Město s hrami se nemaže, jen vypíná.
  assert.match(actions, /status=city_has_missions/);
});

// ---------------------------------------------------------------------------
// B. Publikace
// ---------------------------------------------------------------------------

function stops(): PublishStopInput[] {
  return [
    {
      id: "s1",
      title: "Zastávka",
      order: 1,
      tasks: [
        {
          id: "t1",
          stopTitle: "Zastávka",
          taskOrder: 1,
          type: "otevrena",
          question: "Kolik?",
          correctAnswer: "Tři",
          options: []
        }
      ]
    }
  ];
}

const COMPLETE_MISSION = {
  id: "m1",
  title: "Hra",
  city: "Olomouc",
  heroImageUrl: "https://example.test/hero.jpg",
  endingTitle: "Konec",
  endingText: "Text konce",
  unlockAfterMissionId: null
};

test("B1 – kompletní hra projde publikací", () => {
  assert.deepEqual(findMissionPublishBlockers({ mission: COMPLETE_MISSION, stops: stops() }), []);
});

test("B2 – bez titulního obrázku a bez závěru publikovat nejde", () => {
  const issues = findMissionPublishBlockers({
    mission: { ...COMPLETE_MISSION, heroImageUrl: "", endingTitle: "", endingText: "" },
    stops: stops()
  });
  assert.ok(issues.some((issue) => issue.code === "missing_hero_image"));
  assert.ok(issues.some((issue) => issue.code === "missing_ending"));
});

test("B3 – dvojí pořadí zastávek i úkolů je překážka publikace", () => {
  const duplicated = stops();
  duplicated.push({ ...duplicated[0], id: "s2", title: "Druhá" });
  const issues = findMissionPublishBlockers({ mission: COMPLETE_MISSION, stops: duplicated });
  assert.ok(issues.some((issue) => issue.code === "duplicate_stop_order"));

  const twoTasks = stops();
  twoTasks[0].tasks.push({ ...twoTasks[0].tasks[0], id: "t2" });
  const taskIssues = findMissionPublishBlockers({ mission: COMPLETE_MISSION, stops: twoTasks });
  assert.ok(taskIssues.some((issue) => issue.code === "duplicate_task_order"));
});

test("B4 – návaznost na jinou hru musí dávat smysl", () => {
  const catalog = [
    { id: "m2", title: "Předchozí", city: "Olomouc", isPublished: true },
    { id: "m3", title: "Koncept", city: "Olomouc", isPublished: false },
    { id: "m4", title: "Jinde", city: "Brno", isPublished: true }
  ];

  const ok = findMissionPublishBlockers({
    mission: { ...COMPLETE_MISSION, unlockAfterMissionId: "m2" },
    stops: stops(),
    catalog
  });
  assert.deepEqual(ok, []);

  for (const [unlock, why] of [
    ["m3", "nepublikovaná předchozí hra"],
    ["m4", "hra z jiného města"],
    ["neexistuje", "neexistující hra"],
    ["m1", "sama sebe"]
  ] as const) {
    const issues = findMissionPublishBlockers({
      mission: { ...COMPLETE_MISSION, unlockAfterMissionId: unlock },
      stops: stops(),
      catalog
    });
    assert.ok(issues.some((issue) => issue.code === "invalid_unlock"), `${why} má být překážka`);
  }
});

test("B5 – publikace má jedinou cestu a nejde ji obejít formulářem", () => {
  const form = code("components/admin/mission-form.tsx");
  assert.ok(!/name="is_published"/.test(form), "ve formuláři zůstalo zaškrtávátko publikace");

  const actions = code("app/admin/missions/actions.ts");
  const publishWrites = [...actions.matchAll(/is_published/g)].length;
  assert.ok(publishWrites > 0);
  // Jediné místo, kde se is_published nastavuje na hodnotu z požadavku, je
  // publikační akce; vytvoření hry ji vždy nastaví na false.
  assert.match(actions, /\.insert\(\{ \.\.\.parsed\.data, is_published: false \}\)/);
  assert.ok(!/is_published: isPublished/.test(actions));
  const update = actions.slice(actions.indexOf("export async function updateMissionAction"), actions.indexOf("async function collectPublishBlockers"));
  assert.ok(!/is_published/.test(update), "uložení hry sahá na publikaci");
});

test("B6 – publikace kontroluje celou hru, ne jen úkoly", () => {
  const actions = read("app/admin/missions/actions.ts");
  assert.match(actions, /findMissionPublishBlockers\(/);
  assert.match(actions, /hero_image_url, ending_title, ending_text, unlock_after_mission_id/);
});

// ---------------------------------------------------------------------------
// C. Body přežijí odpublikování
// ---------------------------------------------------------------------------

test("C1 – hra, která byla někdy publikovaná, se počítá do žebříčku dál", () => {
  const server = code("lib/leaderboard-server.ts");
  assert.match(server, /or\("is_published\.eq\.true,first_published_at\.not\.is\.null"\)/);
});

test("C2 – první publikace se zapíše natrvalo", () => {
  const actions = read("app/admin/missions/actions.ts");
  const toggle = actions.slice(actions.indexOf("export async function toggleMissionPublishAction"));
  assert.match(toggle, /first_published_at/);
  assert.match(toggle, /if \(!current\?\.first_published_at\)/, "první publikace se má zapsat jen jednou");
  // Odpublikování nikdy nemaže stopu po první publikaci.
  assert.ok(!/first_published_at: null/.test(toggle));
});

test("C3 – koncept, který nikdy nevyšel, body nedává", () => {
  // Model počítá jen hry, které dostane v mapě publikovaných; hra bez záznamu
  // v mapě nepřispěje ničím, ať má hráč jakýkoli výsledek.
  const scored = new Map([["vysla", maxScoreForTaskCount(5)]]);
  const totals = totalsByProfile(
    [
      { profile_code: "BAT-A", location_id: "vysla", best_score: 30, status: "completed", first_completed_at: "x" },
      { profile_code: "BAT-A", location_id: "koncept", best_score: 50, status: "completed", first_completed_at: "x" }
    ],
    scored
  );
  assert.equal(totals.get("BAT-A")?.score, 30);
  assert.equal(totals.get("BAT-A")?.completed, 1);
});

// ---------------------------------------------------------------------------
// D. Ochrana hraných her
// ---------------------------------------------------------------------------

test("D1 – nepoužitá hra se smazat smí", () => {
  assert.equal(isMissionUsed(NO_USAGE), false);
  assert.equal(guardMissionDelete(NO_USAGE).allowed, true);
  assert.equal(guardContentDelete(NO_USAGE, "task").allowed, true);
  assert.equal(guardReorder(NO_USAGE).allowed, true);
});

test("D2 – dohraná hra se smazat nesmí a nabídne se odpublikování", () => {
  const usage: MissionUsage = { activeRuns: 0, playersWithResult: 127, answers: 900 };
  const guard = guardMissionDelete(usage);
  assert.equal(guard.allowed, false);
  if (!guard.allowed) {
    assert.match(guard.reason, /127 hráčů ji už dohrálo/);
    assert.match(guard.reason, /vypni její publikaci/);
  }
});

test("D3 – úkol a zastávku v použité hře nejde smazat", () => {
  const usage: MissionUsage = { activeRuns: 0, playersWithResult: 0, answers: 3 };
  assert.equal(guardContentDelete(usage, "task").allowed, false);
  assert.equal(guardContentDelete(usage, "stop").allowed, false);
});

test("D4 – pořadí se nemění, dokud někdo hraje; dohraná hra ho měnit smí", () => {
  assert.equal(guardReorder({ activeRuns: 3, playersWithResult: 0, answers: 10 }).allowed, false);
  assert.equal(guardReorder({ activeRuns: 0, playersWithResult: 127, answers: 900 }).allowed, true);
});

test("D5 – hlášky jsou srozumitelné a skloňují se", () => {
  assert.match(describeUsage({ activeRuns: 1, playersWithResult: 0, answers: 1 }), /1 hráč tuhle hru právě hraje/);
  assert.match(describeUsage({ activeRuns: 3, playersWithResult: 0, answers: 1 }), /3 hráči tuhle hru právě hrají/);
  assert.match(describeUsage({ activeRuns: 0, playersWithResult: 1, answers: 1 }), /1 hráč ji už dohrál/);
  assert.equal(describeUsage(NO_USAGE), "Tuhle hru zatím nikdo nehrál.");
});

test("D5b – využití se čte ze skutečných sloupců a chyba se nepřehlédne", () => {
  const server = read("lib/mission-usage-server.ts");
  // child_game_sessions drží hru ve sloupci location_id, ne mission_id.
  assert.match(server, /"child_game_sessions"[\s\S]{0,120}eq\("location_id"/);
  assert.ok(!/"child_game_sessions"[\s\S]{0,120}eq\("mission_id"/.test(server), "špatný sloupec pro běžící výpravy");
  assert.match(server, /error \|\| typeof count !== "number"/, "chybějící počet se musí poznat");

  // Fail-closed: neznámé využití se bere jako používaná hra.
  for (const page of ["app/admin/missions/[id]/page.tsx", "app/admin/stops/[id]/page.tsx"]) {
    assert.match(read(page), /playersWithResult: 1/, `${page}: fallback musí být fail-closed`);
  }
});

test("D6 – mazání se potvrzuje a server potvrzení ověřuje", () => {
  const missions = read("app/admin/missions/actions.ts");
  assert.match(missions, /const confirmed = normalizeText\(formData\.get\("confirm"\)\) === "smazat"/);
  assert.match(missions, /status=delete_not_confirmed/);
  assert.match(missions, /guardMissionDelete\(usage\)/);

  const stopsActions = read("app/admin/stops/actions.ts");
  assert.match(stopsActions, /guardContentDelete\(usage, "task"\)/);

  const page = read("app/admin/missions/[id]/page.tsx");
  assert.match(page, /confirm=delete/, "chybí potvrzovací krok v UI");
  assert.ok(!/window\.confirm/.test(page), "potvrzení nesmí stát jen na prohlížeči");
});

// ---------------------------------------------------------------------------
// E. Pořadí
// ---------------------------------------------------------------------------

test("E1 – pořadí se mění šipkami a přečísluje se samo", () => {
  const missions = read("app/admin/missions/actions.ts");
  assert.match(missions, /export async function moveStopAction/);
  assert.match(missions, /direction === "up"/);
  const stopsActions = read("app/admin/stops/actions.ts");
  assert.match(stopsActions, /export async function moveTaskAction/);
  // Prohození přes dočasnou hodnotu, aby neporušilo unikátní index.
  assert.match(missions, /update\(\{ order: -1 \}\)/);
  assert.match(stopsActions, /update\(\{ order: -1 \}\)/);
});

test("E2 – dvě položky nemůžou mít stejné pořadí", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /create unique index if not exists mission_stops_mission_order_key/);
  assert.match(sql, /create unique index if not exists mission_tasks_stop_order_key/);
  // Před zamčením se případné duplicity srovnají.
  assert.match(sql, /row_number\(\) over \(partition by mission_id/);
  assert.match(sql, /row_number\(\) over \(partition by stop_id/);
});

// ---------------------------------------------------------------------------
// F. Náhled
// ---------------------------------------------------------------------------

test("F1 – náhled existuje a je jen v Mozku", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "app/admin/missions/[id]/preview/page.tsx")));
  assert.ok(fs.existsSync(path.join(ROOT, "app/mozek/missions/[id]/preview/page.tsx")));
  const middleware = read("middleware.ts");
  assert.match(middleware, /"\/mozek", "\/mozek\/:path\*"/, "náhled musí spadat pod admin ochranu");
});

test("F2 – náhled nemá gameplay vedlejší účinky", () => {
  const preview = code("lib/mission-preview-server.ts");
  const page = code("app/admin/missions/[id]/preview/page.tsx");
  for (const forbidden of [/\.insert\(/, /\.update\(/, /\.delete\(/, /\.upsert\(/, /ensureActiveRun/, /startRun/, /completeRun/]) {
    assert.ok(!forbidden.test(preview), `náhled zapisuje: ${forbidden}`);
    assert.ok(!forbidden.test(page), `stránka náhledu zapisuje: ${forbidden}`);
  }
});

test("F3 – náhled čte obsah stejnou cestou jako hra", () => {
  const preview = read("lib/mission-preview-server.ts");
  assert.match(preview, /getGameplayEpisodes\(locationId, \{ includeUnpublished: true \}\)/);
  assert.ok(!/mission_tasks/.test(preview), "náhled si obsah nemapuje sám");
});

test("F4 – náhled ukazuje, co hráč uvidí, i co je skryté", () => {
  const page = read("app/admin/missions/[id]/preview/page.tsx");
  for (const needle of [
    "heroImageUrl",
    "introStory",
    "episode.name",
    "episode.background",
    "task.options",
    "correctAnswers",
    "hintText",
    "transitionText",
    "endingTitle"
  ]) {
    assert.ok(page.includes(needle), `v náhledu chybí ${needle}`);
  }
});

// ---------------------------------------------------------------------------
// G. Média
// ---------------------------------------------------------------------------

test("G1 – velká fotka se zmenší, malá se nechá být", () => {
  assert.deepEqual(planImageProcessing({ type: "image/jpeg", size: 400_000, width: 1200, height: 800 }), {
    action: "keep",
    reason: "small_enough"
  });

  const big = planImageProcessing({ type: "image/jpeg", size: 9_800_000, width: 4032, height: 3024 });
  assert.equal(big.action, "resize");
  if (big.action === "resize") {
    assert.equal(big.targetWidth, MAX_IMAGE_EDGE);
    assert.equal(big.targetHeight, 1500);
  }

  assert.deepEqual(planImageProcessing({ type: "image/heic", size: 9_000_000, width: 4032, height: 3024 }), {
    action: "keep",
    reason: "unsupported_type"
  });
});

test("G2 – zmenšuje se i velký soubor v rozumném rozlišení", () => {
  const plan = planImageProcessing({ type: "image/png", size: 8_000_000, width: 1600, height: 1200 });
  assert.equal(plan.action, "resize");
  if (plan.action === "resize") {
    assert.equal(plan.targetWidth, 1600, "rozlišení se zbytečně nesnižuje");
  }
  assert.equal(processedFileName("IMG_2031.HEIC"), "IMG_2031.jpg");
});

test("G3 – zpracování běží v prohlížeči před odesláním", () => {
  const field = read("components/admin/image-field.tsx");
  assert.match(field, /prepareImageForUpload\(file\)/);
  assert.match(field, /new DataTransfer\(\)/, "zmenšený soubor se musí vrátit do inputu");
});

test("G4 – knihovna médií nevznikla", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "app/admin/media")), "vznikla globální knihovna médií");
  assert.ok(!fs.existsSync(path.join(ROOT, "app/mozek/media")));
});

// ---------------------------------------------------------------------------
// H. Katalogová pole a fotoúkol
// ---------------------------------------------------------------------------

test("H1 – katalogová pole se spravují v Mozku", () => {
  const form = read("components/admin/mission-form.tsx");
  for (const field of ["short_description", "catalog_order", "unlock_after_mission_id"]) {
    assert.match(form, new RegExp(`name="${field}"`), `ve formuláři chybí ${field}`);
  }
  const actions = read("app/admin/missions/actions.ts");
  assert.match(actions, /short_description: shortDescription/);
  assert.match(actions, /catalog_order: catalogOrder as number/);
  assert.match(actions, /unlock_after_mission_id: unlockAfter \|\| null/);
});

test("H2 – fotoúkol se do Mozku nepřidal", () => {
  const stopsActions = read("app/admin/stops/actions.ts");
  assert.match(stopsActions, /new Set<MissionTaskType>\(\["otevrena", "vyber", "ano-ne"\]\)/);
  assert.ok(!/"photo"/.test(stopsActions));
  const types = read("app/admin/types.ts");
  assert.ok(!/photo/.test(types), "typ photo se dostal do administračních typů");
});

// ---------------------------------------------------------------------------
// I. Migrace a existující data
// ---------------------------------------------------------------------------

test("I1 – migrace nic nemaže", () => {
  // SQL komentáře popisují i to, co se dělat nesmí.
  const sql = read(MIGRATION).replace(/--.*$/gm, "");
  for (const forbidden of [/drop table/i, /truncate/i, /\bdelete\s+from\b/i, /drop column/i]) {
    assert.ok(!forbidden.test(sql), `migrace obsahuje ${forbidden}`);
  }
});

test("I2 – existující města se doplní z her", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /insert into public\.cities/);
  assert.match(sql, /select distinct btrim\(city\) as city from public\.missions/);
  assert.match(sql, /'Praze'/);
  assert.match(sql, /'Českých Budějovicích'/);
  assert.match(sql, /update public\.missions m\s*\n\s*set city_id = c\.id/);
});

test("I3 – už publikovaná hra dostane razítko první publikace", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /set first_published_at = coalesce\(first_published_at, created_at\)\s*\n\s*where is_published = true/);
});

test("I4 – nová tabulka je jen pro server", () => {
  const sql = read(MIGRATION).replace(/--.*$/gm, "");
  assert.match(sql, /alter table public\.cities enable row level security/);
  assert.ok(!/create policy/i.test(sql), "cities nesmí mít veřejnou politiku");
});

// ---------------------------------------------------------------------------
// J. Co se nemění
// ---------------------------------------------------------------------------

test("J1 – R23–R27 a R33 zůstávají beze změny", () => {
  assert.match(read("lib/game-rules.ts"), /POINTS_PER_TASK = 10/);
  assert.match(read("lib/game-rules.ts"), /POINTS_PER_TASK_WITH_HINT = 5/);
  assert.match(read("app/api/game/submit-task-answer/route.ts"), /resolveServerTaskAvailability\(/);
  assert.match(read("app/api/export/game-content/route.ts"), /"Content-Type": "application\/pdf"/);
  assert.match(read("lib/leaderboard-model.ts"), /entry\.score >= 1/);
  assert.match(read("lib/nickname.ts"), /NICKNAME_MAX_LENGTH = 24/);
});

test("J2 – tiskové PDF bere obsah z databáze, takže hra z Mozku funguje sama", () => {
  const route = read("app/api/export/game-content/route.ts");
  assert.match(route, /getPublishedLocationIds\(\)/);
  assert.match(route, /getGameplayLocation\(/);
  assert.ok(!/mock-data/.test(code("lib/print-document.ts")));
});

test("J3 – žádné druhé administrační rozhraní nevzniklo", () => {
  const mozek = read("app/mozek/page.tsx");
  assert.match(mozek, /from "@\/app\/admin\/missions\/page"/, "/mozek zůstává re-exportem /admin");
});
