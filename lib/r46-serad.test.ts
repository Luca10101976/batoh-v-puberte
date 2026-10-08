import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getCanonicalCorrectAnswer, splitOrderedAnswers } from "./mission-task-normalization.ts";
import { isTaskAnswerCorrect, splitOrderedLines } from "./answer-matching.ts";
import { findPublishBlockers } from "./mission-publish-validation.ts";
import { pointsForTask } from "./mission-completion.ts";
import { POINTS_PER_TASK, POINTS_PER_TASK_WITH_HINT } from "./game-rules.ts";

// R46: nový typ úkolu „seřaď“.
//   options        = položky v pořadí, v jakém je hráč uvidí
//   correct_answer = správné pořadí, jedna položka na řádek
// Vyhodnocení i publikační kontrola sdílejí tutéž kanonickou funkci.
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const bezKomentaru = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "");

const SOKOLOVNA = ["Tělocvična", "Tančírna", "Zámeček"];
const SPRAVNE = "Zámeček\nTančírna\nTělocvična";

const kanon = (correct: string, options: unknown = SOKOLOVNA) =>
  getCanonicalCorrectAnswer({ id: "t1", type: "serad", question: "Kdo tu kdy byl?", correct_answer: correct, options });

const ukol = (correct: string, options: unknown = SOKOLOVNA) => ({
  id: "t1",
  stopTitle: "Sokolovna",
  taskOrder: 3,
  type: "serad",
  question: "Kdo tu kdy byl?",
  correctAnswer: correct,
  options
});
const kody = (t: ReturnType<typeof ukol>) =>
  findPublishBlockers([{ id: "s1", title: "Sokolovna", order: 4, tasks: [t] }]).map((i) => i.code);

const hra = (correct: string) => ({ type: "order", correctAnswers: [kanon(correct) ?? ""] });

// ── 1. Kanonické pořadí ──────────────────────────────────────────────────────

test("1 – správné pořadí se uloží jako položky z nabídky, jedna na řádek", () => {
  assert.equal(kanon(SPRAVNE), "Zámeček\nTančírna\nTělocvična");
});

test("2 – oddělovače: řádky, svislítko i středník; čárka NE (bývá v názvu položky)", () => {
  assert.deepEqual(splitOrderedAnswers("A\nB\nC"), ["A", "B", "C"]);
  assert.deepEqual(splitOrderedAnswers("A | B | C"), ["A", "B", "C"]);
  assert.deepEqual(splitOrderedAnswers("A; B; C"), ["A", "B", "C"]);
  assert.deepEqual(splitOrderedAnswers("Vlci, medvědi\nSloni"), ["Vlci, medvědi", "Sloni"], "čárka nedělí");
});

test("3 – zápis se smí lišit velikostí písmen a diakritikou, uloží se podoba z nabídky", () => {
  assert.equal(kanon("zamecek\ntancirna\ntelocvicna"), "Zámeček\nTančírna\nTělocvična");
});

test("4 – neúplné, přebývající ani opakované pořadí neprojde", () => {
  assert.equal(kanon("Zámeček\nTančírna"), null, "chybí položka");
  assert.equal(kanon("Zámeček\nTančírna\nTělocvična\nNavíc"), null, "položka navíc");
  assert.equal(kanon("Zámeček\nZámeček\nTančírna"), null, "opakovaná položka");
  assert.equal(kanon("Zámeček\nTančírna\nHřiště"), null, "cizí položka");
  assert.equal(kanon(SPRAVNE, ["Tělocvična"]), null, "míň než dvě položky");
});

// ── 2. Vyhodnocení ve hře ────────────────────────────────────────────────────

