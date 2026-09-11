/**
 * R44 krok 5: pravidla obrazovky Přátelé v profilu.
 *
 * Čisté funkce bez Reactu a bez aliasu "@/", aby je testy skutečně spouštěly.
 * Server (child_friendships) je jediný zdroj pravdy o tom, kdo je kamarád;
 * tady je jen to, co k tomu potřebuje obrazovka.
 */

export const FRIEND_CODE_MAX_LENGTH = 10;
const FRIEND_CODE_PATTERN = /^BAT-[A-Z0-9]{6}$/;

export type FriendLoadState = "idle" | "loading" | "ready" | "error";

export type FriendListEntry = {
  id?: string;
  code: string;
  name: string;
  avatar?: string | null;
  addedAt?: string;
};

/** Velká písmena bez mezer – stejná normalizace jako na serveru. */
export function normalizeFriendCode(value: string): string {
  return value.trim().toUpperCase();
}

/** Veřejný kód má přesně tvar BAT- a šest znaků. */
export function isValidFriendCode(value: string): boolean {
  return FRIEND_CODE_PATTERN.test(normalizeFriendCode(value));
}

/** Seznam kamarádů se řadí abecedně podle aktuální přezdívky (česky). */
export function sortFriendsByName<T extends { name: string; code: string }>(friends: T[]): T[] {
  return friends
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "cs", { sensitivity: "base" }) || a.code.localeCompare(b.code));
}

/**
 * Co má profil ukázat v sekci Tvoji kamarádi. Známý seznam se ukazuje vždy;
 * prázdný stav patří jen k dokončenému načtení (R43).
 */
export function resolveFriendsView(
  loadState: FriendLoadState,
  friendCount: number
): "loading" | "error" | "empty" | "list" {
  if (friendCount > 0) {
    return "list";
  }
  if (loadState === "ready") {
    return "empty";
  }
  if (loadState === "error") {
    return "error";
  }
  return "loading";
}

/** Hlášky k chybám serveru – stejné znění, jaké hráč znal dřív. */
export function friendErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case "own_code":
      return "Tohle je tvůj vlastní kód.";
    case "invalid_code":
    case "invalid_target_code":
    case "invalid_payload":
      return "Zadej platný kód kamaráda.";
    case "not_found":
    case "target_not_found":
      return "Kamarád s tímto kódem nebyl nalezen.";
    case "rate_limited":
      return "Moc pokusů. Zkus to za chvíli.";
    default:
      return fallback;
  }
}
