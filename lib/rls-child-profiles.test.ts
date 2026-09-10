import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Bezpečnostní oprava: rekurze v politice RLS nad child_profiles.
//
// Testy hlídají výsledný stav migrací: vadná politika je pryč, ostatní tři
// zůstávají, a zámek zápisu z R26 se nerozvolnil. Kdyby někdo politiku vrátil
// (třeba dalším snapshotem z produkce), test to zachytí.

const ROOT = path.resolve(import.meta.dirname, "..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

/** Migrace v pořadí, v jakém je databáze dostane. */
function migrationsInOrder() {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS, name), "utf8") }));
}

/** Existuje politika po projití všech migrací, nebo ji některá pozdější zrušila? */
function policySurvives(policyName: string, table: string) {
  let alive = false;
  for (const { sql } of migrationsInOrder()) {
    // Hromadné rušení podle katalogu (R26) se týká jen zapisovacích politik.
    if (sql.includes(`drop policy if exists "${policyName}" on public.${table}`)) {
      alive = false;
    }
    if (sql.includes(`create policy "${policyName}" on public.${table}`)) {
      alive = true;
    }
  }
  return alive;
}

test("rekurzivní politika nad child_profiles je po migracích pryč", () => {
  assert.equal(
    policySurvives("parents read connected child profiles via friendships", "child_profiles"),
    false,
    "politika, která čte child_profiles sama ze sebe, se vrátila"
  );
});

test("vlastní přístup k profilu zůstává", () => {
  for (const policy of ["parents read own child profiles", "parents insert own child profiles"]) {
    assert.equal(policySurvives(policy, "child_profiles"), true, `chybí politika: ${policy}`);
  }
});

test("R33 – profil se z prohlížeče už nedá přepsat", () => {
  // Klientský UPDATE by obešel pravidla přezdívky, která vynucuje API.
  assert.equal(
    policySurvives("parents update own child profiles", "child_profiles"),
    false,
    "zapisovací politika nad child_profiles přežila"
  );
});

test("oprava ruší právě jednu politiku a nic nepřidává", () => {
  const fix = migrationsInOrder().find((m) => m.name.includes("drop_recursive_child_profiles_policy"));
  assert.ok(fix, "migrace opravy chybí");
  const statements = fix.sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  assert.equal((statements.match(/drop policy/gi) ?? []).length, 1);
  assert.equal((statements.match(/create policy/gi) ?? []).length, 0, "oprava nesmí přidat náhradní politiku");
  assert.ok(!/security definer/i.test(statements), "oprava nesmí zavést funkci se zvýšenými právy");
  assert.ok(!/create (or replace )?view/i.test(statements), "oprava nesmí zavést pohled");
  assert.ok(!/^alter table/im.test(statements), "oprava nesmí měnit strukturu");
  assert.ok(!/drop table|truncate|delete\s+from|^update /im.test(statements), "oprava nesmí sahat na data");
  assert.match(statements, /drop policy if exists/i, "rušení musí být bezpečné vůči opakovanému spuštění");
});

test("zámek zápisu z R26 zůstává: klient nesmí zapisovat postup ani výsledky", () => {
  for (const [table, policies] of [
    ["child_task_progress", ["parents insert own child task progress", "parents update own child task progress", "parents delete own child task progress"]],
    ["child_location_progress", ["parents insert own child location progress", "parents update own child location progress", "parents delete own child location progress"]]
  ] as const) {
    for (const policy of policies) {
      assert.equal(policySurvives(policy, table), false, `${table}: zapisovací politika ${policy} se vrátila`);
    }
    // Čtení vlastních řádků naopak zůstat má.
    assert.equal(policySurvives(`parents read own ${table === "child_task_progress" ? "child task progress" : "child location progress"}`, table), true);
  }
});

test("po všech migracích nezůstává politika, která čte tabulku, nad kterou sama je", () => {
  // Přesně tenhle tvar rekurzi způsobil. Hlídáme ho plošně, ne jen u profilů.
  // Historický snapshot 0002 takovou politiku obsahuje – rozhoduje ale výsledný
  // stav po všech migracích, protože ten dostane produkce.
  const selfReferencing: string[] = [];
  for (const { sql } of migrationsInOrder()) {
    for (const match of sql.matchAll(/create policy "([^"]+)" on public\.(\w+)([\s\S]*?);\n/g)) {
      const [, policy, table, body] = match;
      if (new RegExp(`(from|join)\\s+\\(?${table}\\b`, "i").test(body) && policySurvives(policy, table)) {
        selfReferencing.push(`${policy} (${table})`);
      }
    }
  }
  assert.deepEqual(selfReferencing, [], "tyhle politiky čtou samy sebe a způsobí 42P17");
});
