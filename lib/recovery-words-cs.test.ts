import assert from "node:assert/strict";
import test from "node:test";
import {
  RECOVERY_WORDS_BLOCKLIST,
  RECOVERY_WORDS_CS,
  RECOVERY_WORDS_MIN_COUNT,
  RECOVERY_WORD_LENGTH
} from "./recovery-words-cs.ts";

test("každé slovo má přesně 4 znaky A–Z (bez diakritiky, bez číslic)", () => {
  for (const word of RECOVERY_WORDS_CS) {
    assert.equal(word.length, RECOVERY_WORD_LENGTH, `špatná délka: ${word}`);
    assert.match(word, /^[A-Z]{4}$/, `nepovolené znaky: ${word}`);
    assert.equal(word, word.normalize("NFD").replace(/\p{M}/gu, ""), `diakritika: ${word}`);
  }
});

test("slovník nemá duplicity", () => {
  const seen = new Set<string>();
  for (const word of RECOVERY_WORDS_CS) {
    assert.ok(!seen.has(word), `duplicitní slovo: ${word}`);
    seen.add(word);
  }
});

test(`slovník má aspoň ${RECOVERY_WORDS_MIN_COUNT} slov`, () => {
  assert.ok(
    RECOVERY_WORDS_CS.length >= RECOVERY_WORDS_MIN_COUNT,
    `jen ${RECOVERY_WORDS_CS.length} slov, požadováno ${RECOVERY_WORDS_MIN_COUNT}`
  );
});

test("žádné slovo z blocklistu není ve slovníku", () => {
  const block = new Set(RECOVERY_WORDS_BLOCKLIST);
  for (const word of RECOVERY_WORDS_CS) {
    assert.ok(!block.has(word), `slovo z blocklistu ve slovníku: ${word}`);
  }
});

test("blocklist sám má správný formát (aby test nemohl tiše minout)", () => {
  for (const word of RECOVERY_WORDS_BLOCKLIST) {
    assert.match(word, /^[A-Z]{4}$/, `blocklist položka mimo formát: ${word}`);
  }
});
