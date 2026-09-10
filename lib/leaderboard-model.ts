/**
 * R33: pravidla žebříčku. Čistý modul – žádná databáze, žádný obsah v kódu.
 *
 * Schválená produktová pravidla:
 *
 *   1. Celkové skóre hráče = součet jeho nejlepších výsledků z DOKONČENÝCH
 *      PUBLIKOVANÝCH her. Každá hra se počítá nejvýš jednou.
 *   2. Opakované hraní: platí historicky nejlepší výsledek. Horší průchod nikdy
 *      nic nesnižuje. (Rekord samotný hlídá zápis dokončení, lib/game-completion.ts.)
 *   3. Do pořadí se dostane jen hráč s alespoň jedním bodem. Hráč s nulou
 *      nezabírá pozici, ale sám sebe na obrazovce vidí mimo pořadí.
 *   4. Shodné skóre = shodné pořadí; další pořadí přeskočí příslušný počet míst
 *      (1., 2., 2., 4.).
 *   5. Profil označený jako nezapočítávaný (testovací) se v pořadí neobjeví
 *      a pořadí ostatních neovlivní.
 *
 * Žádné sezóny, žádný žebříček jednotlivých her, žádné týmové pořadí.
 */

import { POINTS_PER_TASK } from "./game-rules.ts";

export type LeaderboardProgressRow = {
  profile_code: string;
  location_id: string;
  best_score?: number | null;
  penalty_points?: number | null;
  status?: "in_progress" | "completed" | null;
  first_completed_at?: string | null;
};

export type LeaderboardPlayer = {
  profileCode: string;
  nickname: string;
  avatar: string | null;
  excluded: boolean;
  isYou: boolean;
};

export type LeaderboardEntry = {
  rank: number;
  name: string;
  avatar: string | null;
  score: number;
  completed: number;
  isYou: boolean;
};

export type LeaderboardYou = {
  name: string;
  avatar: string | null;
  score: number;
  completed: number;
  /** null = hráč nemá ani bod, takže mu pořadí nepatří. */
  rank: number | null;
  /** Je vlastní řádek už ve vrácené části žebříčku? */
  inTop: boolean;
  /** Profil je vyřazený z pořadí (testovací). */
  excluded: boolean;
};

export type LeaderboardResult = {
  entries: LeaderboardEntry[];
  you: LeaderboardYou | null;
  rankedPlayers: number;
};

export function maxScoreForTaskCount(taskCount: number) {
  return Math.max(0, Math.floor(taskCount)) * POINTS_PER_TASK;
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

/**
 * Počítá se jen hra, kterou hráč někdy dokončil. Rozehraný řádek body nedává.
 * Během opakovaného hraní se stav vrací na „in_progress“, ale first_completed_at
 * zůstává – proto se rekord replayem neztratí.
 */
export function isHistoricallyCompleted(row: LeaderboardProgressRow) {
  if (row.status === "completed") {
    return true;
  }
  return typeof row.first_completed_at === "string" && row.first_completed_at.trim().length > 0;
}

function scoreForRow(row: LeaderboardProgressRow, maxScore: number) {
  // Pozor na null: Number(null) je 0, takže by se historický řádek bez
  // best_score tvářil jako nulový výsledek místo dopočtu z penalizace.
  if (typeof row.best_score === "number" && Number.isFinite(row.best_score) && row.best_score >= 0) {
    return Math.max(0, Math.floor(row.best_score));
  }

  // Historické řádky z doby před sloupcem best_score. Maximum hry se bere
  // z databáze (počet úkolů mise), ne z obsahu v kódu.
  const missingPoints = Math.max(0, Number(row.penalty_points) || 0);
  return Math.max(0, maxScore - missingPoints);
}

export type ProfileTotals = { score: number; completed: number };

/**
 * @param publishedMaxScores locationId -> maximum bodů hry. Hra, která v mapě
 *        není, není publikovaná a do žebříčku se nezapočítá.
 */
export function totalsByProfile(
  rows: LeaderboardProgressRow[],
  publishedMaxScores: Map<string, number>
) {
  const totals = new Map<string, ProfileTotals>();
  const countedLocations = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!isHistoricallyCompleted(row)) {
      continue;
    }

    const maxScore = publishedMaxScores.get(row.location_id);
    if (maxScore === undefined) {
      continue;
    }

    const code = normalizeCode(row.profile_code);
    const seen = countedLocations.get(code) ?? new Set<string>();
    if (seen.has(row.location_id)) {
      continue;
    }
    seen.add(row.location_id);
    countedLocations.set(code, seen);

    const current = totals.get(code) ?? { score: 0, completed: 0 };
    totals.set(code, {
      score: current.score + scoreForRow(row, maxScore),
      completed: current.completed + 1
    });
  }

  return totals;
}

/**
 * Pořadí se shodným skóre: stejné číslo, další pořadí přeskočí. Řadí se pouze
 * podle skóre – žádný tie-break podle času, pokusů, nápověd ani abecedy.
 */
export function rankPlayers(
  players: LeaderboardPlayer[],
  totals: Map<string, ProfileTotals>
): LeaderboardEntry[] {
  const scored = players
    .filter((player) => !player.excluded)
    .map((player) => {
      const stats = totals.get(normalizeCode(player.profileCode)) ?? { score: 0, completed: 0 };
      return { player, ...stats };
    })
    .filter((entry) => entry.score >= 1)
    .sort((a, b) => b.score - a.score);

  const entries: LeaderboardEntry[] = [];
  let rank = 0;
  let previousScore: number | null = null;

  scored.forEach((entry, index) => {
    if (previousScore === null || entry.score < previousScore) {
      rank = index + 1;
      previousScore = entry.score;
    }
    entries.push({
      rank,
      name: entry.player.nickname,
      avatar: entry.player.avatar,
      score: entry.score,
      completed: entry.completed,
      isYou: entry.player.isYou
    });
  });

  return entries;
}

export function buildLeaderboard(args: {
  players: LeaderboardPlayer[];
  totals: Map<string, ProfileTotals>;
  limit: number;
}): LeaderboardResult {
  const ranked = rankPlayers(args.players, args.totals);
  const entries = ranked.slice(0, Math.max(0, args.limit));

  const ownPlayer = args.players.find((player) => player.isYou) ?? null;
  if (!ownPlayer) {
    return { entries, you: null, rankedPlayers: ranked.length };
  }

  const ownStats = args.totals.get(normalizeCode(ownPlayer.profileCode)) ?? { score: 0, completed: 0 };
  const ownRanked = ranked.find((entry) => entry.isYou) ?? null;

  return {
    entries,
    you: {
      name: ownPlayer.nickname,
      avatar: ownPlayer.avatar,
      score: ownStats.score,
      completed: ownStats.completed,
      rank: ownRanked?.rank ?? null,
      inTop: entries.some((entry) => entry.isYou),
      excluded: ownPlayer.excluded
    },
    rankedPlayers: ranked.length
  };
}
