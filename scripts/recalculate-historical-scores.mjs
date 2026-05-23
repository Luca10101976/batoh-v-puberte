import { createClient } from '@supabase/supabase-js';
import { locations, nearbyMissions } from '../lib/mock-data.ts';
import { POINTS_PER_TASK, getLocationMaxScore } from '../lib/game-rules.ts';

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    apply: args.has('--apply'),
    dryRun: !args.has('--apply') || args.has('--dry-run')
  };
}

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasHistoricalCompletion(row) {
  if (!row) return false;
  if (row.status === 'completed') return true;
  return hasText(row.first_completed_at);
}

function isActiveReplay(row) {
  return row?.status === 'in_progress' && hasText(row?.first_completed_at);
}

async function fetchAll(label, fetchPage) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) {
      throw new Error(`${label}: ${error.message}`);
    }

    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) {
      break;
    }
  }

  return rows;
}

function buildCanonicalMissionMap() {
  const map = new Map();

  for (const mission of nearbyMissions) {
    const location = locations.find((item) => item.id === mission.locationId);
    if (!location) continue;
    map.set(`${normalize(location.city)}::${normalize(mission.name)}`, mission.locationId);
  }

  return map;
}

function buildMockTaskCatalog() {
  const map = new Map();

  for (const location of locations) {
    const taskIds = new Set();
    for (const episode of location.episodes) {
      for (const task of episode.tasks) {
        taskIds.add(task.id);
      }
    }
    map.set(location.id, taskIds);
  }

  return map;
}

async function buildCurrentTaskCatalog(supabase) {
  const [missions, missionStops, missionTasks] = await Promise.all([
    fetchAll('missions', (from, to) =>
      supabase
        .from('missions')
        .select('id, title, city, is_published, created_at')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .range(from, to)
    ),
    fetchAll('mission_stops', (from, to) =>
      supabase
        .from('mission_stops')
        .select('id, mission_id, order')
        .order('mission_id', { ascending: true })
        .order('order', { ascending: true })
        .range(from, to)
    ),
    fetchAll('mission_tasks', (from, to) =>
      supabase
        .from('mission_tasks')
        .select('id, stop_id, order')
        .order('stop_id', { ascending: true })
        .order('order', { ascending: true })
        .range(from, to)
    )
  ]);

  const canonicalMissionMap = buildCanonicalMissionMap();
  const latestMissionByLocation = new Map();

  for (const mission of missions) {
    const key = `${normalize(mission.city)}::${normalize(mission.title)}`;
    const locationId = canonicalMissionMap.get(key) ?? mission.id;
    if (!latestMissionByLocation.has(locationId)) {
      latestMissionByLocation.set(locationId, mission);
    }
  }

  const stopIdsByMission = new Map();
  for (const stop of missionStops) {
    const current = stopIdsByMission.get(stop.mission_id) ?? [];
    current.push(stop.id);
    stopIdsByMission.set(stop.mission_id, current);
  }

  const taskIdsByStop = new Map();
  for (const task of missionTasks) {
    const current = taskIdsByStop.get(task.stop_id) ?? [];
    current.push(task.id);
    taskIdsByStop.set(task.stop_id, current);
  }

  const catalog = buildMockTaskCatalog();

  for (const [locationId, mission] of latestMissionByLocation.entries()) {
    const stopIds = stopIdsByMission.get(mission.id) ?? [];
    const taskIds = new Set();

    for (const stopId of stopIds) {
      for (const taskId of taskIdsByStop.get(stopId) ?? []) {
        taskIds.add(taskId);
      }
    }

    if (taskIds.size > 0) {
      catalog.set(locationId, taskIds);
    }
  }

  return catalog;
}

function buildResultReport(row, profileIdByCode, taskRows, currentTaskIds, duplicateLocationProgressRowCount) {
  const distinctTaskIds = new Set(taskRows.map((task) => task.task_id));
  const rowsByTaskId = new Map();
  for (const taskRow of taskRows) {
    const current = rowsByTaskId.get(taskRow.task_id) ?? [];
    current.push(taskRow);
    rowsByTaskId.set(taskRow.task_id, current);
  }

  const reasons = [];

  if (duplicateLocationProgressRowCount > 1) {
    reasons.push('duplicate_location_progress_rows');
  }

  if (isActiveReplay(row)) {
    reasons.push('active_replay_over_historical_completion');
  }

  if (!currentTaskIds || currentTaskIds.size === 0) {
    reasons.push('unknown_or_unmapped_location_catalog');
  }

  if (taskRows.length === 0) {
    reasons.push('missing_task_progress');
  }

  const duplicateTaskProgress = Array.from(rowsByTaskId.values()).some((rows) => rows.length > 1);
  if (duplicateTaskProgress) {
    reasons.push('duplicate_task_progress_rows');
  }

  const orphanTaskIds = currentTaskIds
    ? Array.from(distinctTaskIds).filter((taskId) => !currentTaskIds.has(taskId))
    : Array.from(distinctTaskIds);
  if (orphanTaskIds.length > 0) {
    reasons.push('task_ids_not_in_current_catalog');
  }

  const wrongRows = taskRows.filter((task) => task.status === 'wrong');
  if (wrongRows.length > 0) {
    reasons.push('nonfinal_wrong_status_present');
  }

  const finalRows = taskRows.filter((task) => task.status === 'correct' || task.status === 'unknown');
  const finalTaskIds = new Set(finalRows.map((task) => task.task_id));

  if (currentTaskIds && finalTaskIds.size !== currentTaskIds.size) {
    reasons.push('final_task_count_mismatch_with_current_catalog');
  }

  const correctCount = finalRows.filter((task) => task.status === 'correct').length;
  const taskCount = currentTaskIds?.size ?? 0;
  const newBestScore = correctCount * POINTS_PER_TASK;
  const newMissingPoints = getLocationMaxScore(taskCount) - newBestScore;
  const oldBestScore = typeof row.best_score === 'number' ? row.best_score : null;
  const oldPenaltyPoints = typeof row.penalty_points === 'number' ? row.penalty_points : null;
  const exact = reasons.length === 0;
  const unchanged = exact && oldBestScore === newBestScore && oldPenaltyPoints === newMissingPoints;
  const status = exact ? (unchanged ? 'unchanged' : 'would_update') : 'skipped';

  return {
    profileCode: row.profile_code,
    profileId: profileIdByCode.get(row.profile_code) ?? null,
    locationId: row.location_id,
    taskCount,
    correctCount,
    oldBestScore,
    newBestScore,
    oldPenaltyPoints,
    newPenaltyPoints: newMissingPoints,
    status,
    reasonIfSkipped: exact ? '' : reasons.join(', '),
    safeToApply: exact && !unchanged
  };
}

