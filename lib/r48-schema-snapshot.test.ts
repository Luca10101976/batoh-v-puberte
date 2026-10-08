import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// R48: snímek skutečného produkčního schématu a kontrola driftu.
// Testy jsou offline – hlídají obsah souborů, ne produkci (tu hlídá npm run schema:verify).

const cti = (c: string) => readFileSync(new URL(`../${c}`, import.meta.url), "utf8");
const snimek = cti("supabase/schema.sql");
const snapshot = cti("scripts/snapshot-schema.mjs");
const verify = cti("scripts/verify-schema-drift.mjs");
const pkg = JSON.parse(cti("package.json"));

const TABULKY = ["child_friendships","child_game_session_players","child_game_sessions","child_location_progress","child_profiles",
  "child_task_progress","cities","mission_stops","mission_tasks","missions","panbatoh_content","rate_limits"];

test("S1: snímek popisuje všech 12 produkčních tabulek", () => {
  for (const t of TABULKY) assert.match(snimek, new RegExp(`^create table public\\.${t} \\(`, "m"), t);
  assert.equal((snimek.match(/^create table public\./gm) ?? []).length, 12);
});

test("S2: snímek nese to, co migrace nepopisují (nález auditu 8. 10. 2026)", () => {
  // sloupce, které baseline nezná
  for (const s of ["best_score", "completion_source", "first_completed_at", "first_answered_at", "last_answered_at"]) assert.ok(snimek.includes(s), s);
  // spouštěče a funkce mimo migrace
  assert.match(snimek, /trg_child_location_progress_updated_at/);
  assert.match(snimek, /set_child_location_progress_updated_at/);
  // CHECK omezení s přesným zněním
  assert.match(snimek, /missions_difficulty_check CHECK/);
  assert.match(snimek, /mission_tasks_type_check CHECK \(\(type = ANY \(ARRAY\['otevrena'::text, 'vyber'::text, 'ano-ne'::text, 'serad'::text\]\)\)\)/);
  // R47
  assert.match(snimek, /print_url text/);
});

test("S3: snímek obsahuje RLS pro všechny tabulky a přesně 10 politik", () => {
  for (const t of TABULKY) assert.match(snimek, new RegExp(`^alter table public\\.${t} enable row level security;`, "m"), t);
  assert.equal((snimek.match(/^create policy /gm) ?? []).length, 10);
  // zápis do herního stavu z prohlížeče je uzavřený (R26) – žádná insert/update politika na postupu
  assert.doesNotMatch(snimek, /create policy "[^"]*" on public\.child_task_progress as permissive for (insert|update|delete)/);
});

test("S4: snímek je označený jako nespustitelný a nic nevymýšlí", () => {
  assert.match(snimek, /NESPOUŠTĚT NA PRODUKCI/);
  assert.match(snimek, /Vygenerováno skriptem scripts\/snapshot-schema\.mjs/);
  assert.match(snimek, /CO TU NENÍ/);
});

test("S5: žádný z nových souborů neobsahuje přístupové údaje", () => {
  for (const [n, s] of [["schema.sql", snimek], ["snapshot", snapshot], ["verify", verify]] as const) {
    assert.doesNotMatch(s, /eyJ[A-Za-z0-9_-]{20,}/, `${n}: JWT`);
    assert.doesNotMatch(s, /sbp_[a-f0-9]{20,}/, `${n}: access token`);
    assert.doesNotMatch(s, /postgres(ql)?:\/\/[^\s]*:[^\s]*@/, `${n}: connection string`);
  }
});

test("S6: snímek se bere jen z katalogu v čistě čtecí transakci", () => {
  assert.match(snapshot, /read_only: true/);
  assert.match(snapshot, /transaction_read_only/);
  assert.match(snapshot, /SUPABASE_ACCESS_TOKEN/);
  // Generátor DDL pochopitelně píše „create table" – hlídá se, že se nic NESPOUŠTÍ:
  // jediný koncový bod a ten výhradně v režimu read_only.
  const volani = snapshot.match(/fetch\(/g) ?? [];
  assert.equal(volani.length, 1, "jediné síťové volání");
  assert.match(snapshot, /database\/query/);
  assert.equal((snapshot.match(/JSON\.stringify\(\{ query, read_only: true \}\)/g) ?? []).length, 1);
  for (const f of ["pg_get_constraintdef", "pg_get_functiondef", "pg_get_triggerdef", "pg_policies", "pg_indexes"]) assert.ok(snapshot.includes(f), f);
});

test("S7: kontrola driftu jen čte a nezná účtový token", () => {
  assert.match(verify, /\/rest\/v1\//);
  assert.doesNotMatch(verify, /api\.supabase\.com|access-token|SUPABASE_ACCESS_TOKEN/);
  assert.match(verify, /process\.exit\(1\)/);
  assert.match(verify, /process\.exit\(2\)/);
});

test("S8: oba skripty jsou dostupné přes npm", () => {
  assert.equal(pkg.scripts["schema:snapshot"], "node scripts/snapshot-schema.mjs");
  assert.equal(pkg.scripts["schema:verify"], "node scripts/verify-schema-drift.mjs");
});