test("5 – hráč uspěje jen s celým správným pořadím", () => {
  const pravidlo = hra(SPRAVNE);
  assert.equal(isTaskAnswerCorrect(pravidlo, "Zámeček\nTančírna\nTělocvična"), true);
  assert.equal(isTaskAnswerCorrect(pravidlo, "Tančírna\nZámeček\nTělocvična"), false, "prohozené");
  assert.equal(isTaskAnswerCorrect(pravidlo, "Zámeček\nTančírna"), false, "neúplné");
  assert.equal(isTaskAnswerCorrect(pravidlo, ""), false, "prázdné");
  assert.equal(isTaskAnswerCorrect(pravidlo, "Zámeček Tančírna Tělocvična"), false, "bez oddělovačů");
});

test("6 – velikost písmen a diakritika hráče nesrazí", () => {
  assert.equal(isTaskAnswerCorrect(hra(SPRAVNE), "zamecek\ntancirna\ntelocvicna"), true);
  assert.deepEqual(splitOrderedLines("A | B"), ["A", "B"]);
});

test("7 – bodování se nemění: celé pořadí 10 bodů, s nápovědou 5, jinak 0", () => {
  assert.equal(pointsForTask("correct", false), POINTS_PER_TASK);
  assert.equal(pointsForTask("correct", true), POINTS_PER_TASK_WITH_HINT);
  assert.equal(pointsForTask("wrong", false), 0);
  assert.equal(pointsForTask("unknown", false), 0);
});

// ── 3. Publikační kontrola ───────────────────────────────────────────────────

test("8 – hotový úkol projde, rozbitý publikaci zablokuje", () => {
  assert.deepEqual(kody(ukol(SPRAVNE)), []);
  assert.deepEqual(kody(ukol("Zámeček\nTančírna")), ["choice_answer_not_in_options"]);
  assert.deepEqual(kody(ukol("Zámeček\nTančírna\nHřiště")), ["choice_answer_not_in_options"]);
  assert.deepEqual(kody(ukol(SPRAVNE, ["Tělocvična"])), ["choice_without_options"]);
  assert.deepEqual(kody(ukol("")), ["missing_answer"]);
});

test("9 – kontrola a hra čtou pořadí stejně", () => {
  const pripady: Array<[string, string[]]> = [
    [SPRAVNE, SOKOLOVNA],
    ["zamecek\ntancirna\ntelocvicna", SOKOLOVNA],
    ["Zámeček\nTančírna", SOKOLOVNA],
    ["Zámeček\nTančírna\nHřiště", SOKOLOVNA]
  ];
  for (const [odpoved, moznosti] of pripady) {
    const kanonicka = kanon(odpoved, moznosti);
    const hratelny = Boolean(kanonicka) && isTaskAnswerCorrect({ type: "order", correctAnswers: [kanonicka!] }, kanonicka!);
    const blokuje = kody(ukol(odpoved, moznosti)).includes("choice_answer_not_in_options");
    assert.equal(blokuje, !hratelny, `rozchod u ${JSON.stringify(odpoved)}`);
  }
});

// ── 4. Ostatní typy beze změny ───────────────────────────────────────────────

test("10 – otevřená odpověď, výběr i ano/ne se nezměnily", () => {
  const vyber = {
    id: "t", stopTitle: "S", taskOrder: 1, type: "vyber",
    question: "Q?", correctAnswer: "Vlci, medvědi, kůň a brazilský ptáček",
    options: ["Pávi a labutě", "Vlci, medvědi, kůň a brazilský ptáček", "Sloni"]
  };
  assert.deepEqual(findPublishBlockers([{ id: "s", title: "S", order: 1, tasks: [vyber] }]), [], "čárka ve výběru dál projde");
  const otevrena = { ...vyber, type: "otevrena", correctAnswer: "4, ctyri, čtyři", options: [] };
  assert.deepEqual(findPublishBlockers([{ id: "s", title: "S", order: 1, tasks: [otevrena] }]), []);
  assert.equal(isTaskAnswerCorrect({ type: "question", correctAnswers: ["16", "sestnact"] }, "16"), true);
  assert.equal(isTaskAnswerCorrect({ type: "choice", correctAnswers: ["Ze schodů"] }, "Ze schodů"), true);
});

