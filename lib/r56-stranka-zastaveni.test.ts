import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// R56: kratší stránka zastavení – úkoly jako sbalené karty, nápověda k odpovědím jednou.

const cti = (c: string) => readFileSync(new URL(`../${c}`, import.meta.url), "utf8");
const stranka = cti("app/admin/stops/[id]/page.tsx");
const formular = cti("components/admin/task-form.tsx");

test("Z1: nápověda k odpovědím je na stránce jednou, ne v každém formuláři úkolu", () => {
  assert.equal((stranka.match(/<TaskAnswerHelp \/>/g) ?? []).length, 1);
  assert.doesNotMatch(formular, /Nápověda pro odpovědi|Úkol typu „napiš aspoň 3/);
});

test("Z2: úkol je sbalená karta; hlavička ukáže název, typ, odpověď, nápovědu a bubliny", () => {
  assert.match(stranka, /<details className="group min-w-0 flex-1"/);
  assert.match(stranka, /\{nazevUkolu\(task\.question\)\}/);
  assert.match(stranka, /\{TYP_UKOLU\[task\.type\] \?\? task\.type\}/);
  assert.match(stranka, /→ \{zkratka\(task\.correct_answer/);
  assert.match(stranka, />nápověda</);
  assert.match(stranka, /bubliny: \{taskBubbles\(task\.id\)\.length\}/);
});

test("Z3: Seřaď má v Mozku svůj název (dřív se hlásil jako Otevřená odpověď)", () => {
  assert.match(stranka, /serad: "Seřaď"/);
  assert.doesNotMatch(stranka, /task\.type === "ano-ne" \? "Ano \/ ne" : "Otevřená odpověď"/);
});

test("Z4: formulář i bubliny úkolu jsou uvnitř karty; šipky a mazání zůstávají venku", () => {
  const karta = stranka.slice(stranka.indexOf('<details className="group min-w-0 flex-1"'), stranka.indexOf("</details>"));
  assert.match(karta, /<TaskForm stopId=\{stop\.id\} missionId=\{stop\.mission_id\} task=\{task\}/);
  assert.match(karta, /target=\{\{ type: "task", taskId: task\.id \}\}/);
  assert.doesNotMatch(karta, /moveTaskAction|confirmTask=/);
});

test("Z5: karta úkolu, který se právě maže, zůstane otevřená; nový úkol je sbalený, dokud nějaký úkol je", () => {
  assert.match(stranka, /open=\{confirmingTaskId === task\.id \|\| undefined\}/);
  assert.match(stranka, /open=\{tasks\.length === 0 \|\| undefined\}/);
});
