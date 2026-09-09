import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// R22: zámek nesmí jít obejít žádnou zapisující cestou. Tento test hlídá, že každý
// endpoint, který zapisuje postup nebo body, volá serverové ověření přístupu.

const ROOT = path.resolve(import.meta.dirname, "..");

const PROTECTED = [
  "app/api/game/submit-task-answer/route.ts",
  "app/api/game/complete-location/route.ts",
  "app/api/game/location-progress/route.ts",
  "app/api/game/reset-location-replay/route.ts",
  "app/api/expeditions/start/route.ts",
  "app/api/expeditions/finish/route.ts"
];

test("všechny zapisující herní endpointy ověřují přístup na serveru", () => {
  for (const file of PROTECTED) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.match(src, /resolveServerGameAccess\(/, `${file} nevolá resolveServerGameAccess`);
    assert.match(src, /if \(!access\.allowed\)/, `${file} nevyhodnocuje výsledek`);
  }
});

test("ověření přístupu předchází zápisu do databáze", () => {
  for (const file of PROTECTED) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    const guard = src.indexOf("resolveServerGameAccess(");
    for (const write of [".insert(", ".upsert(", ".update("]) {
      const at = src.indexOf(write);
      if (at >= 0) {
        assert.ok(guard < at, `${file}: ${write} je před ověřením přístupu`);
      }
    }
  }
});

test("serverové ověření je fail-closed a nečte klientský vstup o zámku", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/game-access-server.ts"), "utf8");
  assert.match(src.replace(/\n/g, " "), /catch\s*{\s*return\s*{\s*allowed:\s*false/, "chyba musí znamenat zamčeno");
  assert.ok(!/body\.|request\.json/.test(src), "ověření nesmí věřit ničemu z těla požadavku");
});

test("migrace vynucuje prerequisite pouze ve stejném městě", () => {
  const dir = path.join(ROOT, "supabase/migrations");
  const file = fs.readdirSync(dir).find((name) => /missions_same_city_prerequisite\.sql$/.test(name));
  assert.ok(file, "migrace chybí");
  const sql = fs.readFileSync(path.join(dir, file!), "utf8");
  assert.match(sql, /unique \(id, city\)/);
  assert.match(sql, /foreign key \(unlock_after_mission_id, city\)/);
  assert.match(sql, /references public\.missions \(id, city\)/);
  assert.ok(!/drop table|delete from|truncate/i.test(sql), "migrace nesmí mazat data");
});

// Oprava před R23 (audit problém B): expedice nesmí odmítnout publikovanou DB hru
// jen proto, že není v lib/mock-data.ts, a finish nesmí bodovat podle mocku.
test("expeditions start/finish nepoužívají mock whitelist her", () => {
  for (const file of ["app/api/expeditions/start/route.ts", "app/api/expeditions/finish/route.ts"]) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.ok(!src.includes("@/lib/mock-data"), `${file} importuje mock-data`);
    assert.ok(!/locations\.(some|find|filter|map)\(/.test(src), `${file} používá mock whitelist`);
    assert.match(src, /resolveServerGameAccess\(/, `${file}: existenci hry musí určovat katalog přes R22 přístup`);
  }
});

test("expeditions finish boduje z DB úkolů hry, ne z mock scoringu", () => {
  const src = fs.readFileSync(path.join(ROOT, "app/api/expeditions/finish/route.ts"), "utf8");
  assert.ok(!src.includes("computeMissionScore"), "mock computeMissionScore musí být pryč");
  assert.ok(!src.includes("@/lib/scoring"), "finish nesmí importovat mock scoring");
  assert.match(src, /getLocationTaskIds\(missionId\)/);
  assert.match(src, /computeScoreFromTaskProgress\(/);
  assert.match(src, /buildTaskProgressFromClientInput\(/);
  // výchozí skóre se počítá až po ověření přístupu a session, nikdy před zámkem
  assert.ok(src.indexOf("resolveServerGameAccess(") < src.indexOf("getLocationTaskIds(missionId)"));
});
