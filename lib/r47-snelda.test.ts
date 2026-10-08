import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// R47: papírová verze hry je Šneldina. Adresa je vlastnost konkrétní hry,
// komponenty nejdou importovat (alias @/), takže se kontroluje zdroj.

const cti = (cesta: string) => readFileSync(new URL(`../${cesta}`, import.meta.url), "utf8");

const migrace = cti("supabase/migrations/20261007130000_r47_print_url.sql");
const typy = cti("lib/gameplay-types.ts");
const server = cti("lib/gameplay-server.ts");
const detail = cti("components/location-detail-screen.tsx");
const domu = cti("components/home-screen.tsx");
const formular = cti("components/admin/mission-form.tsx");
const akce = cti("app/admin/missions/actions.ts");

test("K1: migrace přidává sloupec print_url a nic nemaže", () => {
  assert.match(migrace, /add column if not exists print_url text/);
  assert.doesNotMatch(migrace, /drop column|drop table|delete from|truncate/i);
});

test("K2: hra nese odkaz na papírovou verzi", () => {
  assert.match(typy, /printUrl\?: string \| null;/);
});

test("K3: server čte sloupec z databáze a předává ho ven", () => {
  assert.match(server, /print_url\?: string \| null;/);
  assert.match(server, /printUrl: \(mission\.print_url \?\? ""\)\.trim\(\) \|\| null/);
  // musí být i ve výběru sloupců, jinak by dorazila vždy prázdná hodnota
  const vybery = server.match(/select\(\s*"[^"]*print_url[^"]*"/g) ?? [];
  assert.ok(vybery.length >= 1, "print_url chybí ve výběru sloupců");
});

test("K4: prázdná adresa se chová, jako by papírová verze nebyla", () => {
  assert.match(detail, /function externalLinkOrNull/);
  assert.match(detail, /\^https\?:/);
  assert.match(detail, /const printUrl = externalLinkOrNull\(location\.printUrl\)/);
});

test("K5: s odkazem na Šneldu se tiskové PDF nenabízí", () => {
  const zacatek = detail.indexOf("{printUrl ? (");
  const vetev = detail.slice(zacatek, detail.indexOf(") : (", zacatek));
  assert.ok(vetev.includes("href={printUrl}"), "odkaz nevede na adresu z databáze");
  assert.ok(!vetev.includes("format=pdf"), "ve větvi se Šneldou nesmí být stahování PDF");
});

test("K6: hra bez papírové verze si tiskové PDF stáhne jako dosud", () => {
  assert.match(detail, /format=pdf&locationId=\$\{location\.id\}/);
});

test("K7: odkazy ven jsou bezpečné", () => {
  // Každý odkaz do nového okna musí mít rel, který odřízne přístup k původnímu
  // oknu. „noreferrer" to v prohlížečích obnáší taky, proto se uznává obojí.
  for (const [jmeno, zdroj] of [["detail", detail], ["domu", domu]] as const) {
    const blank = (zdroj.match(/target="_blank"/g) ?? []).length;
    const chranene = (zdroj.match(/rel="(?:noopener noreferrer|noreferrer|noopener)"/g) ?? []).length;
    assert.ok(blank > 0, `${jmeno}: očekává se aspoň jeden odkaz ven`);
    assert.equal(chranene, blank, `${jmeno}: každý odkaz do nového okna musí mít ochranný rel`);
  }
});

test("K8: Mozek umí adresu nastavit u každé hry zvlášť", () => {
  assert.match(formular, /name="print_url"/);
  assert.match(formular, /snelda\.cz\/hra\/klamovka/);
  assert.match(akce, /formData\.get\("print_url"\)/);
  assert.match(akce, /print_url: printUrl/);
});

test("K9: adresa se nikde v kódu nevypaluje natvrdo podle hry", () => {
  for (const [jmeno, zdroj] of [["detail", detail], ["server", server]] as const) {
    assert.doesNotMatch(zdroj, /snelda\.cz\/hra\//, `${jmeno} nesmí mít adresu konkrétní hry`);
  }
});

test("K10: úvodní stránka říká, že Traki je Šneldova kamarádka", () => {
  assert.match(domu, /Traki a Šnelda/);
  assert.match(domu, /kamarádka/);
  assert.match(domu, /href="https:\/\/snelda\.cz"/);
});
