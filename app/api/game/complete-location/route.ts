import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getGameplayLocation } from "@/lib/gameplay-server";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import { computeMissionPenalty } from "@/lib/scoring";
import { computePenaltyFromTaskProgress } from "@/lib/task-validation";
import { deriveCompletionUpdate } from "@/lib/location-completion-state";

type ChildProfileRow = {
  id: string;
  profile_code: string;
};

type AcceptedInviteRow = {
  inviter_profile_code: string;
  invitee_profile_code: string;
};

type ProgressUpsertRow = {
  profile_code: string;
  location_id: string;
  completed_at: string;
  penalty_points?: number;
  status?: "in_progress" | "completed";
  completion_source?: "gameplay" | "manual" | "expedition";
  best_score?: number;
  first_completed_at?: string | null;
};

type ExistingProgressRow = {
  profile_code: string;
  penalty_points?: number | null;
  first_completed_at?: string | null;
  best_score?: number | null;
  status?: "in_progress" | "completed" | null;
  completion_source?: "gameplay" | "manual" | "expedition" | null;
};

type ChildCodeLookupRow = {
  id: string;
  profile_code: string;
  player_code?: string | null;
};

type TaskProgressPenaltyRow = {
  child_profile_id: string;
  task_id: string;
  status: "correct" | "wrong" | "unknown";
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: "missing_supabase_env" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const {
    data: { user },
    error: authError
  } = await authClient.auth.getUser(accessToken);

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit({
    action: "complete_location",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 120,
    windowMinutes: 60,
    blockMinutes: 10
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        retry_after: rateLimitResult.retryAfterSeconds ?? 60
      },
      { status: 429 }
    );
  }

  const body = (await request.json()) as {
    profileCode?: string;
    locationId?: string;
    expeditionId?: string | null;
    mode?: "solo" | "group";
    completedAt?: string;
    unknownTaskIds?: string[];
    unknownCount?: number;
    penaltyPoints?: number;
    source?: "gameplay" | "manual" | "expedition";
  };

  const profileCode = normalizeCode(body.profileCode ?? "");
  const locationId = (body.locationId ?? "").trim();
  const expeditionId = (body.expeditionId ?? "").trim();
  const mode = body.mode === "group" ? "group" : "solo";
  const source: "gameplay" | "manual" | "expedition" =
    body.source === "manual" || body.source === "expedition" ? body.source : "gameplay";
  const completedAt = body.completedAt ? new Date(body.completedAt).toISOString() : new Date().toISOString();
  const scoring = computeMissionPenalty(locationId, {
    unknownTaskIds: body.unknownTaskIds,
    unknownCount: body.unknownCount,
    penaltyPoints: body.penaltyPoints
  });
  const penaltyPoints = scoring.penaltyPoints;
  const bestScore = Math.max(0, 120 - penaltyPoints);

  if (!profileCode || !locationId) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  if (source === "manual") {
    return NextResponse.json(
      {
        ok: false,
        error: "manual_completion_removed",
        message: "Papírová verze už se bodově neuzavírá ručně. Odpovědi zadej do stejné mise v aplikaci."
      },
      { status: 400 }
    );
  }

  const isKnownLocation = await getGameplayLocation(locationId);
  if (!isKnownLocation) {
    return NextResponse.json({ ok: false, error: "unknown_location" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: ownProfile } = await admin
    .from("child_profiles")
    .select("id, profile_code")
    .eq("profile_code", profileCode)
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!ownProfile?.id) {
    // Security hard stop: never auto-create profile from client-supplied profileCode.
    // Profile must already belong to the authenticated parent account.
    return NextResponse.json({ ok: false, error: "forbidden_profile" }, { status: 403 });
  }

  const participantCodes = new Set<string>([profileCode]);

  if (mode === "group" && expeditionId) {
    const { data: acceptedRows } = await admin
      .from("child_expedition_invites")
      .select("inviter_profile_code, invitee_profile_code")
      .eq("expedition_id", expeditionId)
      .eq("status", "accepted")
      .or(`inviter_child_profile_id.eq.${ownProfile.id},invitee_child_profile_id.eq.${ownProfile.id}`);

    ((acceptedRows as AcceptedInviteRow[] | null) ?? []).forEach((row) => {
      participantCodes.add(normalizeCode(row.inviter_profile_code));
      participantCodes.add(normalizeCode(row.invitee_profile_code));
    });
  }

  const safeParticipants = Array.from(participantCodes).slice(0, 8);

  const [profilesByProfileCodeResult, profilesByPlayerCodeResult] = await Promise.all([
    admin.from("child_profiles").select("id, profile_code, player_code").in("profile_code", safeParticipants),
    admin.from("child_profiles").select("id, profile_code, player_code").in("player_code", safeParticipants)
  ]);

  const codeMap = new Map<string, string>();
  const childProfileIdByCanonicalCode = new Map<string, string>();
  ((profilesByProfileCodeResult.data as ChildCodeLookupRow[] | null) ?? []).forEach((row) => {
    const canonical = normalizeCode(row.profile_code);
    codeMap.set(canonical, canonical);
    childProfileIdByCanonicalCode.set(canonical, row.id);
    if (row.player_code) {
      codeMap.set(normalizeCode(row.player_code), canonical);
    }
  });
  ((profilesByPlayerCodeResult.data as ChildCodeLookupRow[] | null) ?? []).forEach((row) => {
    const canonical = normalizeCode(row.profile_code);
    codeMap.set(canonical, canonical);
    childProfileIdByCanonicalCode.set(canonical, row.id);
    if (row.player_code) {
      codeMap.set(normalizeCode(row.player_code), canonical);
    }
  });

  const canonicalParticipants = Array.from(
    new Set(safeParticipants.map((code) => codeMap.get(normalizeCode(code))).filter((code): code is string => Boolean(code)))
  );
  if (!canonicalParticipants.includes(normalizeCode(ownProfile.profile_code))) {
    canonicalParticipants.unshift(normalizeCode(ownProfile.profile_code));
  }
  childProfileIdByCanonicalCode.set(normalizeCode(ownProfile.profile_code), ownProfile.id);

  const canonicalParticipantChildIds = canonicalParticipants
    .map((code) => childProfileIdByCanonicalCode.get(code))
    .filter((id): id is string => Boolean(id));

  const penaltyByCode = new Map<string, number>(canonicalParticipants.map((code) => [code, penaltyPoints]));
  if (canonicalParticipantChildIds.length > 0) {
    const { data: taskProgressRows, error: taskProgressError } = await admin
      .from("child_task_progress")
      .select("child_profile_id, task_id, status")
      .eq("location_id", locationId)
      .in("child_profile_id", canonicalParticipantChildIds);

    if (!taskProgressError) {
      const byChildId = new Map<string, TaskProgressPenaltyRow[]>();
      ((taskProgressRows as TaskProgressPenaltyRow[] | null) ?? []).forEach((row) => {
        const current = byChildId.get(row.child_profile_id) ?? [];
        current.push(row);
        byChildId.set(row.child_profile_id, current);
      });

      for (const code of canonicalParticipants) {
        const childId = childProfileIdByCanonicalCode.get(code);
        if (!childId) {
          continue;
        }
        const rows = byChildId.get(childId) ?? [];
        if (rows.length === 0) {
          continue;
        }
        const computed = await computePenaltyFromTaskProgress(locationId, rows);
        penaltyByCode.set(code, computed.penaltyPoints);
      }
    }
  }

  const { data: existingRowsWithPenalty, error: existingRowsWithPenaltyError } = await admin
    .from("child_location_progress")
    .select("profile_code, penalty_points, first_completed_at, best_score, status, completion_source")
    .eq("location_id", locationId)
    .in("profile_code", canonicalParticipants);

  let existingRows = (existingRowsWithPenalty as ExistingProgressRow[] | null) ?? [];
  const hasExtendedProgressColumns = existingRowsWithPenaltyError?.code !== "42703";
  const hasPenaltyColumn = hasExtendedProgressColumns;
  if (existingRowsWithPenaltyError?.code === "42703") {
    const { data: legacyExistingRows } = await admin
      .from("child_location_progress")
      .select("profile_code")
      .eq("location_id", locationId)
      .in("profile_code", canonicalParticipants);
    existingRows = ((legacyExistingRows as Array<{ profile_code: string }> | null) ?? []).map((row) => ({
      profile_code: row.profile_code
    }));
  }

  const existingByCode = new Map(existingRows.map((row) => [normalizeCode(row.profile_code), row]));
  const existingCodes = new Set(Array.from(existingByCode.keys()));
  const gameplayUnlockEligible = source === "gameplay" || source === "expedition";
  const firstCompletionCodes = new Set<string>();

  const rowsToInsert: ProgressUpsertRow[] = canonicalParticipants
    .filter((code) => !existingCodes.has(normalizeCode(code)))
    .map((code) => ({
      profile_code: code,
      location_id: locationId,
      completed_at: completedAt,
      penalty_points: Math.max(0, penaltyByCode.get(code) ?? penaltyPoints),
      status: "completed",
      completion_source: source,
      best_score: Math.max(0, 120 - Math.max(0, penaltyByCode.get(code) ?? penaltyPoints)),
      first_completed_at: gameplayUnlockEligible ? completedAt : null
    }));
  if (gameplayUnlockEligible) {
    rowsToInsert.forEach((row) => firstCompletionCodes.add(normalizeCode(row.profile_code)));
  }

  const rowsToUpdate = canonicalParticipants.filter((code) => {
    const existing = existingByCode.get(normalizeCode(code));
    if (!existing) {
      return false;
    }

    const finalPenalty = Math.max(0, penaltyByCode.get(code) ?? penaltyPoints);
    const decision = deriveCompletionUpdate({
      existing,
      finalPenalty,
      source,
      hasExtendedProgressColumns
    });

    return decision.shouldUpdate;
  });

  if (rowsToInsert.length === 0 && rowsToUpdate.length === 0) {
    return NextResponse.json({
      ok: true,
      participantCodes: canonicalParticipants,
      alreadyCompleted: true
    });
  }

  let saveError: { code?: string } | null = null;

  if (rowsToInsert.length > 0) {
    const { error: saveWithPenaltyError } = await admin.from("child_location_progress").insert(rowsToInsert);

    if (saveWithPenaltyError?.code === "42703") {
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
      const { error: saveFallbackError } = await admin.from("child_location_progress").insert(fallbackRows);
      saveError = saveFallbackError;
    } else {
      saveError = saveWithPenaltyError;
    }
  }

  if (saveError) {
    return NextResponse.json({ ok: false, error: "save_progress_failed" }, { status: 500 });
  }

  if (rowsToUpdate.length > 0) {
    for (const profile_code of rowsToUpdate) {
      const existing = existingByCode.get(normalizeCode(profile_code));
      if (!existing) {
        continue;
      }

      const finalPenalty = Math.max(0, penaltyByCode.get(profile_code) ?? penaltyPoints);
      const finalBestScore = Math.max(0, 120 - finalPenalty);
      const decision = deriveCompletionUpdate({
        existing,
        finalPenalty,
        source,
        hasExtendedProgressColumns
      });

      const nextPayload: Record<string, unknown> = {
        completed_at: completedAt
      };

      if (typeof existing.penalty_points !== "number" || existing.penalty_points > finalPenalty) {
        nextPayload.penalty_points = finalPenalty;
      }
      if (hasExtendedProgressColumns) {
        nextPayload.status = "completed";
        nextPayload.completion_source = source;
        if (decision.bestScoreUpdated) {
          nextPayload.best_score = finalBestScore;
        }
        if (decision.firstCompletionTriggered) {
          nextPayload.first_completed_at = completedAt;
          firstCompletionCodes.add(normalizeCode(profile_code));
        }
      }

      const { error: updateError } = await admin
        .from("child_location_progress")
        .update(nextPayload)
        .eq("profile_code", profile_code)
        .eq("location_id", locationId);

      if (updateError) {
        return NextResponse.json({ ok: false, error: "save_progress_failed" }, { status: 500 });
      }
    }
  }

  try {
    await admin.from("child_security_events").insert({
      actor_child_profile_id: ownProfile.id,
      event_type: "location_completed",
      metadata: {
        location_id: locationId,
        mode,
        source,
        expedition_id: expeditionId || null,
        participants: canonicalParticipants
      }
    });
  } catch {
    // best effort audit write
  }

  return NextResponse.json({
    ok: true,
    participantCodes: canonicalParticipants,
    firstCompletionProfileCodes: Array.from(firstCompletionCodes)
  });
}
