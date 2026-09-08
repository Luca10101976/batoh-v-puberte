import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// R18: Traki nesbírá ani neuchovává věk hráče. Tento test hlídá, že se věk nevrátí
// do onboardingu, profilu, API ani aplikačního modelu (včetně "defaultního" věku).
const ROOT = path.resolve(import.meta.dirname, "..");
const SCAN_DIRS = ["app", "components", "lib"];
const FORBIDDEN = [/child_age/, /childAge/, /AGE_OPTIONS/, /invalid_child_age/, /Kolik ti je/];
const SELF = path.resolve(import.meta.dirname, "no-child-age.test.ts");

function walk(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && full !== SELF) {
      out.push(full);
    }
  }
  return out;
}

test("věk hráče (child_age / childAge) se nikde v aplikačním kódu nevyskytuje", () => {
  const files = SCAN_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
  assert.ok(files.length > 50, "scan musí projít reálný strom souborů");
  const hits: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN) {
      if (pattern.test(content)) hits.push(`${path.relative(ROOT, file)} :: ${pattern}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("onboarding v PlayerAuthGate neobsahuje žádný select ani text o věku", () => {
  const gate = fs.readFileSync(path.join(ROOT, "components/player-auth-gate.tsx"), "utf8");
  assert.ok(!/<select/.test(gate), "gate nesmí obsahovat <select> (dříve výběr věku)");
  assert.ok(!/\blet\b/.test(gate.replace(/\blet\s+[a-zA-Z_]/g, "")), "gate nesmí obsahovat text ' let' (věk)");
});

test("DB migrace odstraňuje sloupec child_age bez CASCADE a nedotýká se jiných sloupců", () => {
  const dir = path.join(ROOT, "supabase/migrations");
  const file = fs.readdirSync(dir).find((name) => /remove_child_age\.sql$/.test(name));
  assert.ok(file, "migrace *_remove_child_age.sql musí existovat");
  const sql = fs.readFileSync(path.join(dir, file!), "utf8");
  const statements = sql.replace(/--[^\n]*/g, "").split(";").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(statements, ["alter table public.child_profiles drop column if exists child_age"]);
});
