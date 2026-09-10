/**
 * R37: zjištění, jestli už hru někdo hrál. Jediné místo, které kvůli tomu sahá
 * do herních tabulek – a jen čte.
 */

import { legacyLocationIdForMission } from "./legacy-location-ids.ts";
import { EMPTY_USAGE, type MissionUsage } from "./mission-usage.ts";

/**
 * Pod jakým locationId je hra vedená v hráčských datech. Historické hry mají
 * slug, nové hry z Mozku přímo UUID mise.
 */
export function locationIdForMission(missionId: string) {
  return legacyLocationIdForMission(missionId) ?? missionId;
}

async function countRows(admin: any, table: string, apply: (query: any) => any) {
  const { count, error } = await apply(admin.from(table).select("*", { count: "exact", head: true }));
  if (error) {
    throw new Error(`${table}_count_failed: ${error.message}`);
  }
  return count ?? 0;
}

export async function getMissionUsage(admin: any, missionId: string): Promise<MissionUsage> {
  const locationId = locationIdForMission(missionId);

  const [activeRuns, answers, resultRows] = await Promise.all([
    countRows(admin, "child_game_sessions", (query: any) =>
      query.eq("mission_id", locationId).in("status", ["waiting", "active"])
    ),
    countRows(admin, "child_task_progress", (query: any) => query.eq("location_id", locationId)),
    admin.from("child_location_progress").select("profile_code").eq("location_id", locationId)
  ]);

  if (resultRows.error) {
    throw new Error(`child_location_progress_failed: ${resultRows.error.message}`);
  }

  const players = new Set(
    ((resultRows.data as Array<{ profile_code: string }> | null) ?? []).map((row) =>
      row.profile_code.trim().toUpperCase()
    )
  );

  return { activeRuns, playersWithResult: players.size, answers };
}

/** Odpovědi na konkrétní úkol – rozhoduje, jestli ho lze smazat. */
export async function getTaskUsage(admin: any, missionId: string, taskIds: string[]): Promise<MissionUsage> {
  if (taskIds.length === 0) {
    return EMPTY_USAGE;
  }

  const locationId = locationIdForMission(missionId);
  const [activeRuns, answers] = await Promise.all([
    countRows(admin, "child_game_sessions", (query: any) =>
      query.eq("mission_id", locationId).in("status", ["waiting", "active"])
    ),
    countRows(admin, "child_task_progress", (query: any) =>
      query.eq("location_id", locationId).in("task_id", taskIds)
    )
  ]);

  return { activeRuns, playersWithResult: 0, answers };
}
