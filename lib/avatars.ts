// Avatary hráče: sada samolepek Traki (24 póz), jediný avatarový systém aplikace.
//
// Historické hodnoty `batuzek-01..20` uložené v child_profiles.avatar zůstávají platné –
// mapují se na odpovídající novou samolepku, takže není potřeba žádná DB migrace
// ani zásah do profilů existujících hráčů.

export const AVATAR_COUNT = 24;

export const AVATAR_IDS = Array.from(
  { length: AVATAR_COUNT },
  (_, index) => `traki-${String(index + 1).padStart(2, "0")}`
);

export const DEFAULT_AVATAR_ID = AVATAR_IDS[0];

const AVATAR_ID_PATTERN = /^traki-\d{2}$/;
const LEGACY_AVATAR_PATTERN = /^batuzek-(\d{2})$/;

/** Je to identifikátor aktuální sady? */
export function isAvatarId(value: string | null | undefined) {
  return typeof value === "string" && AVATAR_ID_PATTERN.test(value) && AVATAR_IDS.includes(value);
}

/** Je to historický identifikátor (batuzek-01..20)? */
export function isLegacyAvatarId(value: string | null | undefined) {
  return typeof value === "string" && LEGACY_AVATAR_PATTERN.test(value);
}

/**
 * Převede libovolnou uloženou hodnotu na platný identifikátor samolepky.
 * Historické `batuzek-NN` se mapuje 1:1 podle pořadí; neznámá hodnota na výchozí avatar.
 */
export function resolveAvatarId(value: string | null | undefined): string {
  if (isAvatarId(value)) {
    return value as string;
  }
  const legacy = typeof value === "string" ? value.match(LEGACY_AVATAR_PATTERN) : null;
  if (legacy) {
    const index = Number.parseInt(legacy[1], 10);
    if (Number.isFinite(index) && index >= 1 && index <= AVATAR_COUNT) {
      return AVATAR_IDS[index - 1];
    }
  }
  return DEFAULT_AVATAR_ID;
}

/** Cesta k obrázku samolepky. */
export function avatarSrc(value: string | null | undefined) {
  return `/avatars/traki/${resolveAvatarId(value)}.webp`;
}

/** Přijímá server při ukládání profilu (nová i historická hodnota). */
export function isStorableAvatarValue(value: string | null | undefined) {
  return isAvatarId(value) || isLegacyAvatarId(value);
}
