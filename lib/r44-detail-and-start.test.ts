import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildLocationDetailModel } from "./location-detail-model.ts";

// R44 krok 2: detail hry a jednotný vstup do dobrodružství.
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const BASE = {
  name: "Ztracený příběh Klamovky",
  image: "/x.png",
  episodes: [{ name: "Chrámek noci a poznání" }],
  unlocked: true,
  registered: true
};

// ---------------------------------------------------------------------------
// Místo startu a odkaz do mapy (čisté chování)
// ---------------------------------------------------------------------------

test("místo startu se ukáže, když ho hra má", () => {
  const model = buildLocationDetailModel({
    ...BASE,
    startPlaceName: "Park Klamovka, Praha 5",
    startLat: 50.0717634,
    startLng: 14.3762351
  });
  assert.equal(model.startPlaceName, "Park Klamovka, Praha 5");
  assert.ok(model.startMapUrl, "s oběma souřadnicemi musí vzniknout odkaz do mapy");
  assert.match(model.startMapUrl!, /^https:\/\//, "odkaz vede do externí mapy");
  assert.ok(model.startMapUrl!.includes("50.0717634") && model.startMapUrl!.includes("14.3762351"));
});

test("bez souřadnic se odkaz do mapy nenabízí", () => {
  assert.equal(buildLocationDetailModel({ ...BASE, startPlaceName: "Park Klamovka, Praha 5" }).startMapUrl, null);
  // jedna souřadnice sama by vedla nikam
  assert.equal(buildLocationDetailModel({ ...BASE, startLat: 50.07 }).startMapUrl, null);
  assert.equal(buildLocationDetailModel({ ...BASE, startLng: 14.37 }).startMapUrl, null);
});

test("souřadnice se nikdy nedopočítávají z města ani z první zastávky", () => {
  const model = buildLocationDetailModel(BASE);
  assert.equal(model.startPlaceName, null);
  assert.equal(model.startMapUrl, null);
  assert.equal(model.startStopName, "Chrámek noci a poznání", "první zastávka zůstává, ale místo startu nenahrazuje");
});

// ---------------------------------------------------------------------------
// Tři textové vrstvy
// ---------------------------------------------------------------------------

test("detail použije vlastní text, když ho hra má", () => {
  const model = buildLocationDetailModel({
    ...BASE,
    detailText: "Vlastní text detailu.",
    shortDescription: "Krátký popis z katalogu.",
    teaser: "Teaser karty."
  });
  assert.equal(model.description, "Vlastní text detailu.");
});

test("bez vlastního textu se detail chová jako dosud", () => {
  assert.equal(
    buildLocationDetailModel({ ...BASE, shortDescription: "Krátký popis.", teaser: "Teaser." }).description,
    "Krátký popis."
  );
  assert.equal(buildLocationDetailModel({ ...BASE, teaser: "Teaser." }).description, "Teaser.");
  assert.equal(buildLocationDetailModel({ ...BASE, detailText: "   " }).description, "");
});

// ---------------------------------------------------------------------------
// Jedna cesta do hry
// ---------------------------------------------------------------------------

test("stavová CTA zůstávají podle stavu hry", () => {
  assert.equal(buildLocationDetailModel(BASE).primaryLabel, "Hrát");
  assert.equal(buildLocationDetailModel({ ...BASE, hasActiveRun: true }).primaryLabel, "Pokračovat");
  assert.equal(buildLocationDetailModel({ ...BASE, completed: true }).primaryLabel, "Hrát znovu");
  assert.equal(buildLocationDetailModel({ ...BASE, unlocked: false }).primaryAction, "locked");
});

test("„Pokračovat“ zůstává holé – bez zastávky, čísla úkolu ani procent", () => {
  const model = buildLocationDetailModel({ ...BASE, hasActiveRun: true });
  assert.equal(model.primaryLabel, "Pokračovat");
  assert.ok(!/\d/.test(model.primaryLabel), "popisek nesmí nést žádné číslo");
});

test("detail nemá druhou cestu do digitální hry ani štítek HRA", () => {
  const src = read("components/location-detail-screen.tsx");
  const withoutComments = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "");
  assert.ok(!/Otevřít hru v aplikaci/.test(withoutComments), "druhé CTA v tiskové sekci musí být pryč");
  assert.ok(
    !/text-sky">Hra<\/p>/.test(withoutComments),
    "redundantní štítek HRA nad názvem musí být pryč"
  );
  // do hry vede jediné místo: hlavní tlačítko přes startMission
  const playLinks = withoutComments.match(/\/play\/\$\{location\.id\}/g) ?? [];
  assert.ok(playLinks.length <= 2, `do hry smí vést jen hlavní akce, nalezeno ${playLinks.length} odkazů`);
});

