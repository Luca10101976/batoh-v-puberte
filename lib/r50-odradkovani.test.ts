import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// R50: texty z Mozku se ve hře zobrazují s odřádkováním, jak je autor napsal.
// Dřív se dialog v závěru Klamovky slil do jednoho odstavce a nebylo poznat, kdo mluví.
// R54: kreslí je sdílené komponenty (hra i průchod v Mozku) – hlídá se tam.

const ui = readFileSync(new URL("../components/game/game-ui.tsx", import.meta.url), "utf8");
const hra = readFileSync(new URL("../components/play-screen.tsx", import.meta.url), "utf8");

for (const [pole, vyraz] of [
  ["úvod hry", "introStory"],
  ["uvedení zastavení", "stop.intro"],
  ["historie zastavení", "stop.background"],
  ["zadání úkolu", "task.content"],
  ["přechod", "text"],
  ["závěrečný příběh", "story"],
  ["zpráva pro hráče", "playerMessage"],
  ["bublina", "bublina.text"]
]) {
  test(`O: ${pole} zachovává odřádkování`, () => {
    const radek = ui.split("\n").find((r) => r.includes(`>{${vyraz}}</p>`));
    assert.ok(radek, `${pole} se nevykresluje očekávaným způsobem`);
    assert.match(radek!, /whitespace-pre-line/);
  });
}

test("O: hra všechny tyhle texty kreslí sdílenými komponentami", () => {
  for (const komponenta of ["<GameIntroCard", "<StopArrival", "<TaskPrompt", "<StopTransitionCard", "<EndingStory"]) {
    assert.ok(hra.includes(komponenta), komponenta);
  }
});
