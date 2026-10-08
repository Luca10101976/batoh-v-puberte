import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWalkthroughSteps, describeStep } from "./mission-walkthrough.ts";

// R54: průchod hrou očima hráče v Mozku a sdílené komponenty hry.

const cti = (c: string) => readFileSync(new URL(`../${c}`, import.meta.url), "utf8");
const stops = [
  { name: "Altán", tasks: [{ title: "Zubatá koruna" }, { title: "Vázy" }] },
  { name: "Chrámek", tasks: [{ title: "Hvězdy" }] },
  { name: "Socha", tasks: [{ title: "Materiál" }] }
];

test("P1: pořadí obrazovek jako ve hře – úvod, úkoly, přechody mezi zastaveními, závěr", () => {
  const kroky = buildWalkthroughSteps(stops).map((s) => describeStep(s, stops));
  assert.deepEqual(kroky, [
    "Úvod hry",
    "Altán · 1. Zubatá koruna",
    "Altán · 2. Vázy",
    "Přechod → Chrámek",
    "Chrámek · 1. Hvězdy",
    "Přechod → Socha",
    "Socha · 1. Materiál",
    "Závěr hry"
  ]);
});

test("P2: příchod na místo jen u prvního úkolu zastavení", () => {
  const ukoly = buildWalkthroughSteps(stops).filter((s) => s.kind === "task");
  assert.deepEqual(ukoly.map((s) => (s.kind === "task" ? s.firstOfStop : null)), [true, false, true, true]);
});

test("P3: po posledním zastavení není přechod, jde se rovnou na závěr", () => {
  const kroky = buildWalkthroughSteps(stops);
  assert.equal(kroky.at(-1)?.kind, "ending");
  assert.equal(kroky.at(-2)?.kind, "task");
});

test("P4: zastavení bez úkolu se v náhledu ukáže jako problém, ne potichu přeskočí", () => {
  const prazdne = [{ name: "Prázdné", tasks: [] as Array<{ title: string }> }];
  const kroky = buildWalkthroughSteps(prazdne);
  assert.deepEqual(kroky.map((s) => s.kind), ["intro", "empty-stop", "ending"]);
});

test("P5: hra i průchod v Mozku kreslí stejnými komponentami", () => {
  const hra = cti("components/play-screen.tsx");
  const pruchod = cti("components/admin/mission-walkthrough.tsx");
  for (const k of ["GameIntroCard", "StopArrival", "TaskPrompt", "StopTransitionCard", "EndingStory", "Bubliny"]) {
    assert.match(hra, new RegExp(`<${k}\\b`), `hra: ${k}`);
    assert.match(pruchod, new RegExp(`<${k}\\b`), `průchod: ${k}`);
  }
  assert.doesNotMatch(hra, /function Bubliny|function isExternalImage/, "hra nemá vlastní kopie");
});

test("P6: průchod nic neukládá – žádné volání API ani Supabase", () => {
  const pruchod = cti("components/admin/mission-walkthrough.tsx") + cti("app/admin/missions/[id]/hrat/page.tsx");
  assert.doesNotMatch(pruchod, /fetch\(|\/api\/|\.insert\(|\.update\(|\.delete\(|startRun|submitTaskAnswer/);
});

test("P7: průchod je v Mozku (za heslem) a dostupný ze stránky hry", () => {
  assert.match(cti("app/mozek/missions/[id]/hrat/page.tsx"), /@\/app\/admin\/missions\/\[id\]\/hrat\/page/);
  assert.match(cti("app/admin/missions/[id]/page.tsx"), /href=\{`\/mozek\/missions\/\$\{mission\.id\}\/hrat`\}/);
  assert.match(cti("middleware.ts"), /"\/mozek\/:path\*"/);
});

test("P8: správná odpověď se ukáže až na vyžádání", () => {
  const pruchod = cti("components/admin/mission-walkthrough.tsx");
  assert.match(pruchod, /const \[ukazat, setUkazat\] = useState\(false\)/);
  assert.match(pruchod, /setUkazat\(false\);/, "při přechodu na další obrazovku se odpověď zase skryje");
});
