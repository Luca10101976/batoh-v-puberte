/**
 * R37: ochrana her, které už někdo hrál.
 *
 * Odpovědi hráčů (`child_task_progress`) i výsledky (`child_location_progress`)
 * odkazují na hru a úkol textem, bez cizího klíče. Smazání obsahu je tedy sice
 * technicky možné, ale nechá po sobě záznamy, které ukazují do prázdna: hra
 * zmizí z historie hráče a jeho body přestanou dávat smysl.
 *
 * Pravidlo R37: co jde udělat bez ztráty historie, se dovolí. Co by historii
 * osiřelo, běžná administrační cesta neudělá – od toho je odpublikování.
 *
 * Modul je čistý, aby se pravidla dala testovat bez databáze.
 */

export type MissionUsage = {
  /** Právě běžící výpravy v téhle hře. */
  activeRuns: number;
  /** Hráči, kteří hru mají v historii výsledků. */
  playersWithResult: number;
  /** Uložené odpovědi napříč všemi výpravami hry. */
  answers: number;
};

export const EMPTY_USAGE: MissionUsage = { activeRuns: 0, playersWithResult: 0, answers: 0 };

export function isMissionUsed(usage: MissionUsage) {
  return usage.activeRuns > 0 || usage.playersWithResult > 0 || usage.answers > 0;
}

export type UsageGuard = { allowed: true } | { allowed: false; reason: string };

const UNPUBLISH_HINT =
  "Pokud hru nechceš dál nabízet, vypni její publikaci – zůstane hráčům v historii i s body.";

/** Smazat celou hru smí jen koncept, který nikdo nikdy nerozehrál. */
export function guardMissionDelete(usage: MissionUsage): UsageGuard {
  if (!isMissionUsed(usage)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `${describeUsage(usage)} Smazáním by se jejich postup a výsledky rozbily, proto to nejde. ${UNPUBLISH_HINT}`
  };
}

/** Smazat zastávku nebo úkol nejde, jakmile na ně existují odpovědi nebo běží výprava. */
export function guardContentDelete(usage: MissionUsage, what: "stop" | "task"): UsageGuard {
  if (!isMissionUsed(usage)) {
    return { allowed: true };
  }
  const label = what === "stop" ? "zastávku" : "úkol";
  return {
    allowed: false,
    reason: `${describeUsage(usage)} Smazat ${label} v takové hře nejde, protože by odpovědi hráčů ukazovaly do prázdna. ${UNPUBLISH_HINT}`
  };
}

/**
 * Pořadí se smí měnit, dokud hru nikdo právě nehraje. Rozehraná výprava má
 * pořadí úkolů vynucené serverem (R26), takže přečíslování uprostřed hraní by
 * hráče poslalo na jiné místo, než kde skončil.
 */
export function guardReorder(usage: MissionUsage): UsageGuard {
  if (usage.activeRuns === 0) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `${describeUsage(usage)} Změna pořadí by rozehranou výpravu poslala na jiný úkol, než u kterého hráč skončil. Zkus to, až hru nikdo hrát nebude.`
  };
}

function plural(count: number, one: string, few: string, many: string) {
  if (count === 1) {
    return one;
  }
  if (count >= 2 && count <= 4) {
    return few;
  }
  return many;
}

/** Věta pro administrátorku – musí být srozumitelná bez znalosti databáze. */
export function describeUsage(usage: MissionUsage) {
  const parts: string[] = [];
  if (usage.activeRuns > 0) {
    parts.push(
      `${usage.activeRuns} ${plural(usage.activeRuns, "hráč tuhle hru právě hraje", "hráči tuhle hru právě hrají", "hráčů tuhle hru právě hraje")}`
    );
  }
  if (usage.playersWithResult > 0) {
    parts.push(
      `${usage.playersWithResult} ${plural(usage.playersWithResult, "hráč ji už dohrál", "hráči ji už dohráli", "hráčů ji už dohrálo")}`
    );
  }
  if (parts.length === 0 && usage.answers > 0) {
    parts.push(`hra už má uložené odpovědi hráčů (${usage.answers})`);
  }
  if (parts.length === 0) {
    return "Tuhle hru zatím nikdo nehrál.";
  }
  return `${parts.join(" a ")}.`;
}
