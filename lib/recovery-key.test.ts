import assert from "node:assert/strict";
import test from "node:test";
import {
  RECOVERY_KEY_CANONICAL_LENGTH,
  RECOVERY_KEY_WORD_COUNT,
  formatRecoveryKey,
  isCanonicalRecoveryKey,
  normalizeRecoveryKey,
  splitRecoveryKey
} from "./recovery-key.ts";
import { generateRecoveryKey, hashRecoveryKey, isTechnicalEmail, technicalEmailForUser } from "./recovery-key-server.ts";
import { RECOVERY_WORDS_CS } from "./recovery-words-cs.ts";

const CANON = "LAMAMOSTKUFRMRAK";

test("normalizace: pomlčky, mezery, malá písmena, bez oddělovačů", () => {
  for (const input of [
    "LAMA-MOST-KUFR-MRAK",
    "lama-most-kufr-mrak",
    "lama most kufr mrak",
    "LAMAMOSTKUFRMRAK",
    "  Lama, most; kufr / mrak  ",
    "LAMA - MOST - KUFR - MRAK"
  ]) {
    assert.equal(normalizeRecoveryKey(input), CANON, `vstup: ${input}`);
  }
});

test("normalizace: česká diakritika se převede (ŽÁBA -> ZABA)", () => {
  assert.equal(normalizeRecoveryKey("ŽÁBA-MŮST-KÚFR-MRÁK"), "ZABAMUSTKUFRMRAK");
  assert.equal(normalizeRecoveryKey("žába-déšť-kůže-sníh"), "ZABADESTKUZESNIH");
  assert.equal(normalizeRecoveryKey("ŘEKA-ČÁRA-ĎÁBL-ŤUKÁ"), "REKACARADABLTUKA");
});

test("normalizace: číslice 0/1 se převedou na O/I, jiné číslice se zahodí", () => {
  assert.equal(normalizeRecoveryKey("LAMA-M0ST-KUFR-MRAK"), CANON);
  assert.equal(normalizeRecoveryKey("L1ST-MOST-KUFR-MRAK"), "LISTMOSTKUFRMRAK");
  // ostatní číslice/znaky se zahodí (pravidlo 4 normalizace) – o platnosti rozhodne až hash
  assert.equal(normalizeRecoveryKey("LAMA-MOST-KUFR-MRAK-7429"), CANON);
});

test("normalizace: neplatná délka vrací null (nespotřebuje serverový pokus)", () => {
  assert.equal(normalizeRecoveryKey(""), null);
  assert.equal(normalizeRecoveryKey("LAMA-MOST-KUFR"), null);
  assert.equal(normalizeRecoveryKey("LAMA-MOST-KUFR-MRAK-ZABA"), null);
  assert.equal(normalizeRecoveryKey("LAMA-MOST-KUFR-MRA"), null);
  assert.equal(normalizeRecoveryKey(123 as unknown as string), null);
});

test("format: kanonický tvar -> WORD-WORD-WORD-WORD", () => {
  assert.equal(formatRecoveryKey(CANON), "LAMA-MOST-KUFR-MRAK");
  assert.deepEqual(splitRecoveryKey(CANON), ["LAMA", "MOST", "KUFR", "MRAK"]);
  assert.ok(isCanonicalRecoveryKey(CANON));
  assert.ok(!isCanonicalRecoveryKey("lamamostkufrmrak"));
  assert.ok(!isCanonicalRecoveryKey("LAMA-MOST-KUFR-MRAK"));
  assert.equal(RECOVERY_KEY_CANONICAL_LENGTH, 16);
});

test("generování: 16 znaků A–Z, 4 různá slova ze slovníku, round-trip přes normalizaci", () => {
  const dict = new Set(RECOVERY_WORDS_CS);
  for (let i = 0; i < 500; i += 1) {
    const key = generateRecoveryKey();
    assert.ok(isCanonicalRecoveryKey(key), key);
    const words = splitRecoveryKey(key);
    assert.equal(words.length, RECOVERY_KEY_WORD_COUNT);
    assert.equal(new Set(words).size, RECOVERY_KEY_WORD_COUNT, `opakované slovo: ${key}`);
    for (const w of words) {
      assert.ok(dict.has(w), `slovo mimo slovník: ${w}`);
    }
    assert.equal(normalizeRecoveryKey(formatRecoveryKey(key)), key);
  }
});

test("generování: klíče se prakticky neopakují", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i += 1) {
    seen.add(generateRecoveryKey());
  }
  assert.ok(seen.size > 1990, `příliš mnoho opakování: ${2000 - seen.size}`);
});

test("hash: deterministický, závislý na pepperu, nikdy neobsahuje klíč", () => {
  const pepper = "x".repeat(48);
  const a = hashRecoveryKey(CANON, pepper);
  const b = hashRecoveryKey(CANON, pepper);
  const c = hashRecoveryKey(CANON, "y".repeat(48));
  const d = hashRecoveryKey("ZABAMOSTKUFRMRAK", pepper);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes("LAMA"));
});

test("hash: odmítne nekanonický vstup a chybějící/krátký pepper", () => {
  assert.throws(() => hashRecoveryKey("LAMA-MOST-KUFR-MRAK", "x".repeat(48)));
  assert.throws(() => hashRecoveryKey(CANON, "kratky"));
  const saved = process.env.RECOVERY_KEY_PEPPER;
  delete process.env.RECOVERY_KEY_PEPPER;
  assert.throws(() => hashRecoveryKey(CANON));
  if (saved !== undefined) {
    process.env.RECOVERY_KEY_PEPPER = saved;
  }
});

test("technický e-mail: interní doména .invalid, rozpoznání", () => {
  const email = technicalEmailForUser("0b8f4c9e-1111-2222-3333-444455556666");
  assert.equal(email, "0b8f4c9e-1111-2222-3333-444455556666@players.postope.invalid");
  assert.ok(isTechnicalEmail(email));
  assert.ok(!isTechnicalEmail("dite@example.cz"));
  assert.ok(!isTechnicalEmail(null));
});
