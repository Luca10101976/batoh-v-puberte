import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getCanonicalCorrectAnswer, validateAndCanonicalizeCorrectAnswer } from "./mission-task-normalization.ts";
import { findPublishBlockers } from "./mission-publish-validation.ts";
import { isTaskAnswerCorrect } from "./answer-matching.ts";

// R49: výběr z možností smí mít víc správných možností – každou na samostatném řádku.

const MOZNOSTI = ["Ano", "Ne", "Možná v jiném vesmíru"];
const vyber = (correct_answer: string, options: unknown = MOZNOSTI, type: "vyber" | "ano-ne" = "vyber") => ({
  id: "t", type, question: "Přijdu včas?", correct_answer, options
});
const kanon = (odpoved: string, options: unknown = MOZNOSTI) => getCanonicalCorrectAnswer(vyber(odpoved, options));
const blokace = (odpoved: string, options: unknown = MOZNOSTI) =>
  findPublishBlockers([{ title: "Hřiště", tasks: [{ id: "t", type: "vyber", question: "Přijdu včas?", correctAnswer: odpoved, options, taskOrder: 1 }] }] as never)
    .map((i) => i.code);
// Hra dostává u výběru seznam správných možností – stejně jako buildTaskFromDb.
const hra = (odpoved: string) => {
  const k = kanon(odpoved);
  return { type: "choice", correctAnswers: k ? k.split("\n").filter(Boolean) : [] } as never;
};

test("V1: všechny tři možnosti jako správné → kanonicky tři řádky v pořadí zápisu", () => {
  assert.equal(kanon("Ano\nNe\nMožná v jiném vesmíru"), "Ano\nNe\nMožná v jiném vesmíru");
});

test("V2: řádky smějí být i čísla, malá písmena a Windows konce řádků", () => {
  assert.equal(kanon("1\r\n3"), "Ano\nMožná v jiném vesmíru");
  assert.equal(kanon("ano\nmožná v jiném vesmíru"), "Ano\nMožná v jiném vesmíru");
});

test("V3: opakovaná možnost se uloží jednou", () => {
  assert.equal(kanon("Ano\n1\nano"), "Ano");
});

test("V4: jeden řádek se chová přesně jako dřív (R45)", () => {
  assert.equal(kanon("Ne"), "Ne");
  assert.equal(kanon("2"), "Ne");
  const zvirata = ["Pávi a labutě", "Vlci, medvědi, kůň a brazilský ptáček", "Sloni a velbloudi"];
  assert.equal(kanon("Vlci, medvědi, kůň a brazilský ptáček", zvirata), "Vlci, medvědi, kůň a brazilský ptáček");
});

test("V5: čárka dál nedělí – „Ano, Ne\" není dvě odpovědi", () => {
  assert.equal(kanon("Ano, Ne"), null);
});

test("V6: řádek, který není možností, celou odpověď zneplatní (žádné odhady)", () => {
  assert.equal(kanon("Ano\nMožná"), null);
  assert.equal(kanon("Ano\n4"), null);
  assert.ok("error" in validateAndCanonicalizeCorrectAnswer(vyber("Ano\nMožná")));
});

test("V7: hra uzná kteroukoli správnou možnost a nic jiného", () => {
  const ukol = hra("Ano\nNe\nMožná v jiném vesmíru");
  for (const o of MOZNOSTI) assert.equal(isTaskAnswerCorrect(ukol, o), true, o);
  assert.equal(isTaskAnswerCorrect(ukol, "Možná"), false);
  const dveZTri = hra("Ano\nNe");
  assert.equal(isTaskAnswerCorrect(dveZTri, "Ne"), true);
  assert.equal(isTaskAnswerCorrect(dveZTri, "Možná v jiném vesmíru"), false);
});

test("V8: kontrola před publikací a hra říkají totéž", () => {
  for (const odpoved of ["Ano\nNe\nMožná v jiném vesmíru", "1\n2", "Ne", "Ano\nMožná", "Ano, Ne"]) {
    const blokuje = blokace(odpoved).includes("choice_answer_not_in_options");
    const resitelne = Boolean(kanon(odpoved));
    assert.equal(blokuje, !resitelne, odpoved);
  }
});

test("V9: Ano / ne zůstává s jedinou správnou odpovědí", () => {
  assert.equal(getCanonicalCorrectAnswer(vyber("Ano\nNe", ["Ano", "Ne"], "ano-ne")), null);
  assert.equal(getCanonicalCorrectAnswer(vyber("Ano", ["Ano", "Ne"], "ano-ne")), "Ano");
});

test("V10: hra dělí kanonickou odpověď jen u výběru, seřazení zůstává jedna odpověď", () => {
  const s = readFileSync(new URL("./gameplay-server.ts", import.meta.url), "utf8");
  assert.match(s, /task\.type === "vyber"\s*\?\s*canonicalDbAnswer\.split\("\\n"\)/);
  assert.match(s, /:\s*\[canonicalDbAnswer\]/);
});

test("V11: migrace mění jen větev výběru a vychází z produkční definice", () => {
  const m = readFileSync(new URL("../supabase/migrations/20261008120000_r49_vyber_vice_spravnych.sql", import.meta.url), "utf8");
  assert.match(m, /CREATE OR REPLACE FUNCTION public\.normalize_mission_task_correct_answer\(\)/);
  assert.match(m, /regexp_split_to_array\(new\.correct_answer, E'\\r\?\\n'\)/);
  assert.match(m, /cleaned_answers := '\{\}';\n    answer_values/);
  assert.match(m, /if new\.type = 'serad' then/, "větev seřazení zůstává");
  assert.match(m, /if new\.type = 'ano-ne' then/, "větev ano-ne zůstává");
  assert.doesNotMatch(m, /drop |delete from|truncate|update public/i);
});

test("V12: Mozek vysvětluje víc správných možností", () => {
  const f = readFileSync(new URL("../components/admin/task-form.tsx", import.meta.url), "utf8");
  assert.match(f, /každou na samostatný řádek/);
  assert.doesNotMatch(f, /ukládejte vždy jen jednu správnou možnost/);
});