// ── 5. Napojení do aplikace ──────────────────────────────────────────────────

test("11 – typ je povolený v Mozku a mapuje se na herní typ", () => {
  assert.match(read("app/admin/types.ts"), /"otevrena" \| "vyber" \| "ano-ne" \| "serad"/);
  assert.match(read("app/admin/stops/actions.ts"), /"otevrena", "vyber", "ano-ne", "serad"/);
  assert.match(read("lib/gameplay-types.ts"), /"question" \| "photo" \| "choice" \| "order"/);
  const server = bezKomentaru(read("lib/gameplay-server.ts"));
  assert.match(server, /if \(type === "serad"\) \{\s*return "order";/);
  assert.match(server, /if \(type === "serad"\) \{\s*return "Seřaď";/);
});

test("12 – hráč řadí šipkami, ne psaním", () => {
  const hraniSrc = bezKomentaru(read("components/play-screen.tsx"));
  assert.match(hraniSrc, /activeTask\.type === "order"/);
  assert.match(hraniSrc, /aria-label=\{`Posunout \$\{polozka\} nahoru`\}/);
  assert.match(hraniSrc, /aria-label=\{`Posunout \$\{polozka\} dolů`\}/);
  assert.match(hraniSrc, /disabled=\{index === 0 \|\| verificationFinished\}/, "krajní šipka je vypnutá");
  assert.match(hraniSrc, /disabled=\{index === poradi\.length - 1 \|\| verificationFinished\}/);
  // prázdná hodnota se u řazení nehlásí jako chybějící odpověď
  assert.match(hraniSrc, /activeTask\.type !== "choice" && activeTask\.type !== "order" && !input\.trim\(\)/);
  // a když hráč s pořadím nehnul, odešle se to, které vidí
  assert.match(hraniSrc, /activeTask\.type === "order" && !input\.trim\(\) \? \(activeTask\.options \?\? \[\]\)\.join/);
});

test("13 – Mozek nabízí typ a vysvětluje ho; náhled ukazuje správné pořadí", () => {
  const form = bezKomentaru(read("components/admin/task-form.tsx"));
  assert.match(form, /\{ value: "serad", label: "Seřaď podle pořadí" \}/);
  assert.match(form, /Seřaď podle pořadí<\/p>/);
  assert.match(form, /Hráč položky posouvá šipkami/);
  const nahled = bezKomentaru(read("app/admin/missions/\[id\]/preview/page.tsx"));
  assert.match(nahled, /Správné pořadí:/);
  assert.match(nahled, /join\(" → "\)/);
});

// ── 6. Migrace ───────────────────────────────────────────────────────────────

test("14 – migrace povoluje nový typ a hlídá permutaci, ostatní větve nechává být", () => {
  const soubory = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.includes("serad"));
  assert.equal(soubory.length, 1, "právě jedna migrace pro nový typ");
  const sql = read(`supabase/migrations/${soubory[0]}`);
  assert.match(sql, /'otevrena'::text, 'vyber'::text, 'ano-ne'::text, 'serad'::text/, "CHECK zná čtyři typy");
  assert.match(sql, /if new\.type = 'serad' then/, "trigger má větev pro seřazení");
  assert.match(sql, /Správné pořadí musí obsahovat všechny položky, každou právě jednou/);
  assert.match(sql, /Ve správném pořadí se položka opakuje/);
  // stávající větve zůstávají
  assert.match(sql, /U typu Ano \/ ne musí být správná odpověď Ano nebo Ne/);
  assert.match(sql, /U typu Výběr z možností musí být aspoň 2 možnosti/);
  assert.doesNotMatch(sql, /drop (table|column)|delete from|truncate/i, "migrace nic nemaže");
  assert.doesNotMatch(sql, /update\s+public\.mission_tasks/i, "migrace nepřepisuje data úkolů");
});
