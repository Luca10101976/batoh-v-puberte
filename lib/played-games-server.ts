/**
 * R38: informace o hrách, které hráč zná z historie.
 *
 * Profil dřív bral název hry, město i maximum bodů z obsahu v kódu
 * (lib/mock-data.ts + lib/scoring.ts). Kvůli tomu neuměl pojmenovat hru
 * vytvořenou v Mozku a u Klamovky ukazoval staré maximum 180 místo 190,
 * protože v kódu bylo o jeden úkol míň než v databázi.
 *
 * Tenhle modul dodá totéž z databáze – i pro hru, která je dnes koncept nebo
 * kterou už autorka z nabídky stáhla. Historii hráče to nesmí vymazat.
 */

import { POINTS_PER_TASK } from "./game-rules.ts";
import { LEGACY_LOCATION_ID_BY_MISSION_ID } from "./legacy-location-ids.ts";

export type PlayedGameInfo = {
  locationId: string;
  name: string;
  city: string;
  /** Maximum bodů hry = počet jejích úkolů × body za úkol. */
  maxScore: number;
};

type MissionRow = { id: string; title: string; city: string };
type StopRow = { id: string; mission_id: string };
type TaskRow = { stop_id: string };

/** UUID mise pro locationId (historický slug i přímé UUID). */
function missionIdForLocation(locationId: string) {
  for (const [missionId, slug] of Object.entries(LEGACY_LOCATION_ID_BY_MISSION_ID)) {
    if (slug === locationId) {
      return missionId;
    }
  }
  return locationId;
}

/**
 * @param locationIds locationId tak, jak je má hráč uložené v postupu.
 */
export async function loadPlayedGames(
  admin: { from: (table: string) => any },
  locationIds: string[]
): Promise<PlayedGameInfo[]> {
  const unique = Array.from(new Set(locationIds.filter(Boolean)));
  if (unique.length === 0) {
    return [];
  }

  const missionIdByLocation = new Map(unique.map((locationId) => [locationId, missionIdForLocation(locationId)]));
  const missionIds = Array.from(new Set(missionIdByLocation.values()));

  // Záměrně bez filtru na is_published: hra, kterou hráč dohrál, mu z historie
  // nesmí zmizet jen proto, že ji autorka stáhla z nabídky.
  const { data: missionRows, error: missionError } = await admin
    .from("missions")
    .select("id, title, city")
    .in("id", missionIds);
  if (missionError) {
    throw new Error(`played_missions_failed: ${missionError.message}`);
  }
  const missions = new Map(((missionRows as MissionRow[] | null) ?? []).map((row) => [row.id, row]));

  const { data: stopRows, error: stopError } = await admin
    .from("mission_stops")
    .select("id, mission_id")
    .in("mission_id", missionIds);
  if (stopError) {
    throw new Error(`played_stops_failed: ${stopError.message}`);
  }
  const stops = (stopRows as StopRow[] | null) ?? [];
  const missionByStop = new Map(stops.map((stop) => [stop.id, stop.mission_id]));

  const taskCount = new Map<string, number>();
  if (stops.length > 0) {
    const { data: taskRows, error: taskError } = await admin
      .from("mission_tasks")
      .select("stop_id")
      .in(
        "stop_id",
        stops.map((stop) => stop.id)
      );
    if (taskError) {
      throw new Error(`played_tasks_failed: ${taskError.message}`);
    }
    for (const task of (taskRows as TaskRow[] | null) ?? []) {
      const missionId = missionByStop.get(task.stop_id);
      if (missionId) {
        taskCount.set(missionId, (taskCount.get(missionId) ?? 0) + 1);
      }
    }
  }

  const result: PlayedGameInfo[] = [];
  for (const [locationId, missionId] of missionIdByLocation) {
    const mission = missions.get(missionId);
    if (!mission) {
      continue;
    }
    result.push({
      locationId,
      name: mission.title,
      city: mission.city,
      maxScore: (taskCount.get(missionId) ?? 0) * POINTS_PER_TASK
    });
  }
  return result;
}
