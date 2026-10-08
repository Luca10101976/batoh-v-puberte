import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// R51: postavy hry a bublina při příchodu na zastavení. Soubory s aliasem @/
// nejdou importovat, hlídá se proto zdroj.

const cti = (c: string) => readFileSync(new URL(`../${c}`, import.meta.url), "utf8");
const migrace = cti("supabase/migrations/20261008140000_r51_postavy_a_bubliny.sql");
const server = cti("lib/gameplay-server.ts");
const hra = cti("components/play-screen.tsx");
const formular = cti("components/admin/stop-form.tsx");
const akceZastaveni = cti("app/admin/stops/actions.ts");
const akcePostav = cti("app/admin/missions/character-actions.ts");
const spravce = cti("components/admin/character-manager.tsx");
const strankaHry = cti("app/admin/missions/[id]/page.tsx");
const typy = cti("lib/gameplay-types.ts");

test("B1: postavy patří ke hře a smažou se s ní", () => {
  assert.match(migrace, /create table if not exists public\.mission_characters/);
  assert.match(migrace, /mission_id uuid not null references public\.missions \(id\) on delete cascade/);
  assert.match(migrace, /char_length\(btrim\(name\)\) between 1 and 60/);
});

test("B2: tabulku čte jen server – RLS zapnuté, žádná politika", () => {
  assert.match(migrace, /alter table public\.mission_characters enable row level security/);
  assert.doesNotMatch(migrace, /create policy/i);
});

test("B3: postavu z jiné hry k zastavení přiřadit nejde; smazání bublinu jen odpojí", () => {
  assert.match(migrace, /foreign key \(bubble_character_id, mission_id\)\s+references public\.mission_characters \(id, mission_id\)\s+on delete set null \(bubble_character_id\)/);
  assert.match(migrace, /unique \(id, mission_id\)/);
});

test("B4: migrace jen přidává", () => {
  assert.doesNotMatch(migrace, /drop table|drop column|delete from|truncate|update public/i);
  assert.match(migrace, /add column if not exists bubble_character_id uuid/);
  assert.match(migrace, /add column if not exists bubble_text text/);
});

test("B5: hra ukáže bublinu jen s postavou i textem", () => {
  assert.match(server, /function buildBubble/);
  assert.match(server, /if \(!text \|\| !character\) \{\s*return undefined;/);
  assert.match(typy, /bubble\?: GameplayBubble/);
});

test("B6: hra funguje i bez migrace a postavy načítá jen když jsou potřeba", () => {
  assert.match(server, /\/bubble_\/i\.test\(stopsError\.message/);
  assert.match(server, /const usesBubbles = \(stopsData \?\? \[\]\)\.some/);
});

test("B7: bublina je při příchodu na zastavení, nad úkolem, s odřádkováním", () => {
  const i = hra.indexOf("isFirstTaskOfEpisode && activeEpisode.bubble");
  assert.ok(i > 0, "bublina se má ukázat jen u prvního úkolu zastavení");
  assert.ok(i < hra.indexOf("{activeTask.title}</h2>"), "bublina má být nad úkolem");
  assert.match(hra, /aria-label=\{`\$\{activeEpisode\.bubble\.name\} říká`\}/);
  assert.match(hra, /whitespace-pre-line text-\[15px\] leading-6">\{activeEpisode\.bubble\.text\}/);
});

test("B8: v Mozku jde u zastavení vybrat postavu a napsat text", () => {
  assert.match(formular, /name="bubble_character_id"/);
  assert.match(formular, /name="bubble_text"/);
  assert.match(formular, /— bez bubliny —/);
});

test("B9: bublina se uloží celá, nebo vůbec", () => {
  assert.match(akceZastaveni, /bubbleText && !bubbleCharacterId/);
  assert.match(akceZastaveni, /bubbleCharacterId && !bubbleText/);
  assert.match(akceZastaveni, /bubble_text: bubbleCharacterId \? bubbleText : null/);
});

test("B10: postavy se spravují na stránce hry – jméno i obrázek", () => {
  assert.match(strankaHry, /<CharacterManager/);
  assert.match(spravce, /name="name"/);
  assert.match(spravce, /fileInputName="image_file"/);
  assert.match(akcePostav, /uploadMissionCharacterImage/);
});

test("B11: postavu, která v bublině mluví, smazat nejde", () => {
  assert.match(akcePostav, /\.eq\("bubble_character_id", characterId\)/);
  assert.match(akcePostav, /status=delete_blocked/);
});
