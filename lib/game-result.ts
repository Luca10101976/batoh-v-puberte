// R26: výsledek dokončené výpravy tak, jak ho vidí hráč na závěrečné obrazovce.
//
// Do R26 si obrazovka počítala body sama jako „počet správných × 10“. Po R25,
// kdy správná odpověď po nápovědě platí za pět bodů, ukazovala jiné číslo, než
// jaké má hráč uložené. Skóre proto nově vzniká jedině na serveru a klient ho
// jen zobrazuje.

export type RunResult = {
  /** Body právě dokončené výpravy. */
  score: number;
  /** Maximum hry: počet úkolů × body za úkol. Z databáze, ne z obsahu v kódu. */
  maxScore: number;
  totalTasks: number;
  correctTasks: number;
  unknownTasks: number;
};

export type FinishSummary = {
  result: RunResult;
  /** Nejlepší historický výsledek po zápisu této výpravy. */
  bestScore: number;
  /** Vytvořil hráč právě teď nový rekord? První dokončení je rekord vždy. */
  isNewBest: boolean;
  /** Hra, kterou hráč tímhle dokončením odemkl; null = žádná. */
  unlockedGame: { locationId: string; title: string } | null;
};

/**
 * Rekord se pozná ze stavu PŘED zápisem: první dokončení je rekord vždy,
 * jinak jen skutečně vyšší skóre. Stejný výsledek podruhé rekord není.
 */
export function isNewBestScore(previousBest: number | null | undefined, score: number) {
  if (typeof previousBest !== "number" || !Number.isFinite(previousBest)) {
    return true;
  }
  return score > previousBest;
}
