// R22: rozhodnutí, zda hráč smí hrát konkrétní hru (herní odemykání).
//
// Čistá, testovatelná funkce bez závislostí. Pravidla podle produktového rozhodnutí:
//   1. hra musí být publikovaná (v katalogu) a musí být volaná svou kanonickou adresou,
//   2. hra bez prerequisite je herně dostupná,
//   3. hra s prerequisite vyžaduje DOKONČENÍ té konkrétní hry,
//   4. prerequisite smí odkazovat pouze na hru ve STEJNÉM MĚSTĚ,
//   5. cokoli neověřitelného = zamčeno (fail-closed).
//
// Obchodní přístup (vlastnictví placené hry) zde záměrně NENÍ. Až vznikne, přibude
// mezi krok 1 a 2 jako samostatná podmínka, aniž by se tvar této funkce změnil.

import { resolveCatalogEntryForLocation, type CatalogEntry } from "./catalog.ts";

export type GameAccessDenialReason =
  /** hra neexistuje, není publikovaná, nebo šlo o neplatný alias adresy */
  | "not_published"
  /** hra má platný prerequisite, který hráč zatím nedokončil */
  | "locked"
  /** vazba je nastavená, ale neplatná (jiné město / nedohledatelná hra) */
  | "prerequisite_invalid";

export type GameAccess =
  | { allowed: true; locationId: string }
  | { allowed: false; reason: GameAccessDenialReason };

export function resolveGameAccess(
  catalog: CatalogEntry[],
  locationId: string,
  completedLocationIds: Iterable<string>
): GameAccess {
  const wanted = (locationId ?? "").trim();
  if (!wanted) {
    return { allowed: false, reason: "not_published" };
  }

  const resolved = resolveCatalogEntryForLocation(catalog, wanted);
  if (!resolved.entry || resolved.isAlias) {
    return { allowed: false, reason: "not_published" };
  }

  const entry = resolved.entry;
  if (!entry.unlockAfterLocationId) {
    return { allowed: true, locationId: entry.locationId };
  }

  if (entry.unlockPrerequisiteInvalid) {
    return { allowed: false, reason: "prerequisite_invalid" };
  }

  // Prerequisite musí být publikovaná hra ve stejném městě; jinak nelze ověřit a zamykáme.
  const prerequisite = catalog.find((item) => item.locationId === entry.unlockAfterLocationId) ?? null;
  if (!prerequisite || prerequisite.city !== entry.city) {
    return { allowed: false, reason: "prerequisite_invalid" };
  }

  const completed = new Set(completedLocationIds);
  if (!completed.has(entry.unlockAfterLocationId)) {
    return { allowed: false, reason: "locked" };
  }

  return { allowed: true, locationId: entry.locationId };
}
