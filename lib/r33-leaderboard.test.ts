import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildLeaderboard,
  isHistoricallyCompleted,
  maxScoreForTaskCount,
  rankPlayers,
  totalsByProfile,
  type LeaderboardPlayer,
  type LeaderboardProgressRow
} from "./leaderboard-model.ts";
import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  fallbackNickname,
  isNicknameConflict,
  isSameNickname,
  nicknameIlikePattern,
  nicknameKey,
  normalizeNickname,
  validateNickname
} from "./nickname.ts";

// R33: pravidla žebříčku a přezdívek.
//
// Testy hlídají produktová pravidla, ne implementaci: součet nejlepších výsledků
// z publikovaných her, shodné skóre = shodné pořadí, hráč bez bodu není v pořadí
// ale sám sebe vidí, testovací profil pořadí neovlivní, přezdívka je jedinečná.

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const MIGRATION = "supabase/migrations/20260910143000_r33_leaderboard_and_nicknames.sql";

const KLAMOVKA = "klamovka";
const NOVA_HRA = "9f2c1f4e-1111-2222-3333-444455556666";
const NEPUBLIKOVANA = "budejovice-zaba";

/** Publikované hry: Klamovka (19 úkolů) a nová hra jen z databáze (4 úkoly). */
const PUBLISHED = new Map<string, number>([
  [KLAMOVKA, maxScoreForTaskCount(19)],
  [NOVA_HRA, maxScoreForTaskCount(4)]
]);

function completedRow(
  profileCode: string,
  locationId: string,
  bestScore: number,
  overrides: Partial<LeaderboardProgressRow> = {}
): LeaderboardProgressRow {
  return {
    profile_code: profileCode,
    location_id: locationId,
    best_score: bestScore,
    penalty_points: 0,
    status: "completed",
    first_completed_at: "2026-05-21T17:06:24.945Z",
    ...overrides
  };
}

function player(profileCode: string, nickname: string, overrides: Partial<LeaderboardPlayer> = {}): LeaderboardPlayer {
  return { profileCode, nickname, avatar: "traki-01", excluded: false, isYou: false, ...overrides };
}

// ---------------------------------------------------------------------------
// A. Body
// ---------------------------------------------------------------------------

test("A1 – první dokončení přidá celý výsledek", () => {
  const totals = totalsByProfile([completedRow("BAT-A", KLAMOVKA, 150)], PUBLISHED);
  assert.equal(totals.get("BAT-A")?.score, 150);
  assert.equal(totals.get("BAT-A")?.completed, 1);
});

test("A2 – lepší opakování zvýší příspěvek hry jen o rozdíl", () => {
  // best_score drží nejlepší dosažený výsledek (zápis hlídá lib/game-completion.ts),
  // takže po sérii 150 → 170 → 160 → 180 přispívá hra celkem 180, ne 660.
  const totals = totalsByProfile([completedRow("BAT-A", KLAMOVKA, 180)], PUBLISHED);
  assert.equal(totals.get("BAT-A")?.score, 180);
});

test("A3 – horší opakování nic nesníží a hra se počítá jednou", () => {
  const totals = totalsByProfile(
    [
      completedRow("BAT-A", KLAMOVKA, 170),
      // druhý řádek téže hry (rozehrané opakování) nesmí nic přidat ani ubrat
      completedRow("BAT-A", KLAMOVKA, 160, { status: "in_progress" })
    ],
    PUBLISHED
  );
  assert.equal(totals.get("BAT-A")?.score, 170);
  assert.equal(totals.get("BAT-A")?.completed, 1);
});

test("A4 – dvě různé hry se sečtou", () => {
  const totals = totalsByProfile(
    [completedRow("BAT-A", KLAMOVKA, 180), completedRow("BAT-A", NOVA_HRA, 40)],
    PUBLISHED
  );
  assert.equal(totals.get("BAT-A")?.score, 220);
  assert.equal(totals.get("BAT-A")?.completed, 2);
});

test("A5 – nepublikovaná hra se nezapočítá", () => {
  const totals = totalsByProfile([completedRow("BAT-A", NEPUBLIKOVANA, 130)], PUBLISHED);
  assert.equal(totals.get("BAT-A"), undefined);
});

