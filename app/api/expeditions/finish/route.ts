import { NextRequest, NextResponse } from "next/server";
import { locations } from "@/lib/mock-data";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import { getAuthenticatedUser, getOwnedChildProfile, getSession } from "@/app/api/expeditions/_shared";
import { computeMissionPenalty } from "@/lib/scoring";
import { computePenaltyFromTaskProgress } from "@/lib/task-validation";

type SessionPlayerRow = {
  child_profile_id: string;
  status: "invited" | "accepted" | "declined" | "removed";
};

type ChildProfileCodeRow = {
  id: string;
  profile_code: string;
  player_code?: string | null;
};

type ExistingProgressRow = {
  profile_code: string;
  penalty_points?: number | null;
  first_completed_at?: string | null;
  best_score?: number | null;
  status?: "in_progress" | "completed" | null;
};

type TaskProgressPenaltyRow = {
  task_id: string;
  status: "correct" | "wrong" | "unknown";
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.error === "unauthorized" ? 401 : 500 });
  }

  const rateLimitResult = await checkRateLimit({
    action: "expeditions_finish",
    ip: getRequestIpAddress(request),
    userId: auth.user.id,
    limit: 60,
    windowMinutes: 60,
    blockMinutes: 10
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after: rateLimitResult.retryAfterSeconds ?? 60 },
      { status: 429 }
    );
  }

  const body = (await request.json()) as {
    playerCode?: string;
    profileCode?: string;
    sessionId?: string;
    missionId?: string;
    completedAt?: string;
    unknownTaskIds?: string[];
    unknownCount?: number;
    penaltyPoints?: number;
  };

  const sessionId = (body.sessionId ?? "").trim();
  const missionId = (body.missionId ?? "").trim();
  const completedAt = body.completedAt ? new Date(body.completedAt).toISOString() : new Date().toISOString();
  const scoring = computeMissionPenalty(missionId, {
    unknownTaskIds: body.unknownTaskIds,
    unknownCount: body.unknownCount,
    penaltyPoints: body.penaltyPoints
  });
  let penaltyPoints = scoring.penaltyPoints;

  if (!sessionId || !missionId) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const isKnownMission = locations.some((location) => location.id === missionId);
  if (!isKnownMission) {
    return NextResponse.json({ ok: false, error: "unknown_mission" }, { status: 400 });
  }

  const ownProfile = await getOwnedChildProfile(auth.admin, auth.user.id, body.playerCode ?? body.profileCode);
  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
  }

  const session = await getSession(auth.admin, sessionId);
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "session_not_found" }, { status: 404 });
  }

  if (session.leader_child_profile_id !== ownProfile.id) {
    return NextResponse.json({ ok: false, error: "leader_only" }, { status: 403 });
  }

  if (session.status !== "active") {
    return NextResponse.json({ ok: false, error: "session_not_active" }, { status: 409 });
  }

  if (session.mission_id && session.mission_id !== missionId) {
    return NextResponse.json({ ok: false, error: "mission_mismatch" }, { status: 409 });
  }

  const { data: playersData } = await auth.admin
    .from("child_game_session_players")
    .select("child_profile_id, status")
    .eq("session_id", sessionId)
    .eq("status", "accepted");

  const acceptedPlayers = (playersData as SessionPlayerRow[] | null) ?? [];
  const acceptedIds = Array.from(new Set(acceptedPlayers.map((row) => row.child_profile_id)));

  if (acceptedIds.length === 0) {
    return NextResponse.json({ ok: false, error: "no_accepted_players" }, { status: 409 });
  }

  const { data: profilesData } = await auth.admin
    .from("child_profiles")
    .select("id, profile_code, player_code")
    .in("id", acceptedIds);

  const profiles = (profilesData as ChildProfileCodeRow[] | null) ?? [];
  const profileCodes = Array.from(new Set(profiles.map((profile) => normalizeCode(profile.profile_code))));

  const { data: leaderTaskProgressRows, error: leaderTaskProgressError } = await auth.admin
    .from("child_task_progress")
    .select("task_id, status")
    .eq("child_profile_id", ownProfile.id)
    .eq("location_id", missionId);

  if (!leaderTaskProgressError) {
    const computed = await computePenaltyFromTaskProgress(missionId, (leaderTaskProgressRows as TaskProgressPenaltyRow[] | null) ?? []);
    if (computed.totalTasks > 0) {
      penaltyPoints = computed.penaltyPoints;
    }
  }

  const { data: existingRowsWithPenalty, error: existingRowsWithPenaltyError } = await auth.admin
    .from("child_location_progress")
    .select("profile_code, penalty_points, first_completed_at, best_score, status")
    .eq("location_id", missionId)
    .in("profile_code", profileCodes);

  let existingRows = (existingRowsWithPenalty as ExistingProgressRow[] | null) ?? [];
  const hasExtendedProgressColumns = existingRowsWithPenaltyError?.code !== "42703";
  const hasPenaltyColumn = hasExtendedProgressColumns;
  if (existingRowsWithPenaltyError?.code === "42703") {
    const { data: legacyExistingRows } = await auth.admin
      .from("child_location_progress")
      .select("profile_code")
      .eq("location_id", missionId)
      .in("profile_code", profileCodes);
    existingRows = ((legacyExistingRows as Array<{ profile_code: string }> | null) ?? []).map((row) => ({
      profile_code: row.profile_code
    }));
  }

  const existingByCode = new Map(existingRows.map((row) => [normalizeCode(row.profile_code), row]));
  const existingCodes = new Set(Array.from(existingByCode.keys()));

  const rowsToInsert = profileCodes
    .filter((code) => !existingCodes.has(code))
    .map((code) => ({
      profile_code: code,
      location_id: missionId,
      completed_at: completedAt,
      penalty_points: penaltyPoints,
      status: "completed" as const,
      completion_source: "expedition" as const,
      best_score: Math.max(0, 120 - penaltyPoints),
      first_completed_at: completedAt
    }));

  const rowsToImprove = profileCodes.filter((code) => {
    const existing = existingByCode.get(code);
    if (!existing) {
      return false;
    }
    if (typeof existing.penalty_points === "number") {
      return existing.penalty_points > penaltyPoints;
    }
    return hasPenaltyColumn;
  });

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await auth.admin.from("child_location_progress").insert(rowsToInsert);
    if (insertError?.code === "42703") {
      const fallbackRows = rowsToInsert.map(
        ({
          penalty_points: _ignoredPenalty,
          status: _ignoredStatus,
          completion_source: _ignoredSource,
          best_score: _ignoredBestScore,
          first_completed_at: _ignoredFirstCompletedAt,
          ...row
        }) => row
      );
      const { error: fallbackError } = await auth.admin.from("child_location_progress").insert(fallbackRows);
      if (fallbackError) {
        return NextResponse.json({ ok: false, error: "progress_save_failed" }, { status: 500 });
      }
    } else if (insertError) {
      return NextResponse.json({ ok: false, error: "progress_save_failed" }, { status: 500 });
    }
  }

  if (hasPenaltyColumn && rowsToImprove.length > 0) {
    for (const profile_code of rowsToImprove) {
      const existing = existingByCode.get(profile_code);
      if (!existing) {
        continue;
      }

      let updateError: { code?: string } | null = null;
      if (typeof existing.penalty_points === "number") {
        const updatePayload: Record<string, unknown> = {
          penalty_points: penaltyPoints,
          completed_at: completedAt
        };
        if (hasExtendedProgressColumns) {
          updatePayload.status = "completed";
          updatePayload.completion_source = "expedition";
          updatePayload.best_score = Math.max(0, 120 - penaltyPoints);
          if (!existing.first_completed_at) {
            updatePayload.first_completed_at = completedAt;
          }
        }
        const { error } = await auth.admin
          .from("child_location_progress")
          .update(updatePayload)
          .eq("profile_code", profile_code)
          .eq("location_id", missionId)
          .gt("penalty_points", penaltyPoints);
        updateError = error;
      } else {
        const updatePayload: Record<string, unknown> = {
          penalty_points: penaltyPoints,
          completed_at: completedAt
        };
        if (hasExtendedProgressColumns) {
          updatePayload.status = "completed";
          updatePayload.completion_source = "expedition";
          updatePayload.best_score = Math.max(0, 120 - penaltyPoints);
          if (!existing.first_completed_at) {
            updatePayload.first_completed_at = completedAt;
          }
        }
        const { error } = await auth.admin
          .from("child_location_progress")
          .update(updatePayload)
          .eq("profile_code", profile_code)
          .eq("location_id", missionId)
          .is("penalty_points", null);
        updateError = error;
      }

      if (updateError) {
        return NextResponse.json({ ok: false, error: "progress_save_failed" }, { status: 500 });
      }
    }
  }

  const nowIso = new Date().toISOString();
  const { error: finishError } = await auth.admin
    .from("child_game_sessions")
    .update({
      status: "finished",
      mission_id: missionId,
      finished_at: nowIso
    } as never)
    .eq("id", sessionId)
    .eq("status", "active");

  if (finishError) {
    return NextResponse.json({ ok: false, error: "session_finish_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    missionId,
    participantCodes: profileCodes
  });
}
