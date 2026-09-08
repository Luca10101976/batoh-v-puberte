// Traki klíč – SERVER-ONLY část: generování (CSPRNG) a HMAC s pepperem.
// Nikdy neimportovat z klientského kódu (čte process.env.RECOVERY_KEY_PEPPER).

import { createHmac, randomInt } from "node:crypto";
import { RECOVERY_WORDS_CS } from "./recovery-words-cs.ts";
import { RECOVERY_KEY_WORD_COUNT, formatRecoveryKey, isCanonicalRecoveryKey } from "./recovery-key.ts";

/**
 * Vygeneruje 4 RŮZNÁ slova ze slovníku přes crypto.randomInt (CSPRNG).
 * Vrací kanonický tvar (16 znaků A–Z). Formátování pro uživatele: formatRecoveryKey().
 */
export function generateRecoveryKey(words: readonly string[] = RECOVERY_WORDS_CS): string {
  if (words.length < RECOVERY_KEY_WORD_COUNT) {
    throw new Error("Recovery dictionary is too small");
  }
  const picked: string[] = [];
  while (picked.length < RECOVERY_KEY_WORD_COUNT) {
    const word = words[randomInt(words.length)];
    if (!picked.includes(word)) {
      picked.push(word);
    }
  }
  return picked.join("");
}

export function getRecoveryKeyPepper(): string {
  const pepper = process.env.RECOVERY_KEY_PEPPER?.trim() ?? "";
  if (pepper.length < RECOVERY_KEY_PEPPER_MIN_LENGTH) {
    throw new Error("RECOVERY_KEY_PEPPER is missing or too short");
  }
  return pepper;
}

/**
 * HMAC-SHA256(kanonický klíč, pepper) -> hex. Do DB se ukládá POUZE tento hash.
 * Deterministický, takže UNIQUE index na child_profiles.recovery_key_hash
 * zachytí i (prakticky nemožnou) kolizi dvou stejných klíčů.
 */
export const RECOVERY_KEY_PEPPER_MIN_LENGTH = 32;

export function hashRecoveryKey(canonical: string, pepper: string = getRecoveryKeyPepper()): string {
  if (!isCanonicalRecoveryKey(canonical)) {
    throw new Error("Recovery key is not canonical");
  }
  if (typeof pepper !== "string" || pepper.length < RECOVERY_KEY_PEPPER_MIN_LENGTH) {
    throw new Error("Recovery key pepper is too short");
  }
  return createHmac("sha256", pepper).update(canonical, "utf8").digest("hex");
}

/** Interní technický e-mail pro Supabase Auth – nikdy se nezobrazuje ani nepoužívá ke komunikaci. */
export function technicalEmailForUser(userId: string): string {
  return `${userId}@players.postope.invalid`;
}

export function isTechnicalEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith("@players.postope.invalid");
}

export { formatRecoveryKey };
