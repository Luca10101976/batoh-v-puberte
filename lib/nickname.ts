/**
 * R33: hráčská přezdívka.
 *
 * Přezdívka je veřejná identita hráče – vidí ji kamarádi i celý žebříček. Proto
 * musí být jedinečná a musí se chovat předvídatelně:
 *
 *   - porovnává se bez ohledu na velikost písmen: Pepík = pepík = PEPÍK,
 *   - diakritika je významná: Pepík a Pepik jsou dvě různé přezdívky,
 *   - text se srovná do Unicode NFC, aby dvě různé technické reprezentace téhož
 *     vizuálního textu (např. „í“ jako jeden znak vs. i + čárka) nevytvořily dvě
 *     přezdívky,
 *   - délka 2–24 znaků stejně při registraci i při pozdější změně.
 *
 * Poslední slovo má databáze: unikátní index nad lower(normalize(...)) platí pro
 * každý zápis. Tenhle modul dělá totéž v aplikaci, aby hráč dostal srozumitelnou
 * hlášku dřív, než na to narazí databáze.
 */

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 24;

export const NICKNAME_LENGTH_MESSAGE = `Přezdívka musí mít ${NICKNAME_MIN_LENGTH} až ${NICKNAME_MAX_LENGTH} znaků.`;
export const NICKNAME_TAKEN_MESSAGE = "Tahle přezdívka už je obsazená. Zkus jinou.";
export const NICKNAME_HINT =
  "Použij herní přezdívku, ne svoje celé jméno. Uvidí ji kamarádi i žebříček.";

/** Podoba, ve které se přezdívka ukládá: NFC, bez okrajových mezer, bez zdvojených mezer. */
export function normalizeNickname(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

/** Klíč pro porovnání dvou přezdívek. Velikost písmen se ignoruje, diakritika ne. */
export function nicknameKey(value: string | null | undefined) {
  return normalizeNickname(value).toLowerCase();
}

/** Počet znaků, ne UTF-16 jednotek – ať se emoji počítá stejně jako v databázi. */
export function nicknameLength(value: string | null | undefined) {
  return [...normalizeNickname(value)].length;
}

export type NicknameValidation =
  | { ok: true; nickname: string; key: string }
  | { ok: false; reason: "invalid_length"; message: string };

export function validateNickname(value: string | null | undefined): NicknameValidation {
  const nickname = normalizeNickname(value);
  const length = [...nickname].length;

  if (length < NICKNAME_MIN_LENGTH || length > NICKNAME_MAX_LENGTH) {
    return { ok: false, reason: "invalid_length", message: NICKNAME_LENGTH_MESSAGE };
  }

  return { ok: true, nickname, key: nickname.toLowerCase() };
}

/** Shodují se dvě přezdívky podle pravidla R33? */
export function isSameNickname(a: string | null | undefined, b: string | null | undefined) {
  return nicknameKey(a) === nicknameKey(b);
}

/**
 * Náhradní přezdívka pro profil, který se zakládá bez zadaného jména (legacy
 * e-mailové přihlášení). Nikdy nesmí být delší než limit; jedinečnost dořeší
 * databáze a volající, který na kolizi zkusí další pokus.
 */
export function fallbackNickname(seed: string | null | undefined, attempt = 0) {
  const base = normalizeNickname(seed) || "Hráč";
  const suffix = attempt > 0 ? `-${attempt + 1}` : "";
  const room = NICKNAME_MAX_LENGTH - [...suffix].length;
  const trimmed = [...base].slice(0, Math.max(NICKNAME_MIN_LENGTH, room)).join("");
  const candidate = `${trimmed}${suffix}`;
  return [...candidate].length >= NICKNAME_MIN_LENGTH ? candidate : `Hráč${suffix}`;
}

/** Kód chyby, kterou Postgres vrátí při porušení unikátního indexu. */
export const UNIQUE_VIOLATION = "23505";

export function isNicknameConflict(error: { code?: string; message?: string } | null | undefined) {
  if (!error) {
    return false;
  }
  if (error.code !== UNIQUE_VIOLATION) {
    return false;
  }
  return (error.message ?? "").includes("child_profiles_nickname_key");
}

/** Escapování pro dotaz `ilike` – jinak by `%` v přezdívce fungovalo jako žolík. */
export function nicknameIlikePattern(value: string) {
  return normalizeNickname(value).replace(/([\\%_])/g, "\\$1");
}
