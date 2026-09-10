/**
 * R33: napojení žebříčku na databázi.
 *
 * Seznam her, které se do žebříčku počítají, vzniká VÝHRADNĚ z databáze. Dřív se
 * bral z pevného seznamu v lib/mock-data.ts, takže nová hra z Mozku se do
 * globálního žebříčku nikdy nedostala a nepublikovaná Budějovice se naopak
 * počítala. Maximum bodů hry se počítá z jejích úkolů v databázi, ne z kódu.
 *
 * R37: počítá se hra, která JE publikovaná, i hra, která KDYSI PUBLIKOVANÁ BYLA
 * (missions.first_published_at). Jednou získané body jsou trvalé, takže pozdější
 * odpublikování hry hráči skóre nesebere. Koncept a testovací hra, která ven
 * nikdy nešla, nepřispívá ničím – a protože first_published_at nastavuje jedině
 * serverová publikační cesta, je to deterministické a nejde to obejít z klienta.
 */

import { legacyLocationIdForMission } from "./legacy-location-ids.ts";
import { maxScoreForTaskCount } from "./leaderboard-model.ts";

type MissionRow = { id: string; is_published?: boolean; first_published_at?: string | null };
type StopRow = { id: string; mission_id: string };
type TaskRow = { stop_id: string };

export type PublishedGameScores = Map<string, number>;
export type ScoredGameScores = PublishedGameScores;

/**
 * locationId -> maximum bodů. locationId je historický slug tam, kde existuje
 * (klamovka), jinak přímo UUID mise – přesně to, co se ukládá do
 * child_location_progress.location_id.
 */
export async function loadScoredGameScores(admin: {
  from: (table: string) => any;
}): Promise<PublishedGameScores> {
  const scores: PublishedGameScores = new Map();

  let { data: missionRows, error: missionError } = await admin
    .from("missions")
    .select("id, is_published, first_published_at")
    .or("is_published.eq.true,first_published_at.not.is.null");
  if (missionError?.code === "42703") {
    // Mezistav mezi nasazením kódu a migrací: sloupec ještě neexistuje.
    ({ data: missionRows, error: missionError } = await admin
      .from("missions")
      .select("id, is_published")
      .eq("is_published", true));
  }
  if (missionError) {
    throw new Error(`scored_missions_failed: ${missionError.message}`);
  }

  const missions = ((missionRows as MissionRow[] | null) ?? []).map((row) => row.id);
  if (missions.length === 0) {
    return scores;
  }

  const { data: stopRows, error: stopError } = await admin
    .from("mission_stops")
    .select("id, mission_id")
    .in("mission_id", missions);
  if (stopError) {
    throw new Error(`mission_stops_failed: ${stopError.message}`);
  }

  const stops = (stopRows as StopRow[] | null) ?? [];
  const missionByStop = new Map(stops.map((stop) => [stop.id, stop.mission_id]));

  const taskCountByMission = new Map<string, number>();
  for (const missionId of missions) {
    taskCountByMission.set(missionId, 0);
  }

  if (stops.length > 0) {
    const { data: taskRows, error: taskError } = await admin
      .from("mission_tasks")
      .select("stop_id")
      .in(
        "stop_id",
        stops.map((stop) => stop.id)
      );
    if (taskError) {
      throw new Error(`mission_tasks_failed: ${taskError.message}`);
    }

    for (const task of (taskRows as TaskRow[] | null) ?? []) {
      const missionId = missionByStop.get(task.stop_id);
      if (!missionId) {
        continue;
      }
      taskCountByMission.set(missionId, (taskCountByMission.get(missionId) ?? 0) + 1);
    }
  }

  for (const missionId of missions) {
    const locationId = legacyLocationIdForMission(missionId) ?? missionId;
    scores.set(locationId, maxScoreForTaskCount(taskCountByMission.get(missionId) ?? 0));
  }

  return scores;
}

/** Dřívější název; žebříček i profil používají stejný zdroj. */
export const loadPublishedGameScores = loadScoredGameScores;
