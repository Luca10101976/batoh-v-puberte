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
  "app/api/game/location-progress/route.ts"
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

// R42: testy „expeditions start/finish nepoužívají mock whitelist" a „expeditions
// finish boduje z DB úkolů" tady stály do R42. Hlídaly routy skupinových výprav,
// které R42 odstranilo (R34 zůstává produktově ODLOŽENO). Stejné pravidlo pro
// živou cestu dokončení hlídá test níž nad app/api/game/complete-location.
