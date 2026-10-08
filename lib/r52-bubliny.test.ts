import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// R52: bubliny postav – jedna tabulka pro zastavení, úkoly i závěr; Traki vždy k dispozici.
// Soubory s aliasem @/ nejdou importovat, hlídá se proto zdroj.

const cti = (c: string) => readFileSync(new URL(`../${c}`, import.meta.url), "utf8");
const migrace51 = cti("supabase/migrations/20261008140000_r51_postavy_a_bubliny.sql");
const migrace = cti("supabase/migrations/20261008160000_r52_bubliny.sql");
const server = cti("lib/gameplay-server.ts");
const hra = cti("components/play-screen.tsx");
const ui = cti("components/game/game-ui.tsx");
const typy = cti("lib/gameplay-types.ts");
const akce = cti("app/admin/missions/bubble-actions.ts");
const editor = cti("components/admin/bubble-editor.tsx");
const strankaZastaveni = cti("app/admin/stops/[id]/page.tsx");
const strankaHry = cti("app/admin/missions/[id]/page.tsx");
const nahled = cti("app/admin/missions/[id]/preview/page.tsx");
const akceZastaveni = cti("app/admin/stops/actions.ts");
const formularZastaveni = cti("components/admin/stop-form.tsx");
const verejne = cti("lib/gameplay-public.ts");

test("B1: jedna tabulka bublin; umístění je právě jedno (zastavení / úkol / závěr)", () => {
  assert.match(migrace, /create table if not exists public\.mission_bubbles/);
  assert.match(migrace, /target_type = 'stop' and stop_id is not null and task_id is null/);
  assert.match(migrace, /target_type = 'task' and task_id is not null and stop_id is null/);
  assert.match(migrace, /target_type = 'ending' and stop_id is null and task_id is null/);
});

test("B2: postava musí být z téže hry a dokud mluví, nejde smazat (žádné SET NULL)", () => {
  assert.match(migrace, /foreign key \(character_id, mission_id\) references public\.mission_characters \(id, mission_id\)\n\);/);
  assert.doesNotMatch(migrace, /mission_bubbles_character_fk[\s\S]*on delete set null/);
});

test("B3: RLS zapnuté bez politik; bubliny mizí se zastavením, úkolem i hrou", () => {
  assert.match(migrace, /alter table public\.mission_bubbles enable row level security/);
  assert.doesNotMatch(migrace, /create policy/i);
  assert.equal((migrace.match(/on delete cascade/g) ?? []).length, 3);
});

test("B4: přesun z R51 je idempotentní, počet se ověří a teprve pak se staré sloupce zruší", () => {
  const kopie = migrace.indexOf("insert into public.mission_bubbles");
  const kontrola = migrace.indexOf("raise exception 'R52");
  const drop = migrace.indexOf("drop column if exists bubble_character_id");
  assert.ok(kopie > 0 && kontrola > kopie && drop > kontrola, "pořadí: kopie → kontrola → drop");
  assert.match(migrace, /and not exists \(select 1 from public\.mission_bubbles b where b\.stop_id = s\.id/);
  assert.match(migrace51, /bubble_character_id/, "R51 zůstává v historii nezměněná");
});

test("B5: NULL mluvčí = Traki; bublina neexistující postavy se neukáže", () => {
  assert.match(server, /const TRAKI_SPEAKER = \{ name: "Traki", image: "\/icons\/traki-transparent\.png" \}/);
  assert.match(server, /if \(!row\.character_id\) \{\s*vysledek\.push\(\{ \.\.\.TRAKI_SPEAKER, text \}\);/);
  assert.match(server, /if \(!character\) continue;/);
});

test("B6: závěrové bubliny jsou spoiler – jen přes getGameplayEnding, ne v obsahu hry pro prohlížeč", () => {
  assert.match(server, /bubbles\.filter\(\(b\) => b\.target_type !== "ending"\)/);
  const zaver = server.slice(server.indexOf("export async function getGameplayEnding"), server.indexOf("export async function getMissionEndingBubbles"));
  assert.match(zaver, /target_type === "ending"/);
  assert.match(verejne, /SERVER_ONLY_LOCATION_FIELDS/);
  assert.match(typy, /bubbles\?: GameplayBubble\[\];\n\};/, "GameplayEnding.bubbles");
});

test("B7: ve hře jedna komponenta bublin na třech místech – zastavení, úkol, závěr", () => {
  // R54: Bubliny žijí ve sdílených komponentách; hra je skládá.
  assert.match(ui, /export function Bubliny\(\{ bubliny \}: \{ bubliny\?: GameplayBubble\[\] \}\)/);
  assert.match(ui, /\{showContext \? <Bubliny bubliny=\{stop\.bubbles\} \/> : null\}/, "bubliny zastavení jen při příchodu");
  assert.match(hra, /showContext=\{isFirstTaskOfEpisode\}/);
  assert.match(hra, /<Bubliny bubliny=\{activeTask\.bubbles\} \/>/);
  assert.match(ui, /<Bubliny bubliny=\{bubbles\} \/>/, "závěr");
  assert.match(hra, /bubbles=\{endingView\.ending\?\.bubbles\}/);
  assert.ok(hra.indexOf("<Bubliny bubliny={activeTask.bubbles} />") < hra.indexOf("<TaskPrompt task={activeTask} />"), "bublina úkolu je nad zadáním");
});

test("B8: Mozek – editor u zastavení, u každého úkolu a v závěru hry; Traki první volba", () => {
  assert.equal((strankaZastaveni.match(/<BubbleEditor/g) ?? []).length, 2);
  assert.match(strankaHry, /target=\{\{ type: "ending" \}\}/);
  assert.match(editor, /<option value="">Traki<\/option>/);
});

test("B9: akce ověří, že zastavení/úkol patří ke hře, a návrat jde jen do Mozku", () => {
  assert.match(akce, /async function targetBelongsToMission/);
  assert.match(akce, /mission_stops!inner\(mission_id\)/);
  assert.match(akce, /\^\\\/mozek\\\//);
  assert.match(akce, /text\.length > MAX_TEXT/);
});

test("B10: po R52 nezůstal nikde starý model bubliny z R51", () => {
  for (const [n, s] of [["stops/actions", akceZastaveni], ["stop-form", formularZastaveni], ["server", server], ["stránka zastavení", strankaZastaveni]] as const) {
    assert.doesNotMatch(s, /bubble_character_id|bubble_text|hasBubbleFields/, n);
  }
  assert.doesNotMatch(typy, /bubble\?: GameplayBubble;/);
});

test("B11: náhled v Mozku ukazuje bubliny zastavení, úkolů i závěru", () => {
  assert.equal((nahled.match(/<NahledBublin /g) ?? []).length, 3);
});
