/**
 * R44 krok 4: jak se hráčova hra ukazuje v profilu.
 *
 * Logika byla dřív vevnitř profilové obrazovky, takže se nedala ověřit
 * chováním. Je to čistá funkce nad stavem aplikace – žádné React ani "@/",
 * aby ji testy mohly skutečně spustit.
 *
 * Pravidla profilu:
 *  - název hry přichází z databáze (Mozek) přes `playedGames`; slug je až
 *    poslední záchrana, když jméno nedorazí,
 *  - rozehraná hra ukazuje místo, kde hráč skončil, ne poměr splněného,
 *  - dokončená hra ukazuje jen dosažené body, bez maxima a procent.
 */

export type ProfileRunInput = {
  locationId: string;
  title: string | null;
  city: string | null;
  updatedAt: string | null;
  position: {
    episodeIndex: number;
    taskIndex: number;
    stopName: string | null;
  };
};

export type ProfileGamesInput = {
  completedLocationIds: string[];
  activeRuns: ProfileRunInput[];
  playedGames: Record<string, { name: string; city: string; maxScore: number }>;
  locationBestScores: Record<string, number>;
  lastCompletedAt: Record<string, string>;
};

export type ProfileGameSummary = {
  id: string;
  name: string;
  city: string;
  status: "active" | "completed";
  statusLabel: string;
  /** U rozehrané hry prázdné – stav nese štítek, ne další text. */
  scoreLabel: string;
  actionLabel: string;
  href: string;
  /** Kde hráč v rozehrané hře skončil. */
  stopName: string;
  updatedAt: string;
  isCompleted: boolean;
};

export function buildProfileGameSummaries(input: ProfileGamesInput): ProfileGameSummary[] {
  const completedIds = new Set(input.completedLocationIds);
  // R24: rozehranost určují běžící výpravy, stejně jako na hlavní obrazovce.
  const runByLocation = new Map(input.activeRuns.map((run) => [run.locationId, run]));
  const knownIds = Array.from(new Set([...completedIds, ...runByLocation.keys()]));

  return knownIds
    .map((locationId) => {
      const run = runByLocation.get(locationId) ?? null;
      const game = input.playedGames[locationId] ?? null;
      const name = game?.name ?? run?.title ?? locationId;
      const city = game?.city ?? run?.city ?? "";
      const earnedPoints = Math.max(0, input.locationBestScores[locationId] ?? 0);
      const isActive = Boolean(run);

      const href = run
        ? `/play/${locationId}?episode=${run.position.episodeIndex + 1}&task=${run.position.taskIndex + 1}`
        : `/locations/${locationId}`;

      return {
        id: locationId,
        name,
        city,
        status: isActive ? ("active" as const) : ("completed" as const),
        statusLabel: isActive ? "Rozehráno" : "Dokončeno",
        scoreLabel: isActive ? "" : `${earnedPoints} bodů`,
        actionLabel: isActive ? "Pokračovat" : "Hrát znovu",
        href,
        stopName: run?.position.stopName?.trim() || "",
        updatedAt: isActive ? (run?.updatedAt ?? "") : (input.lastCompletedAt[locationId] ?? ""),
        isCompleted: completedIds.has(locationId)
      };
    })
    .sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
}

/** Filtry mají smysl až od dvou her. */
export function shouldShowGameFilters(gameCount: number): boolean {
  return gameCount > 1;
}