test("A6 – hra jen z databáze (bez slugu v kódu) se započítá", () => {
  const totals = totalsByProfile([completedRow("BAT-A", NOVA_HRA, 40)], PUBLISHED);
  assert.equal(totals.get("BAT-A")?.score, 40);
});

test("A7 – rozehraná hra bez historického dokončení body nedává", () => {
  const row = completedRow("BAT-A", KLAMOVKA, 90, { status: "in_progress", first_completed_at: null });
  assert.equal(isHistoricallyCompleted(row), false);
  assert.equal(totalsByProfile([row], PUBLISHED).get("BAT-A"), undefined);
});

test("A8 – historický řádek bez best_score použije maximum z databáze", () => {
  // 19 úkolů × 10 bodů = 190; ztráta 10 bodů → 180.
  const totals = totalsByProfile(
    [completedRow("BAT-A", KLAMOVKA, Number.NaN, { best_score: null, penalty_points: 10 })],
    PUBLISHED
  );
  assert.equal(totals.get("BAT-A")?.score, 180);
});

test("A9 – nula bodů je platné dokončení", () => {
  const totals = totalsByProfile([completedRow("BAT-A", KLAMOVKA, 0)], PUBLISHED);
  assert.equal(totals.get("BAT-A")?.score, 0);
  assert.equal(totals.get("BAT-A")?.completed, 1);
});

// ---------------------------------------------------------------------------
// B. Pořadí
// ---------------------------------------------------------------------------

test("B1 – shodné skóre má shodné pořadí a další pořadí přeskočí", () => {
  const totals = new Map([
    ["BAT-A", { score: 580, completed: 3 }],
    ["BAT-B", { score: 540, completed: 3 }],
    ["BAT-C", { score: 540, completed: 2 }],
    ["BAT-D", { score: 510, completed: 2 }]
  ]);
  const entries = rankPlayers(
    [player("BAT-A", "Ada"), player("BAT-B", "Bob"), player("BAT-C", "Cyril"), player("BAT-D", "Dan")],
    totals
  );
  assert.deepEqual(
    entries.map((entry) => entry.rank),
    [1, 2, 2, 4]
  );
  assert.deepEqual(
    entries.map((entry) => entry.score),
    [580, 540, 540, 510]
  );
});

test("B2 – hráč bez bodu není v pořadí", () => {
  const totals = new Map([["BAT-A", { score: 10, completed: 1 }]]);
  const entries = rankPlayers([player("BAT-A", "Ada"), player("BAT-Z", "Zed")], totals);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["Ada"]
  );
});

test("B3 – hráč s nulou vidí sám sebe mimo pořadí", () => {
  const { entries, you } = buildLeaderboard({
    players: [player("BAT-A", "Ada"), player("BAT-Z", "Zed", { isYou: true })],
    totals: new Map([["BAT-A", { score: 10, completed: 1 }]]),
    limit: 20
  });
  assert.equal(entries.some((entry) => entry.isYou), false);
  assert.equal(you?.rank, null);
  assert.equal(you?.score, 0);
  assert.equal(you?.inTop, false);
  assert.equal(you?.name, "Zed");
});

test("B4 – testovací profil se nezobrazí ani neovlivní pořadí", () => {
  const totals = new Map([
    ["BAT-TEST", { score: 900, completed: 5 }],
    ["BAT-A", { score: 580, completed: 3 }],
    ["BAT-B", { score: 540, completed: 3 }]
  ]);
  const entries = rankPlayers(
    [player("BAT-TEST", "ZZTEST", { excluded: true }), player("BAT-A", "Ada"), player("BAT-B", "Bob")],
    totals
  );
  assert.deepEqual(
    entries.map((entry) => [entry.rank, entry.name]),
    [
      [1, "Ada"],
      [2, "Bob"]
    ]
  );
});

test("B5 – žebříček vrací nejvýš TOP 20", () => {
  const players = Array.from({ length: 25 }, (_, index) => player(`BAT-${index}`, `Hráč ${index}`));
  const totals = new Map(players.map((entry, index) => [entry.profileCode, { score: 100 - index, completed: 1 }]));
  const { entries } = buildLeaderboard({ players, totals, limit: 20 });
  assert.equal(entries.length, 20);
  assert.equal(entries[0].rank, 1);
  assert.equal(entries[19].rank, 20);
});

