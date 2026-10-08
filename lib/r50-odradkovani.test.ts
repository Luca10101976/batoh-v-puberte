import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// R50: texty z Mozku se ve hře zobrazují s odřádkováním, jak je autor napsal.
// Dřív se dialog v závěru Klamovky slil do jednoho odstavce a nebylo poznat, kdo mluví.

const hra = readFileSync(new URL("../components/play-screen.tsx", import.meta.url), "utf8");

for (const pole of [
  "location.introStory",
  "activeEpisode.intro",
  "activeEpisode.background",
  "activeTask.content",
  "transitionText",
  "endingView.ending.endingStory",
  "endingView.ending.playerMessage"
]) {
  test(`O: ${pole} zachovává odřádkování`, () => {
    const radek = hra.split("\n").find((r) => r.includes(`>{${pole}}</p>`));
    assert.ok(radek, `${pole} se nevykresluje očekávaným způsobem`);
    assert.match(radek!, /whitespace-pre-line/);
  });
}
