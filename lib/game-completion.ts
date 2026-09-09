import { getLocationTaskIds } from "@/lib/task-validation";
import { isMissionCompleted, scoreTaskProgress, type MissionResult } from "@/lib/mission-completion";
import { deriveCompletionUpdate } from "@/lib/location-completion-state";
import { finishRun, isMissingColumnError, loadRunTaskProgress } from "@/lib/game-run";

// R23: JEDINÁ cesta dokončení hry – pro sólo i pro skupinovou výpravu.
//
// Pravidla (schválená produktová rozhodnutí):
//   P2 – každý účastník má vlastní odpovědi a vlastní body. Skóre vedoucího se
//        nikdy nekopíruje ostatním.
//   P3 – hru dokončí jen ten, kdo má v této výpravě uzavřené VŠECHNY úkoly hry.
//   P4 – nula bodů je platné dokončení, pokud hráč všechny úkoly skutečně uzavřel.
//   T1 – body vznikají výhradně z uzavřených úkolů v databázi, nikdy z klienta.
//   T2 – zápis dokončení nesmí být filtrovaný podle penalty_points; účastník
//        s rozehraným řádkem se nesmí přeskočit.
//   T7 – čas dokončení určuje server.
//
// child_location_progress má po R23 jedinou roli: NEJLEPŠÍ HISTORICKÝ VÝSLEDEK
// hráče v dané hře. Aktuální rozehrání drží výprava (child_game_sessions).
// Nejlepší skóre se nikdy nezhorší, penalizace se nikdy nezvýší.

type ProfileRow = { id: string; profile_code: string };

export type ParticipantResult = {
  childProfileId: string;
  profileCode: string;
  result: MissionResult;
  completed: boolean;
  firstCompletion: boolean;
};

export type CompleteRunOutcome =
  | { ok: true; participants: ParticipantResult[]; completedCodes: string[]; firstCompletionCodes: string[] }
  | { ok: false; error: "progress_load_failed" | "save_failed" };

type ExistingProgressRow = {
  profile_code: string;
  penalty_points?: number | null;
  first_completed_at?: string | null;
  best_score?: number | null;
  status?: "in_progress" | "completed" | null;
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

/**
 * Vyhodnotí a zapíše dokončení hry pro všechny účastníky jedné výpravy.
 * Nezapisuje nic hráči, který hru v této výpravě nedokončil (P3).
 */
export async function completeRunForParticipants(
  admin: any,
  args: {
    runId: string | null;
    locationId: string;
    participantChildProfileIds: string[];
    source: "gameplay" | "expedition";
  }
): Promise<CompleteRunOutcome> {
  const completedAt = new Date().toISOString();
  const gameplayUnlockEligible = true;

  const { data: profileRows, error: profileError } = await admin
    .from("child_profiles")
    .select("id, profile_code")
    .in("id", args.participantChildProfileIds);
  if (profileError) {
    return { ok: false, error: "progress_load_failed" };
  }
  const profiles = (profileRows as ProfileRow[] | null) ?? [];
  if (profiles.length === 0) {
    return { ok: false, error: "progress_load_failed" };
  }

  let taskIds: string[];
  let progressByChild: Map<string, Array<{ task_id: string; status: "correct" | "wrong" | "unknown" }>>;
  try {
    [taskIds, progressByChild] = await Promise.all([
      getLocationTaskIds(args.locationId),
      loadRunTaskProgress(admin, {
        runId: args.runId,
        locationId: args.locationId,
        childProfileIds: profiles.map((row) => row.id)
      })
    ]);
  } catch {
    // Bez autoritativních dat se nesmí zapsat žádný výsledek (fail-closed).
    return { ok: false, error: "progress_load_failed" };
  }

  const participants: ParticipantResult[] = profiles.map((profile) => {
    const result = scoreTaskProgress(taskIds, progressByChild.get(profile.id) ?? []);
    return {
      childProfileId: profile.id,
      profileCode: normalizeCode(profile.profile_code),
      result,
      completed: isMissionCompleted(result),
      firstCompletion: false
    };
  });

  const finished = participants.filter((entry) => entry.completed);
  if (finished.length === 0) {
    return { ok: true, participants, completedCodes: [], firstCompletionCodes: [] };
  }

  const codes = finished.map((entry) => entry.profileCode);
  const { data: existingRows, error: existingError } = await admin
    .from("child_location_progress")
    .select("profile_code, penalty_points, first_completed_at, best_score, status")
    .eq("location_id", args.locationId)
    .in("profile_code", codes);
  if (existingError) {
    return { ok: false, error: "progress_load_failed" };
  }
  const existingByCode = new Map(
    ((existingRows as ExistingProgressRow[] | null) ?? []).map((row) => [normalizeCode(row.profile_code), row])
  );

  for (const entry of finished) {
    const existing = existingByCode.get(entry.profileCode) ?? null;
    const decision = deriveCompletionUpdate({
      existing,
      finalScore: entry.result.score,
      finalMissingPoints: entry.result.missingPoints,
      source: args.source,
      hasExtendedProgressColumns: true
    });
    entry.firstCompletion = decision.firstCompletionTriggered || !existing;

    if (!existing) {
      const payload: Record<string, unknown> = {
        profile_code: entry.profileCode,
        child_profile_id: entry.childProfileId,
        location_id: args.locationId,
        completed_at: completedAt,
        penalty_points: entry.result.missingPoints,
        status: "completed",
        completion_source: args.source,
        best_score: entry.result.score,
        first_completed_at: gameplayUnlockEligible ? completedAt : null
      };
      let insert = await admin.from("child_location_progress").insert(payload);
      if (isMissingColumnError(insert.error)) {
        const { child_profile_id: _ignored, ...withoutChildId } = payload;
        insert = await admin.from("child_location_progress").insert(withoutChildId);
      }
      if (insert.error) {
        return { ok: false, error: "save_failed" };
      }
      continue;
    }

    if (!decision.shouldUpdate) {
      continue;
    }

    // T2: žádný filtr přes penalty_points. Monotónnost hlídá payload, ne WHERE.
    const updatePayload: Record<string, unknown> = {
      completed_at: completedAt,
      status: "completed",
      completion_source: args.source,
      child_profile_id: entry.childProfileId
    };
    if (decision.missingPointsUpdated) {
      updatePayload.penalty_points = entry.result.missingPoints;
    }
    if (decision.bestScoreUpdated) {
      updatePayload.best_score = entry.result.score;
    }
    if (decision.firstCompletionTriggered) {
      updatePayload.first_completed_at = completedAt;
    }

    let update = await admin
      .from("child_location_progress")
      .update(updatePayload)
      .eq("profile_code", entry.profileCode)
      .eq("location_id", args.locationId);
    if (isMissingColumnError(update.error)) {
      const { child_profile_id: _ignored, ...withoutChildId } = updatePayload;
      update = await admin
        .from("child_location_progress")
        .update(withoutChildId)
        .eq("profile_code", entry.profileCode)
        .eq("location_id", args.locationId);
    }
    if (update.error) {
      return { ok: false, error: "save_failed" };
    }
  }

  if (args.runId) {
    await finishRun(admin, args.runId);
  }

  return {
    ok: true,
    participants,
    completedCodes: finished.map((entry) => entry.profileCode),
    firstCompletionCodes: finished.filter((entry) => entry.firstCompletion).map((entry) => entry.profileCode)
  };
}
