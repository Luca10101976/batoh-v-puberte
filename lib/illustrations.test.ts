import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ILLUSTRATION_NAMES, illustrationSrc } from "./illustrations.ts";

test("ke každé ilustraci existuje soubor a cesta vede do veřejné složky", () => {
  const root = path.resolve(import.meta.dirname, "..");
  assert.equal(ILLUSTRATION_NAMES.length, 14);
  for (const name of ILLUSTRATION_NAMES) {
    const src = illustrationSrc(name);
    assert.match(src, /^\/illustrations\/traki\/[a-z]+\.webp$/, name);
    assert.ok(fs.existsSync(path.join(root, "public", src)), `chybí soubor pro ${name}`);
  }
});

test("stavy schváleného mapování jsou pokryté", () => {
  for (const required of ["zamek", "hvezda", "otaznik", "pokrceni", "pohar", "konfety", "rozcestnik", "mapa", "pin", "bezici", "blok", "zarovka", "sos", "batoh"]) {
    assert.ok(ILLUSTRATION_NAMES.includes(required as never), `chybí ${required}`);
  }
});