test("nepřihlášený jde do hry stejnou cestou, jen s vloženou registrací", () => {
  const src = read("components/location-detail-screen.tsx");
  assert.match(src, /start=1/, "bez hráče se záměr „spusť hru“ nese v adrese");
  assert.ok(
    !/router\.push\(`\/play\/\$\{location\.id\}\?mode=solo`\)/.test(src),
    "otevřít hru bez založení výpravy už nesmí jít"
  );

  const play = read("components/play-screen.tsx");
  assert.match(play, /searchParams\.get\("start"\) === "1"/, "herní obrazovka musí čekající start poznat");
  assert.match(play, /await startRun\(location\.id\)/, "výprava vzniká stejnou operací jako u existujícího hráče");
  assert.match(play, /setIntroOpen\(true\)/, "po skutečném založení výpravy se ukáže ZAČÍNÁME");
});

// ---------------------------------------------------------------------------
// Hra je dobrodružství, ne ukazatel postupu
// ---------------------------------------------------------------------------

test("herní UI neukazuje postup ani režim", () => {
  const src = read("components/play-screen.tsx");
  const withoutComments = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "");

  for (const [vzor, popis] of [
    [/Rozehraná hra/, "štítek „Rozehraná hra“"],
    [/Sólový režim/, "štítek režimu"],
    [/% hotovo/, "procenta"],
    [/Zastavení \{/, "počet zastavení X/Y"],
    [/Úkol \{taskIndex \+ 1\} z /, "počet úkolů X z Y"]
  ] as Array<[RegExp, string]>) {
    assert.ok(!vzor.test(withoutComments), `${popis} se hráči nesmí zobrazovat`);
  }
});

test("evidence postupu na serveru zůstává nedotčená", () => {
  // R44 mění jen to, co vidí hráč. Autoritativní vrstva musí zůstat.
  assert.ok(fs.existsSync(path.join(ROOT, "lib/game-completion.ts")));
  assert.match(read("lib/game-run.ts"), /child_game_sessions/);
  assert.match(read("app/api/game/submit-task-answer/route.ts"), /child_task_progress/);
  assert.match(read("components/play-screen.tsx"), /totalTasks/, "počet úkolů se dál počítá pro vnitřní logiku");
});

// ---------------------------------------------------------------------------
// Tisková sekce
// ---------------------------------------------------------------------------

test("tisková sekce je sbalená, funkční a číslovaná seznamem", () => {
  const src = read("components/location-detail-screen.tsx");
  assert.match(src, /<details/, "tisk se rozbaluje až na vyžádání");
  assert.match(src, /Chceš hrát s papírem\?/);
  assert.match(src, /format=pdf&locationId=/, "stahování PDF musí zůstat");
  assert.match(src, /list-decimal/, "čísla kroků nese seznam");
  assert.ok(!/>1\. Vytiskni/.test(src) && !/\{"1\. "/.test(src), "čísla nesmí být ručně v textu");
});

// ---------------------------------------------------------------------------
// Mozek a migrace
// ---------------------------------------------------------------------------

test("Mozek umí místo startu i text detailu spravovat", () => {
  const form = read("components/admin/mission-form.tsx");
  for (const pole of ["start_place_name", "start_lat", "start_lng", "detail_text"]) {
    assert.match(form, new RegExp(`name="${pole}"`), `formulář musí umět ${pole}`);
  }
  const actions = read("app/admin/missions/actions.ts");
  for (const pole of ["start_place_name", "start_lat", "start_lng", "detail_text"]) {
    assert.match(actions, new RegExp(pole), `ukládání musí znát ${pole}`);
  }
  assert.match(actions, /parseCoordinate/, "souřadnice se validují");
  assert.match(read("app/admin/missions/[id]/page.tsx"), /start_place_name/, "editace musí pole načíst");
});

test("R44 migrace jen přidává nepovinné sloupce", () => {
  const dir = path.join(ROOT, "supabase/migrations");
  const file = fs.readdirSync(dir).find((name) => /r44_mission_start_place\.sql$/.test(name));
  assert.ok(file, "migrace *_r44_mission_start_place.sql musí existovat");
  const sql = fs.readFileSync(path.join(dir, file!), "utf8");
  const statements = sql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  const adds = statements.filter((s) => s.startsWith("alter table"));
  assert.deepEqual(adds, [
    "alter table public.missions add column if not exists start_place_name text",
    "alter table public.missions add column if not exists start_lat double precision",
    "alter table public.missions add column if not exists start_lng double precision",
    "alter table public.missions add column if not exists detail_text text"
  ]);
  assert.ok(!/drop |delete |truncate|cascade|not null/i.test(sql), "migrace nesmí nic mazat ani nic vynucovat");
});