test("B6 – vlastní pozice mimo TOP 20 se vrací zvlášť", () => {
  const players = Array.from({ length: 25 }, (_, index) =>
    player(`BAT-${index}`, `Hráč ${index}`, { isYou: index === 24 })
  );
  const totals = new Map(players.map((entry, index) => [entry.profileCode, { score: 100 - index, completed: 1 }]));
  const { entries, you } = buildLeaderboard({ players, totals, limit: 20 });
  assert.equal(entries.some((entry) => entry.isYou), false);
  assert.equal(you?.inTop, false);
  assert.equal(you?.rank, 25);
  assert.equal(you?.score, 76);
});

test("B7 – vlastní řádek je součástí žebříčku, když se do něj vejde", () => {
  const { entries, you } = buildLeaderboard({
    players: [player("BAT-A", "Ada", { isYou: true }), player("BAT-B", "Bob")],
    totals: new Map([
      ["BAT-A", { score: 100, completed: 1 }],
      ["BAT-B", { score: 200, completed: 2 }]
    ]),
    limit: 20
  });
  assert.equal(entries.length, 2);
  assert.equal(entries.filter((entry) => entry.isYou).length, 1, "vlastní hráč chybí v žebříčku");
  assert.equal(you?.inTop, true);
  assert.equal(you?.rank, 2);
});

test("B8 – řádek nese pořadí, avatar, přezdívku i body", () => {
  const { entries } = buildLeaderboard({
    players: [player("BAT-A", "Ada")],
    totals: new Map([["BAT-A", { score: 30, completed: 1 }]]),
    limit: 20
  });
  assert.deepEqual(entries[0], {
    rank: 1,
    name: "Ada",
    avatar: "traki-01",
    score: 30,
    completed: 1,
    isYou: false
  });
});

// ---------------------------------------------------------------------------
// C. Přezdívka
// ---------------------------------------------------------------------------

test("C1 – délka 2 až 24 znaků", () => {
  assert.equal(NICKNAME_MIN_LENGTH, 2);
  assert.equal(NICKNAME_MAX_LENGTH, 24);
  assert.equal(validateNickname("A").ok, false);
  assert.equal(validateNickname("Ab").ok, true);
  assert.equal(validateNickname("A".repeat(24)).ok, true);
  assert.equal(validateNickname("A".repeat(25)).ok, false);
  assert.equal(validateNickname("   ").ok, false);
});

test("C2 – shoda ignoruje velikost písmen", () => {
  assert.equal(isSameNickname("Pepík", "pepík"), true);
  assert.equal(isSameNickname("Pepík", "PEPÍK"), true);
  assert.equal(nicknameKey("PEPÍK"), nicknameKey("pepík"));
});

test("C3 – diakritika je významná", () => {
  assert.equal(isSameNickname("Pepík", "Pepik"), false);
  assert.notEqual(nicknameKey("Pepík"), nicknameKey("Pepik"));
});

test("C4 – dvě Unicode reprezentace téhož textu jsou jedna přezdívka", () => {
  const precomposed = "Pepík"; // í jako jeden znak
  const decomposed = "Pepík"; // i + kombinující čárka
  assert.notEqual(precomposed, decomposed, "test má porovnávat opravdu různé řetězce");
  assert.equal(isSameNickname(precomposed, decomposed), true);
  assert.equal(normalizeNickname(decomposed), precomposed);
});

test("C5 – zdvojené a okrajové mezery se srovnají", () => {
  assert.equal(normalizeNickname("  Malý   Stopař  "), "Malý Stopař");
  assert.equal(isSameNickname("Malý Stopař", "malý   stopař"), true);
});

test("C6 – emoji se počítá jako jeden znak", () => {
  assert.equal(validateNickname("🦊🦊").ok, true);
  assert.equal(validateNickname("🦊").ok, false);
});

test("C7 – náhradní přezdívka drží pravidla a umí další pokus", () => {
  assert.equal(fallbackNickname("").length >= 2, true);
  assert.equal([...fallbackNickname("a".repeat(80))].length <= 24, true);
  assert.notEqual(fallbackNickname("stopar", 0), fallbackNickname("stopar", 1));
  assert.equal([...fallbackNickname("a".repeat(80), 3)].length <= 24, true);
});

