import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deriveCompletionUpdate } from "./location-completion-state.ts";
import { scoreTaskProgress, isMissionCompleted } from "./mission-completion.ts";

// R23: model Hra → Výprava → Zastávka → Úkol.
// Endpointy sahají na databázi, proto se jejich pravidla ověřují nad zdrojovým kódem
// (stejně jako u zámku her v R22). Čistá pravidla se testují přímo.

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const migration = () => {
  const dir = path.join(ROOT, "supabase/migrations");
  const file = fs.readdirSync(dir).find((name) => /r23_game_runs\.sql$/.test(name));
  assert.ok(file, "migrace R23 chybí");
  // komentáře se do kontroly nepočítají – slova jako „drop table“ se v nich smí objevit
  return fs.readFileSync(path.join(dir, file!), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
};

// ---------------------------------------------------------------------------
// B. Model výpravy
// ---------------------------------------------------------------------------

test("B: sólo hraní má výpravu a odpověď se do ní zapisuje", () => {
  const src = read("app/api/game/submit-task-answer/route.ts");
  assert.match(src, /ensureActiveRun\(admin, \{ childProfileId: ownProfile\.id, locationId \}\)/);
  assert.match(src, /session_id: run\.id/);
  assert.match(src, /\.eq\("session_id", run\.id\)/);
});

test("B: sólo i skupina používají stejnou tabulku výprav", () => {
  const src = read("lib/game-run.ts");
  assert.match(src, /child_game_sessions/);
  assert.match(src, /mode: args\.mode \?\? "solo"/);
  assert.ok(!/create table|solo_sessions/i.test(src), "sólo nesmí mít vlastní paralelní tabulku");
  const create = read("app/api/expeditions/create/route.ts");
  assert.match(create, /mode: "group"/);
});

test("B: opakované hraní je nová výprava, odpovědi se nemažou", () => {
  const src = read("app/api/game/reset-location-replay/route.ts");
  assert.ok(!/child_task_progress"\)\s*\.delete\(\)/.test(src.replace(/\n/g, " ")), "reset nesmí mazat odpovědi");
  assert.ok(!src.includes(".delete()"), "reset nesmí nic mazat");
  assert.match(src, /ensureActiveRun\(/);
});

test("B: odpovědi dvou výprav se nemíchají", () => {
  const progress = read("app/api/game/location-progress/route.ts");
  assert.match(progress, /findActiveRunForPlayer\(/);
  assert.match(progress, /\.eq\("session_id", run\.id\)/);
  const runLib = read("lib/game-run.ts");
  assert.match(runLib, /query\.eq\("session_id", args\.runId\) : query\.is\("session_id", null\)/);
});

test("B: migrace zavádí vazbu odpovědi na výpravu a povoluje druhé rozehrání", () => {
  const sql = migration();
  assert.match(sql, /add column if not exists session_id uuid references public\.child_game_sessions\(id\)/);
  assert.match(sql, /child_task_progress_run_task_idx[\s\S]*child_profile_id, location_id, task_id, session_id/);
  assert.match(sql, /drop constraint %I/, "staré unikátní omezení bez výpravy musí padnout");
});

test("B: P8 – hráč smí mít rozehraných více různých her", () => {
  const sql = migration();
  assert.match(sql, /drop index if exists public\.child_game_sessions_one_open_per_leader_idx/);
  assert.match(sql, /child_game_sessions_open_run_per_leader_location_idx[\s\S]*leader_child_profile_id, location_id/);
});

// ---------------------------------------------------------------------------
// C. Skupinová výprava
// ---------------------------------------------------------------------------

test("C: skóre vedoucího se nekopíruje ostatním, každý má vlastní body", () => {
  const src = read("app/api/expeditions/finish/route.ts");
  assert.ok(!src.includes("leaderTaskProgress"), "výsledek vedoucího se nesmí použít pro ostatní");
  assert.ok(!src.includes("computeMissionScore"), "mock scoring musí být pryč");
  assert.ok(!src.includes("child_expedition_invites"), "stará tabulka pozvánek se pro dokončení nepoužívá");
  assert.match(src, /completeRunForParticipants\(/);
  const shared = read("lib/game-completion.ts");
  assert.match(shared, /profiles\.map\(\(profile\) => \{[\s\S]*scoreTaskProgress\(taskIds, progressByChild\.get\(profile\.id\)/);
});

test("C: jedna dokončovací cesta pro sólo i skupinu", () => {
  assert.match(read("app/api/game/complete-location/route.ts"), /completeRunForParticipants\(/);
  assert.match(read("app/api/expeditions/finish/route.ts"), /completeRunForParticipants\(/);
  assert.ok(!read("app/api/game/complete-location/route.ts").includes("child_expedition_invites"));
});

test("C: rozehraný účastník se při dokončení nepřeskočí (T2)", () => {
  const shared = read("lib/game-completion.ts");
  assert.ok(!shared.includes('.gt("penalty_points"'), "filtr přes penalty_points musí být pryč");
  assert.ok(!shared.includes('.is("penalty_points"'), "mrtvá větev na NULL musí být pryč");
  const finishSrc = read("app/api/expeditions/finish/route.ts");
  assert.ok(!finishSrc.includes('.gt("penalty_points"'));
});

test("C: rozehraný řádek se dokončí a lepší starší výsledek se nezhorší", () => {
  const rozehrany = deriveCompletionUpdate({
    existing: { penalty_points: 0, best_score: null, status: "in_progress", first_completed_at: null },
    finalScore: 10,
    finalMissingPoints: 180,
    source: "expedition",
    hasExtendedProgressColumns: true
  });
  assert.equal(rozehrany.shouldUpdate, true, "účastník s rozehraným řádkem se musí dokončit");
  assert.equal(rozehrany.firstCompletionTriggered, true);

  const horsiPruchod = deriveCompletionUpdate({
    existing: { penalty_points: 10, best_score: 180, status: "completed", first_completed_at: "2026-05-21T17:06:24Z" },
    finalScore: 50,
    finalMissingPoints: 140,
    source: "gameplay",
    hasExtendedProgressColumns: true
  });
  assert.equal(horsiPruchod.bestScoreUpdated, false, "horší průchod nesmí snížit nejlepší skóre");
  assert.equal(horsiPruchod.firstCompletionTriggered, false, "první dokončení se nepřepisuje");
});

test("C: penalizace se zhoršit nemůže ani v zápisu", () => {
  const shared = read("lib/game-completion.ts");
  assert.match(shared, /existing\.penalty_points > entry\.result\.missingPoints/);
  assert.match(shared, /if \(decision\.bestScoreUpdated\)/);
});

// ---------------------------------------------------------------------------
// D. P9 – pozvánka do zamčené hry
// ---------------------------------------------------------------------------

test("D: zamčenou hru nelze obejít sólo, výjimka platí jen pro člena výpravy", () => {
  const src = read("lib/game-access-server.ts");
  assert.match(src, /if \(direct\.allowed\) \{\s*\n\s*return direct;/, "odemčená hra se řeší beze změny");
  assert.match(src, /direct\.reason === "not_published"[\s\S]*return direct;/, "nepublikovaná hra se nikdy neodemyká");
  assert.match(src, /findActiveRunForPlayer\(admin, childProfileId, locationId\)/);
  assert.match(src, /run\.leader_child_profile_id === childProfileId[\s\S]*return direct;/, "vedoucí si zámek neobejde sám");
  assert.match(src, /leaderAccess\.allowed/, "vedoucí musí mít ke hře skutečný přístup");
  assert.ok(!/body\.|request\.json/.test(src), "výjimka nesmí věřit ničemu z těla požadavku");
});

test("D: členství se čte z databáze, ne z požadavku", () => {
  const runLib = read("lib/game-run.ts");
  assert.match(runLib, /\.eq\("status", "accepted"\)/);
  assert.match(runLib, /child_game_session_players/);
});

test("D: herní endpointy předávají identitu hráče pro vyhodnocení výjimky", () => {
  for (const file of [
    "app/api/game/submit-task-answer/route.ts",
    "app/api/game/complete-location/route.ts",
    "app/api/game/location-progress/route.ts",
    "app/api/game/reset-location-replay/route.ts",
    "app/api/expeditions/finish/route.ts",
    "app/api/expeditions/start/route.ts"
  ]) {
    assert.match(read(file), /childProfileId: ownProfile\.id/, `${file} nepředává identitu hráče`);
  }
});

// ---------------------------------------------------------------------------
// E. Existující data
// ---------------------------------------------------------------------------

test("E: migrace nic nemaže a zachovává historii", () => {
  const sql = migration();
  assert.ok(!/drop table|truncate|delete from/i.test(sql), "migrace nesmí mazat data");
  assert.ok(!/update public\.child_location_progress[\s\S]*best_score/.test(sql), "nejlepší skóre se nepřepisuje");
  assert.ok(!/update public\.child_location_progress[\s\S]*first_completed_at =/.test(sql), "první dokončení se nepřepisuje");
  assert.match(sql, /from public\.child_task_progress tp[\s\S]*where tp\.session_id is null/, "historické odpovědi se přiřadí k dopočítané výpravě");
  assert.match(sql, /update public\.child_task_progress\s*\n\s*set session_id = new_run/);
});

test("E: historická výprava se odvozuje jen z existujících dat", () => {
  const sql = migration();
  assert.match(sql, /min\(tp\.first_answered_at\) as started_at/);
  assert.match(sql, /coalesce\(lp\.first_completed_at, lp\.completed_at, grp\.last_answered_at\)/);
  assert.match(sql, /'solo'/);
});

test("E: dokončená historická hra dá dokončenou výpravu, rozehraná zůstane rozehraná", () => {
  const sql = migration();
  assert.match(sql, /case when lp\.status = 'completed' or lp\.first_completed_at is not null then 'finished' else 'active' end/);
});

// ---------------------------------------------------------------------------
// F. Bezpečnost
// ---------------------------------------------------------------------------

test("F: čas dokončení neurčuje klient", () => {
  for (const file of ["app/api/game/complete-location/route.ts", "app/api/expeditions/finish/route.ts"]) {
    const src = read(file);
    assert.ok(!/new Date\(body\.completedAt\)/.test(src), `${file}: klient nesmí určovat čas dokončení`);
    assert.ok(!/completedAt: /.test(src) || !/body\.completedAt/.test(src), `${file}: completedAt z klienta se nesmí použít`);
  }
  assert.match(read("lib/game-completion.ts"), /const completedAt = new Date\(\)\.toISOString\(\);/);
});

test("F: neplatné tělo požadavku nedá 500", () => {
  for (const file of ["app/api/game/complete-location/route.ts", "app/api/expeditions/finish/route.ts"]) {
    assert.match(read(file), /request\.json\(\)\.catch\(\(\) => null\)/, `${file}: rozbité JSON musí skončit 400, ne 500`);
  }
});

test("F: výpadek tabulky rate limitu nezruší ochranu endpointu", () => {
  const lib = read("lib/rate-limit.ts");
  assert.match(lib, /export async function checkRateLimitSafe/);
  assert.match(lib, /return checkInMemoryRateLimit\(params\);/, "musí zůstat funkční záložní limiter");
  for (const file of [
    "app/api/game/submit-task-answer/route.ts",
    "app/api/game/complete-location/route.ts",
    "app/api/game/location-progress/route.ts",
    "app/api/game/reset-location-replay/route.ts",
    "app/api/expeditions/finish/route.ts",
    "app/api/expeditions/start/route.ts",
    "app/api/leaderboard/route.ts"
  ]) {
    const src = read(file);
    assert.match(src, /checkRateLimitSafe\(/, `${file} nepoužívá odolný rate limit`);
    assert.match(src, /rateLimit(Result)?\.allowed/, `${file} nevyhodnocuje výsledek rate limitu`);
  }
});

test("F: skóre ani počet pokusů z klienta nejsou autoritativní", () => {
  const submit = read("app/api/game/submit-task-answer/route.ts");
  assert.ok(!/currentAttempts = isReplayOfCompletedMission/.test(submit), "počet pokusů nesmí přijít z klienta");
  assert.match(submit, /const currentAttempts = Math\.max\(0, existingRow\?\.attempts \?\? 0\);/);
  const complete = read("app/api/game/complete-location/route.ts");
  assert.ok(!/body\.unknownTaskIds|body\.unknownCount|body\.penaltyPoints/.test(complete));
});

// ---------------------------------------------------------------------------
// Připravenost na R27–R29 (offline) – model, ne implementace
// ---------------------------------------------------------------------------

test("offline readiness: pozice se dopočítává z výsledků úkolů, neukládá se", () => {
  const progress = read("app/api/game/location-progress/route.ts");
  assert.ok(!/episode_index|task_index|current_step/.test(progress), "index obrazovky nesmí být zdrojem pravdy");
  const sql = migration();
  assert.ok(!/episode_index|task_index|current_step/.test(sql));
});

test("offline readiness: dvojice výprava + úkol je jednoznačný klíč zápisu", () => {
  const sql = migration();
  assert.match(sql, /child_profile_id, location_id, task_id, session_id/);
  const result = scoreTaskProgress(["a", "b"], [{ task_id: "a", status: "correct" }, { task_id: "a", status: "correct" }]);
  assert.equal(result.correctTasks, 1, "opakovaný zápis téže odpovědi nesmí zvýšit skóre");
  assert.equal(isMissionCompleted(result), false);
});
