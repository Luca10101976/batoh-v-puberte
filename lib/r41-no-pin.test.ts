import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// R41: Traki nemá PIN. Hráč se přihlašuje anonymním účtem + Traki klíčem (R17),
// starší účty e-mailem. Legacy PIN infrastruktura (sloupce pin_hash,
// pin_updated_at, pin_failed_attempts, pin_locked_until a tabulka pin_audit_log)
// byla mrtvá – nikdo do ní nezapisoval a u všech profilů byla prázdná.
//
// Tenhle test hlídá, že se nevrátí zpátky: ani jako čtení sloupce, ani jako
// odvozený příznak has_pin / hasPin v API nebo v klientském stavu.
const ROOT = path.resolve(import.meta.dirname, "..");
const SCAN_DIRS = ["app", "components", "lib"];

// Hlídáme konkrétní identifikátory, ne slovo "pin" – v kódu legitimně existuje
// ilustrace "pin" (mapová špendlíková značka) i slovo "pinning" v komentáři.
const FORBIDDEN = [
  /\bhas_pin\b/,
  /\bhasPin\b/,
  /\bpin_hash\b/,
  /\bpin_updated_at\b/,
  /\bpin_failed_attempts\b/,
  /\bpin_locked_until\b/,
  /\bpin_audit_log\b/
];

const SELF = path.resolve(import.meta.dirname, "r41-no-pin.test.ts");

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

test("žádná PIN struktura se nevyskytuje v aplikačním kódu", () => {
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

test("neexistuje žádný PIN endpoint", () => {
  const apiRoot = path.join(ROOT, "app/api");
  const routes = walk(apiRoot).map((file) => path.relative(ROOT, file));
  const pinRoutes = routes.filter((route) => /\/pin(\/|$)/.test(route));
  assert.deepEqual(pinRoutes, []);
});

// R41 NESMÍ sáhnout na současný auth model. Tyhle testy proto hlídají i opačný
// směr: co po úklidu PINu musí zůstat.
test("přihlášení starším e-mailovým účtem zůstává funkční", () => {
  const login = fs.readFileSync(path.join(ROOT, "app/api/auth/login/route.ts"), "utf8");
  assert.match(login, /signInWithPassword/, "login route musí dál umět e-mail + heslo");
  assert.match(login, /contact_email/, "login route musí dál pracovat s contact_email");
});

test("parent_user_id zůstává vlastnickým sloupcem profilu", () => {
  const files = SCAN_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
  const owners = files.filter((file) => /parent_user_id/.test(fs.readFileSync(file, "utf8")));
  assert.ok(owners.length >= 10, "parent_user_id je nosný sloupec vlastnictví profilu, nesmí zmizet");
});

test("Traki recovery klíč zůstává nedotčený", () => {
  const recovery = path.join(ROOT, "app/api/recovery-key");
  assert.ok(fs.existsSync(recovery), "recovery-key API musí existovat");
  const routes = walk(recovery).map((file) => path.relative(ROOT, file));
  assert.ok(
    routes.some((route) => /create\/route\.ts$/.test(route)) && routes.some((route) => /redeem\/route\.ts$/.test(route)),
    "recovery-key musí mít dál create i redeem"
  );
});

test("R41 migrace ruší jen PIN struktury a nic jiného", () => {
  const dir = path.join(ROOT, "supabase/migrations");
  const file = fs.readdirSync(dir).find((name) => /r41_drop_pin_infrastructure\.sql$/.test(name));
  assert.ok(file, "migrace *_r41_drop_pin_infrastructure.sql musí existovat");
  const sql = fs.readFileSync(path.join(dir, file!), "utf8");
  // Středník uvnitř textu komentáře není konec příkazu – dělíme mimo apostrofy.
  const statements: string[] = [];
  let buffer = "";
  let inString = false;
  for (const char of sql.replace(/--[^\n]*/g, "")) {
    if (char === "'") inString = !inString;
    if (char === ";" && !inString) {
      if (buffer.trim()) statements.push(buffer.trim().replace(/\s+/g, " "));
      buffer = "";
      continue;
    }
    buffer += char;
  }
  if (buffer.trim()) statements.push(buffer.trim().replace(/\s+/g, " "));

  assert.deepEqual(statements, [
    "alter table public.child_profiles drop column if exists pin_hash",
    "alter table public.child_profiles drop column if exists pin_updated_at",
    "alter table public.child_profiles drop column if exists pin_failed_attempts",
    "alter table public.child_profiles drop column if exists pin_locked_until",
    "drop table if exists public.pin_audit_log",
    "comment on column public.child_profiles.parent_user_id is 'parent_user_id represents the Supabase auth.users owner of the player profile; the legacy column name does not imply a current parent-account model.'"
  ]);

  assert.ok(!/cascade/i.test(sql), "migrace nesmí použít CASCADE");
  const touchesOwner = statements.filter(
    (statement) => /parent_user_id/i.test(statement) && !/^comment on column/i.test(statement)
  );
  assert.deepEqual(touchesOwner, [], "migrace nesmí sahat na parent_user_id jinak než komentářem");
  assert.deepEqual(
    statements.filter((statement) => /contact_email|recovery_key/i.test(statement)),
    [],
    "migrace se nesmí dotknout e-mailu ani Traki klíče"
  );
});

test("historické migrace zůstávají nezměněné", () => {
  const dir = path.join(ROOT, "supabase/migrations");
  const baseline = fs.readFileSync(path.join(dir, "0001_baseline.sql"), "utf8");
  assert.match(baseline, /pin_hash/, "0001_baseline.sql musí zůstat historicky netknutá");
  const snapshot = fs.readFileSync(path.join(dir, "0002_production_snapshot_2026-09-07.sql"), "utf8");
  assert.match(snapshot, /pin_audit_log/, "0002_production_snapshot musí zůstat historicky netknutá");
});
