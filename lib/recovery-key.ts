// Traki klíč – čisté funkce sdílené klientem i serverem (žádné secrety, žádné crypto).
//
// Formát pro uživatele:  LAMA-MOST-KUFR-MRAK
// Kanonický tvar:        LAMAMOSTKUFRMRAK  (přesně 16 znaků A–Z)
//
// Klíč je 4 RŮZNÁ česká čtyřpísmenná slova ze slovníku lib/recovery-words-cs.ts.
// Redeem NIKDY neověřuje slova proti slovníku – jen normalizuje a hashuje,
// aby už vydané klíče přežily jakoukoli změnu slovníku.

import { RECOVERY_WORD_LENGTH } from "./recovery-words-cs.ts";

export const RECOVERY_KEY_WORD_COUNT = 4;
export const RECOVERY_KEY_CANONICAL_LENGTH = RECOVERY_KEY_WORD_COUNT * RECOVERY_WORD_LENGTH;

// Dítě může omylem napsat číslici místo písmene; klíč číslice nikdy neobsahuje,
// takže je mapování jednoznačné.
const DIGIT_TO_LETTER: Record<string, string> = { "0": "O", "1": "I" };

/**
 * Převede libovolný uživatelský vstup na kanonický tvar (16 znaků A–Z).
 * Vrací null, když po normalizaci nevznikne přesně 16 písmen.
 *
 *   "LAMA-MOST-KUFR-MRAK" | "lama most kufr mrak" | "LAMAMOSTKUFRMRAK" | "LÁMA-MŮST-KÚFR-MRÁK"
 *   -> "LAMAMOSTKUFRMRAK"
 */
export function normalizeRecoveryKey(input: string): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const stripped = input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[01]/g, (d) => DIGIT_TO_LETTER[d] ?? "")
    .replace(/[^A-Z]/g, "");
  return stripped.length === RECOVERY_KEY_CANONICAL_LENGTH ? stripped : null;
}

/** LAMAMOSTKUFRMRAK -> LAMA-MOST-KUFR-MRAK */
export function formatRecoveryKey(canonical: string): string {
  const parts: string[] = [];
  for (let i = 0; i < canonical.length; i += RECOVERY_WORD_LENGTH) {
    parts.push(canonical.slice(i, i + RECOVERY_WORD_LENGTH));
  }
  return parts.join("-");
}

export function isCanonicalRecoveryKey(value: string): boolean {
  return new RegExp(`^[A-Z]{${RECOVERY_KEY_CANONICAL_LENGTH}}$`).test(value);
}

/** Rozdělí kanonický klíč na slova (pro kontrolu různosti slov). */
export function splitRecoveryKey(canonical: string): string[] {
  return formatRecoveryKey(canonical).split("-");
}
