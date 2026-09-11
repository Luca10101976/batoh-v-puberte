import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// R42: Traki má jediný hráčský auth model – anonymní účet Supabase + Traki klíč (R17).
// E-mail ani heslo v něm neexistují: žádné přihlášení e-mailem, žádný reset hesla,
// žádná signup routa, žádný contact_email. Legacy cesta zanikla poté, co po R43
// nezůstal jediný účet, který by ji používal.
//
// Tenhle test hlídá oba směry: že se e-mailové přihlášení nevrátí a že současný
// Traki model po úklidu zůstal celý.
const ROOT = path.resolve(import.meta.dirname, "..");
const SCAN_DIRS = ["app", "components", "lib"];

const FORBIDDEN = [
  /signInWithPassword/,
  /resetPasswordForEmail/,
  /\bcontact_email\b/,
  /\/api\/auth\/login/,
  /\/api\/auth\/signup/,
  /\/auth\/callback/,
  /\/auth\/reset/,
  /Mám starší účet/,
  /Zapomenuté heslo/
];

// Prohledáváme PRODUKČNÍ kód, ne testy. Testy tyhle řetězce legitimně obsahují
// v opačném tvrzení – například r41-no-pin.test.ts hlídá, že se migrace R41
// contact_email nedotkla. Zákaz se týká živého kódu, ne textu tvrzení o něm.
function walk(dir: string, out: string[] = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

test("e-mailové přihlášení ani contact_email se nevyskytují v aplikačním kódu", () => {
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

test("legacy auth routy a stránky neexistují", () => {
  for (const dead of [
    "app/api/auth/login",
    "app/api/auth/signup",
    "app/auth/reset",
    "app/auth/callback"
  ]) {
    assert.ok(!fs.existsSync(path.join(ROOT, dead)), `${dead} musí být pryč`);
  }
});

test("přihlašovací obrazovka nabízí jen Traki cesty", () => {
  const gate = fs.readFileSync(path.join(ROOT, "components/player-auth-gate.tsx"), "utf8");
  assert.match(gate, /signInAnonymously/, "nový hráč musí vznikat anonymním účtem");
  assert.match(gate, /\/api\/recovery-key\/create/, "nový hráč musí dostat Traki klíč");
  assert.match(gate, /\/api\/recovery-key\/redeem/, "obnova musí jít Traki klíčem");
  assert.ok(!/type="password"/.test(gate), "gate nesmí mít pole pro heslo");
  assert.ok(!/type="email"/.test(gate), "gate nesmí mít pole pro e-mail");
  assert.ok(!/autoComplete="(email|current-password|new-password)"/.test(gate), "gate nesmí nabízet doplnění e-mailu ani hesla");
});

test("Traki recovery infrastruktura zůstává nedotčená", () => {
  for (const keep of [
    "app/api/recovery-key/create/route.ts",
    "app/api/recovery-key/redeem/route.ts",
    "lib/recovery-key.ts",
    "lib/recovery-key-server.ts"
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, keep)), `${keep} musí existovat`);
  }
  const redeem = fs.readFileSync(path.join(ROOT, "app/api/recovery-key/redeem/route.ts"), "utf8");
  assert.match(redeem, /generateLink/, "obnova musí dál stavět na magic linku");
  assert.match(redeem, /recovery_key_hash/, "obnova musí dál hledat podle hashe klíče");
});

test("parent_user_id zůstává vlastnickým sloupcem profilu", () => {
  const files = SCAN_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
  const owners = files.filter((file) => /parent_user_id/.test(fs.readFileSync(file, "utf8")));
  assert.ok(owners.length >= 10, "parent_user_id je nosný sloupec vlastnictví profilu, nesmí zmizet");
});

test("R42 migrace ruší jen contact_email a jeho index", () => {
  const dir = path.join(ROOT, "supabase/migrations");
  const file = fs.readdirSync(dir).find((name) => /r42_drop_contact_email\.sql$/.test(name));
  assert.ok(file, "migrace *_r42_drop_contact_email.sql musí existovat");
  const sql = fs.readFileSync(path.join(dir, file!), "utf8");
  const statements = sql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((statement) => statement.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  assert.deepEqual(statements, [
    "drop index if exists public.idx_child_profiles_contact_email",
    "alter table public.child_profiles drop column if exists contact_email"
  ]);

  assert.ok(!/cascade/i.test(sql), "migrace nesmí použít CASCADE");
  assert.deepEqual(
    statements.filter((statement) => /parent_user_id|recovery_key|child_name|profile_code|player_code/i.test(statement)),
    [],
    "migrace se nesmí dotknout vlastnictví, Traki klíče ani identity hráče"
  );
});

test("historické migrace zůstávají nezměněné", () => {
  const baseline = fs.readFileSync(path.join(ROOT, "supabase/migrations/0001_baseline.sql"), "utf8");
  assert.match(baseline, /contact_email/, "0001_baseline.sql musí zůstat historicky netknutá");
});
