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

/**
 * R44: v jakém stavu je načítání hráčových her.
 *
 * Hry stojí na dvou nezávislých načteních – dokončené hry a skóre z profilového
 * API, běžící výpravy z herního. Dokud nemáme obojí, nevíme, jestli hráč hry
 * nemá, nebo je jen zatím neznáme; a to jsou dvě různé věci, které se nesmí
 * ukazovat stejně.
 */
export type GamesLoadState = "idle" | "loading" | "ready" | "error";

export function combineGamesLoadState(progress: GamesLoadState, activeRuns: GamesLoadState): GamesLoadState {
  // Chyba má přednost před nedokončeným načítáním. Selhání je zjištěná
  // skutečnost, zatímco „ještě se načítá" je jen její nepřítomnost – a kdyby
  // vyhrálo, stačilo by, aby se druhá půlka nikdy nerozběhla, a hráč by zůstal
  // navždy u „Načítám tvoje hry…".
  if (progress === "error" || activeRuns === "error") {
    return "error";
  }
  if (progress === "idle" || activeRuns === "idle") {
    return "idle";
  }
  if (progress === "loading" || activeRuns === "loading") {
    return "loading";
  }
  return "ready";
}

/** Co má profil ukázat v sekci Moje hry. */
export function resolveGamesView(
  loadState: GamesLoadState,
  gameCount: number
): "loading" | "error" | "empty" | "games" {
  // Když už nějaké hry víme, ukazují se i během načítání na pozadí – jsou to
  // platná data, ne domněnka.
  if (gameCount > 0) {
    return "games";
  }
  if (loadState === "ready") {
    return "empty";
  }
  if (loadState === "error") {
    return "error";
  }
  return "loading";
}