async function main() {
  const { apply, dryRun } = parseArgs(process.argv);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const [profiles, locationProgressRows, taskProgressRows, currentTaskCatalog] = await Promise.all([
    fetchAll('child_profiles', (from, to) =>
      supabase.from('child_profiles').select('id, profile_code').order('profile_code', { ascending: true }).range(from, to)
    ),
    fetchAll('child_location_progress', (from, to) =>
      supabase
        .from('child_location_progress')
        .select('profile_code, location_id, status, first_completed_at, completed_at, updated_at, best_score, penalty_points')
        .order('profile_code', { ascending: true })
        .order('location_id', { ascending: true })
        .range(from, to)
    ),
    fetchAll('child_task_progress', (from, to) =>
      supabase
        .from('child_task_progress')
        .select('profile_code, location_id, task_id, status')
        .order('profile_code', { ascending: true })
        .order('location_id', { ascending: true })
        .range(from, to)
    ),
    buildCurrentTaskCatalog(supabase)
  ]);

  const profileIdByCode = new Map(profiles.map((profile) => [profile.profile_code, profile.id]));
  const completedRows = locationProgressRows.filter(hasHistoricalCompletion);

  const taskRowsByResult = new Map();
  for (const row of taskProgressRows) {
    const key = `${row.profile_code}::${row.location_id}`;
    const current = taskRowsByResult.get(key) ?? [];
    current.push(row);
    taskRowsByResult.set(key, current);
  }

  const locationProgressCounts = new Map();
  for (const row of locationProgressRows) {
    const key = `${row.profile_code}::${row.location_id}`;
    locationProgressCounts.set(key, (locationProgressCounts.get(key) ?? 0) + 1);
  }

  const reports = completedRows.map((row) => {
    const key = `${row.profile_code}::${row.location_id}`;
    return buildResultReport(
      row,
      profileIdByCode,
      taskRowsByResult.get(key) ?? [],
      currentTaskCatalog.get(row.location_id),
      locationProgressCounts.get(key) ?? 0
    );
  });

  const safeUpdates = reports.filter((report) => report.safeToApply);
  const unchanged = reports.filter((report) => report.status === 'unchanged');
  const skipped = reports.filter((report) => report.status === 'skipped');

  console.log(`mode=${apply ? 'apply' : 'dry-run'}`);
  console.log(`completed_results=${reports.length}`);
  console.log(`would_update=${safeUpdates.length}`);
  console.log(`unchanged=${unchanged.length}`);
  console.log(`skipped=${skipped.length}`);
  console.log('');
  console.table(
    reports.map((report) => ({
      profile_code: report.profileCode,
      profile_id: report.profileId,
      location_id: report.locationId,
      task_count: report.taskCount,
      correct_count: report.correctCount,
      old_best_score: report.oldBestScore,
      new_best_score: report.newBestScore,
      old_penalty_points: report.oldPenaltyPoints,
      new_penalty_points: report.newPenaltyPoints,
      status: report.status,
      reason_if_skipped: report.reasonIfSkipped
    }))
  );

  if (dryRun && !apply) {
    console.log('dry-run complete: no database changes were made');
    return;
  }

  let updatedCount = 0;
  for (const report of safeUpdates) {
    const { error } = await supabase
      .from('child_location_progress')
      .update({
        best_score: report.newBestScore,
        penalty_points: report.newPenaltyPoints
      })
      .eq('profile_code', report.profileCode)
      .eq('location_id', report.locationId);

    if (error) {
      throw new Error(`update_failed ${report.profileCode}/${report.locationId}: ${error.message}`);
    }

    updatedCount += 1;
  }

  console.log(`apply complete: updated_rows=${updatedCount}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