test("C8 – kolize v databázi se pozná podle indexu", () => {
  assert.equal(
    isNicknameConflict({ code: "23505", message: 'duplicate key value violates unique constraint "child_profiles_nickname_key"' }),
    true
  );
  assert.equal(
    isNicknameConflict({ code: "23505", message: 'duplicate key value violates unique constraint "child_profiles_profile_code_key"' }),
    false
  );
  assert.equal(isNicknameConflict(null), false);
});

test("C9 – žolíky v přezdívce se v dotazu escapují", () => {
  assert.equal(nicknameIlikePattern("100%_hráč"), "100\\%\\_hráč");
});

// ---------------------------------------------------------------------------
// D. Databáze a server
// ---------------------------------------------------------------------------

test("D1 – migrace vynucuje jedinečnou přezdívku podle schváleného pravidla", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /create unique index if not exists child_profiles_nickname_key/);
  assert.match(sql, /lower\(normalize\(btrim\(child_name\), nfc\)\)/);
  assert.match(sql, /check \(char_length\(btrim\(child_name\)\) between 2 and 24\)/);
});

test("D2 – migrace zavírá přímý klientský zápis do profilu", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /drop policy if exists "parents update own child profiles" on public\.child_profiles/);
  assert.match(sql, /cmd in \('UPDATE', 'DELETE', 'ALL'\)/, "chybí pojistka na politiku pod jiným názvem");
  assert.match(sql, /alter table public\.child_profiles enable row level security/);
  // Čtení a zakládání profilu zůstává – legacy přihlášení e-mailem profil vkládá
  // klientem přihlášeného uživatele.
  assert.ok(!/drop policy if exists "parents insert own child profiles"/.test(sql));
});

test("D3 – migrace nic nemaže", () => {
  // Komentáře popisují i to, co se dělat nesmí, takže se hlídá jen kód.
  const sql = read(MIGRATION).replace(/--.*$/gm, "");
  for (const forbidden of [/drop table/i, /truncate/i, /\bdelete\s+from\b/i, /drop column/i]) {
    assert.ok(!forbidden.test(sql), `migrace obsahuje ${forbidden}`);
  }
});

test("D4 – příznak testovacího profilu je explicitní a výchozí false", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /add column if not exists excluded_from_leaderboard boolean not null default false/);
  const model = read("lib/leaderboard-model.ts");
  assert.ok(!/ZZTEST|test.*prefix|startsWith\("ZZ/i.test(model), "pořadí se nesmí filtrovat podle názvu přezdívky");
});

test("D5 – žebříček bere publikované hry z databáze, ne z obsahu v kódu", () => {
  // Komentáře vysvětlují i starý stav, takže se hlídá jen kód.
  const code = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const server = code("lib/leaderboard-server.ts");
  assert.match(server, /from\("missions"\)/);
  assert.match(server, /\.eq\("is_published", true\)/);
  for (const file of ["app/api/leaderboard/route.ts", "lib/leaderboard-model.ts", "lib/leaderboard-server.ts"]) {
    assert.ok(!/mock-data/.test(code(file)), `${file}: žebříček pořád závisí na obsahu v kódu`);
  }
});

test("D6 – žebříček vyžaduje přihlášení", () => {
  const route = read("app/api/leaderboard/route.ts");
  const beforeQuery = route.slice(0, route.lastIndexOf("loadPublishedGameScores"));
  assert.match(beforeQuery, /if \(!accessToken\)/);
  assert.match(beforeQuery, /if \(authError \|\| !user\)/);
  assert.equal((beforeQuery.match(/unauthorized/g) ?? []).length >= 2, true);
});

test("D7 – neplatný kód nevybere cizí profil", () => {
  const route = read("app/api/leaderboard/route.ts");
  const fn = route.slice(route.indexOf("function findOwnProfile"), route.indexOf("export async function POST"));
  assert.ok(!/rows\[0\] \?\? null/.test(fn), "vrací se první nalezený profil");
  assert.match(fn, /rows\.length === 1 \? rows\[0\] : null/);
});

