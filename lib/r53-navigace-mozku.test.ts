import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// R53: Mozek má stálou hlavičku (Hry / Města) a drobečkovou cestu na každé stránce.

const cti = (c: string) => readFileSync(new URL(`../${c}`, import.meta.url), "utf8");
const layout = cti("app/admin/layout.tsx");
const hlavicka = cti("components/admin/mozek-header.tsx");
const drobecky = cti("components/admin/breadcrumbs.tsx");
const STRANKY = [
  "app/admin/missions/[id]/page.tsx",
  "app/admin/missions/[id]/preview/page.tsx",
  "app/admin/missions/new/page.tsx",
  "app/admin/stops/[id]/page.tsx",
  "app/admin/stops/new/page.tsx",
  "app/admin/cities/page.tsx",
  "app/admin/cities/[id]/page.tsx",
  "app/admin/cities/new/page.tsx"
];

test("N1: layout Mozku vykresluje stálou hlavičku", () => {
  assert.match(layout, /<MozekHeader \/>/);
  assert.match(hlavicka, /href: "\/mozek", label: "Hry"/);
  assert.match(hlavicka, /href: "\/mozek\/cities", label: "Města"/);
  assert.match(hlavicka, /aria-current=\{aktivni \? "page" : undefined\}/);
});

test("N2: každá stránka má drobečkovou cestu; první krok vede na Hry nebo Města", () => {
  for (const cesta of STRANKY) {
    const s = cti(cesta);
    assert.match(s, /<Breadcrumbs/, cesta);
    assert.match(s, /\{ label: "(Hry|Města)"/, cesta);
  }
});

test("N3: staré štítky „Mozek • …“ a tlačítka Zpět, která drobečky nahrazují, jsou pryč", () => {
  for (const cesta of [...STRANKY, "app/admin/missions/page.tsx"]) {
    const s = cti(cesta);
    assert.doesNotMatch(s, /Mozek • /, cesta);
    assert.doesNotMatch(s, />\s*Zpět( na misi)?\s*</, cesta);
  }
});

test("N4: zastavení ukazuje cestu Hry › hra › zastavení", () => {
  const s = cti("app/admin/stops/[id]/page.tsx");
  assert.match(s, /\{ label: mission\?\.title \?\? "Hra", href: `\/mozek\/missions\/\$\{stop\.mission_id\}` \}/);
  assert.match(s, /\{ label: stop\.title \}/);
});

test("N5: poslední drobeček není odkaz a je označený jako aktuální stránka", () => {
  assert.match(drobecky, /aria-current=\{posledni \? "page" : undefined\}/);
  assert.match(drobecky, /item\.href && !posledni \?/);
});
