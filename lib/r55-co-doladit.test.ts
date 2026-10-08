import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findMissionWarnings, type WarningInput } from "./mission-warnings.ts";

// R55: „Co ještě doladit“ – mezery v obsahu, které nebrání publikaci.

const plna: WarningInput = {
  mission: { heroImageUrl: "x", shortDescription: "x", startPlaceName: "x", endingTitle: "x", endingText: "x", endingBubbleCount: 0 },
  stops: [
    { id: "a", title: "Altán", description: "x", imageUrl: "x", transitionText: "x", bubbleCount: 1, tasks: [{ hasHint: true }] },
    { id: "b", title: "Socha", description: "x", imageUrl: "x", transitionText: "", bubbleCount: 1, tasks: [{ hasHint: true }] }
  ]
};
const kody = (i: WarningInput) => findMissionWarnings(i, "m").map((w) => w.code);

test("W1: hotová hra nemá žádné varování; poslední zastavení přechod nepotřebuje", () => {
  assert.deepEqual(kody(plna), []);
});

test("W2: chybějící fotka se slučuje do jednoho řádku s odkazem na každé zastavení", () => {
  const vstup = structuredClone(plna);
  vstup.stops[0].imageUrl = "";
  vstup.stops[1].imageUrl = null;
  const w = findMissionWarnings(vstup, "m");
  assert.equal(w.length, 1);
  assert.equal(w[0].text, "2 zastavení nemají fotku.");
  assert.deepEqual(w[0].links.map((l) => l.href), ["/mozek/stops/a", "/mozek/stops/b"]);
});

test("W3: nápověda – jeden souhrnný řádek, ne řádek za úkol", () => {
  const vstup = structuredClone(plna);
  vstup.stops[0].tasks = [{ hasHint: false }, { hasHint: false }, { hasHint: true }];
  vstup.stops[1].tasks = [{ hasHint: false }];
  const w = findMissionWarnings(vstup, "m").filter((x) => x.code === "task_hint");
  assert.equal(w.length, 1);
  assert.equal(w[0].text, "3 z 4 úkolů nemá nápovědu – hráč může jen hádat, nebo dát „Nevím“.");
});

test("W4: hra úplně bez bublin je volba, ne mezera; chybějící bublina jen když jinde jsou", () => {
  const zadne = structuredClone(plna);
  zadne.stops.forEach((s) => (s.bubbleCount = 0));
  assert.ok(!kody(zadne).includes("stop_bubble"));
  const nekde = structuredClone(plna);
  nekde.stops[1].bubbleCount = 0;
  assert.ok(kody(nekde).includes("stop_bubble"));
});

test("W5: závěr chybí, jen když není titulek, text ani bubliny", () => {
  const vstup = structuredClone(plna);
  vstup.mission.endingTitle = "";
  vstup.mission.endingText = "";
  assert.ok(kody(vstup).includes("ending"));
  vstup.mission.endingBubbleCount = 3;
  assert.ok(!kody(vstup).includes("ending"));
});

test("W6: varování nikdy neblokují publikaci – nejsou v kontrole dohratelnosti", () => {
  const validace = readFileSync(new URL("./mission-publish-validation.ts", import.meta.url), "utf8");
  assert.doesNotMatch(validace, /mission-warnings|findMissionWarnings/);
  const akce = readFileSync(new URL("../app/admin/missions/actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(akce, /findMissionWarnings/);
});

test("W7: stránka hry seznam ukazuje", () => {
  const stranka = readFileSync(new URL("../app/admin/missions/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(stranka, /<MissionWarnings warnings=\{warnings\} \/>/);
});