test("D8 – mrtvý fallback na chybějící sloupec je pryč", () => {
  const route = read("app/api/leaderboard/route.ts");
  assert.equal((route.match(/42703/g) ?? []).length, 1, "zůstal víc než jeden fallback na chybějící sloupec");
  // A ten jediný má smysl: čte profily bez sloupce excluded_from_leaderboard.
  assert.match(route, /PROFILE_COLUMNS_LEGACY/);
});

test("D9 – žádná paralelní tabulka žebříčku nevznikla", () => {
  const sql = read(MIGRATION);
  assert.ok(!/create table/i.test(sql), "R33 nesmí zakládat druhý zdroj bodů");
});

// ---------------------------------------------------------------------------
// E. Trvalost hráčské historie
// ---------------------------------------------------------------------------

test("E1 – vynulování postupu už neexistuje", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "app/api/game/reset-progress")), "endpoint na vymazání výsledků zůstal");
  assert.ok(!/reset-progress/.test(read("components/app-state-provider.tsx")));
  assert.ok(!/resetProgress/.test(read("components/app-state-provider.tsx")));
});

test("E2 – opakované hraní a mazání odpovědí zůstává beze změny", () => {
  // R42: reset-location-replay zanikl; od R24 vede opakované hraní přes start-run.
  const start = read("app/api/game/start-run/route.ts");
  assert.ok(!/\.delete\(\)/.test(start), "opakování hry nesmí mazat historii");
  assert.match(read("app/api/game/submit-task-answer/route.ts"), /status: "in_progress"/);
});

test("E3 – rekord se nikdy nezhorší", () => {
  const rules = read("lib/location-completion-state.ts");
  assert.match(rules, /existing\.best_score < finalBestScore/);
  assert.match(read("lib/game-result.ts"), /return score > previousBest;/);
});

// ---------------------------------------------------------------------------
// F. Co se nemění
// ---------------------------------------------------------------------------

test("F1 – R23–R27 zůstávají beze změny", () => {
  assert.match(read("lib/game-rules.ts"), /POINTS_PER_TASK = 10/);
  assert.match(read("lib/game-rules.ts"), /POINTS_PER_TASK_WITH_HINT = 5/);
  assert.match(read("lib/task-order.ts"), /export function resolveTaskAvailability/);
  assert.match(read("app/api/game/submit-task-answer/route.ts"), /resolveServerTaskAvailability\(/);
  assert.match(read("app/api/game/complete-location/route.ts"), /getGameplayEnding\(locationId\)/);
  assert.match(read("app/api/export/game-content/route.ts"), /"Content-Type": "application\/pdf"/);
});

test("F2 – dokončení pořád počítá každému jeho vlastní výsledek", () => {
  const completion = read("lib/game-completion.ts");
  assert.match(completion, /Skóre vedoucího se[\s\S]{0,40}nikdy nekopíruje ostatním/);
  assert.match(read("app/api/game/complete-location/route.ts"), /completeRunForParticipants\(/);
});

test("F3 – přátelé a kód kamaráda fungují dál podle kódu, ne podle přezdívky", () => {
  const resolve = read("app/api/friends/resolve/route.ts");
  assert.match(resolve, /\.eq\("player_code", requestedCode\)/);
  assert.ok(!/child_name", requested/.test(resolve), "kamarád se nesmí hledat podle přezdívky");
  assert.ok(fs.existsSync(path.join(ROOT, "app/api/friends/add/route.ts")));
});

test("F4 – Traki klíč a obnova účtu zůstávají nedotčené", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "app/api/recovery-key/create/route.ts")));
  assert.ok(fs.existsSync(path.join(ROOT, "app/api/recovery-key/redeem/route.ts")));
  const sql = read(MIGRATION);
  assert.ok(!/recovery/i.test(sql), "migrace nesmí sahat na obnovovací klíč");
});

test("F5 – žebříček nemá pohled na jednotlivé hry ani sezóny", () => {
  const route = read("app/api/leaderboard/route.ts");
  assert.ok(!/locationId/.test(route.slice(route.indexOf("const scope"))), "vznikl žebříček konkrétní hry");
  assert.ok(!/season|sezón/i.test(route));
  assert.match(route, /scope !== "friends" && scope !== "global"/);
});
