/**
 * R33: napojení žebříčku na databázi.
 *
 * Seznam her, které se do žebříčku počítají, vzniká VÝHRADNĚ z DB katalogu
 * publikovaných misí. Dřív se bral z pevného seznamu v lib/mock-data.ts, takže
 * nová hra z Mozku se do globálního žebříčku nikdy nedostala a nepublikovaná
 * Budějovice se naopak počítala. Maximum bodů hry se počítá z jejích úkolů
 * v databázi, ne z obsahu v kódu.
 */

import { legacyLocationIdForMission } from "./legacy-location-ids.ts";
import { maxScoreForTaskCount } from "./leaderboard-model.ts";

type MissionRow = { id: string };
type StopRow = { id: string; mission_id: string };
type TaskRow = { stop_id: string };

export type PublishedGameScores = Map<string, number>;

/**
 * locationId -> maximum bodů. locationId je historický slug tam, kde existuje
 * (klamovka), jinak přímo UUID mise – přesně to, co se ukládá do
 * child_location_progress.location_id.
 */
export async function loadPublishedGameScores(admin: {
  from: (table: string) => any;
}): Promise<PublishedGameScores> {
  const scores: PublishedGameScores = new Map();

  const { data: missionRows, error: missionError } = await admin
    .from("missions")
    .select("id")
    .eq("is_published", true);
  if (missionError) {
    throw new Error(`published_missions_failed: ${missionError.message}`);
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
