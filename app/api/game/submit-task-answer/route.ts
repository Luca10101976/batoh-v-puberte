import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import {
  MAX_TASK_ATTEMPTS,
  UNKNOWN_TASK_PENALTY,
  getTaskByLocationAndId,
  isTaskAnswerCorrect
} from "@/lib/task-validation";

type ChildProfileRow = {
  id: string;
  profile_code: string;
};

type ChildTaskProgressRow = {
  id: string;
  child_profile_id: string;
  profile_code: string;
  location_id: string;
  task_id: string;
  status: "correct" | "wrong" | "unknown";
  attempts: number;
  penalty_points: number;
};

type SubmitAction = "answer" | "mark_unknown" | "confirm_manual";

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
    action: "submit_task_answer",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 200,
    windowMinutes: 60,
    blockMinutes: 15
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
    taskId?: string;
    answer?: string;
    action?: SubmitAction;
    replayAttempts?: number;
  };

  const profileCode = normalizeCode(body.profileCode ?? "");
  const locationId = (body.locationId ?? "").trim();
  const taskId = (body.taskId ?? "").trim();
  const answer = typeof body.answer === "string" ? body.answer : "";
  const action: SubmitAction = body.action ?? "answer";

  if (!profileCode || !locationId || !taskId) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const task = await getTaskByLocationAndId(locationId, taskId);
  if (!task) {
    return NextResponse.json({ ok: false, error: "unknown_location_or_task" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: ownProfile } = await admin
    .from("child_profiles")
    .select("id, profile_code")
    .eq("parent_user_id", user.id)
    .eq("profile_code", profileCode)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "forbidden_profile" }, { status: 403 });
  }

  const { data: existingLocationProgressRow } = await admin
    .from("child_location_progress")
    .select("status, first_completed_at, completed_at")
    .eq("profile_code", ownProfile.profile_code)
    .eq("location_id", locationId)
    .limit(1)
    .maybeSingle<{
      status?: "in_progress" | "completed" | null;
      first_completed_at?: string | null;
      completed_at?: string | null;
    }>();

  const isReplayOfCompletedMission =
    existingLocationProgressRow?.status === "completed" ||
    Boolean(existingLocationProgressRow?.first_completed_at || existingLocationProgressRow?.completed_at);

  const { data: existingRow, error: existingError } = await admin
    .from("child_task_progress")
    .select("id, child_profile_id, profile_code, location_id, task_id, status, attempts, penalty_points")
    .eq("child_profile_id", ownProfile.id)
    .eq("location_id", locationId)
    .eq("task_id", taskId)
    .limit(1)
    .maybeSingle<ChildTaskProgressRow>();

  if (existingError && existingError.code !== "PGRST116") {
    return NextResponse.json({ ok: false, error: "progress_load_failed" }, { status: 500 });
  }

  if (!isReplayOfCompletedMission && existingRow && (existingRow.status === "correct" || existingRow.status === "unknown")) {
    return NextResponse.json({
      ok: true,
      status: existingRow.status,
      attempts: existingRow.attempts,
      remainingAttempts: 0,
      penaltyPointsForTask: existingRow.penalty_points,
      locked: true
    });
  }

  const replayAttempts =
    typeof body.replayAttempts === "number" && Number.isFinite(body.replayAttempts)
      ? Math.max(0, Math.floor(body.replayAttempts))
      : 0;
  const currentAttempts = isReplayOfCompletedMission
    ? replayAttempts
    : Math.max(0, existingRow?.attempts ?? 0);
  let nextStatus: "correct" | "wrong" | "unknown" = "wrong";
  let nextAttempts = currentAttempts;
  let penaltyPointsForTask = 0;

  if (action === "confirm_manual") {
    if (task.type !== "photo") {
      return NextResponse.json({ ok: false, error: "manual_confirm_not_allowed" }, { status: 400 });
    }
    nextStatus = "correct";
    nextAttempts = Math.max(1, currentAttempts);
  } else if (action === "mark_unknown") {
    nextStatus = "unknown";
    nextAttempts = Math.max(1, currentAttempts);
    penaltyPointsForTask = UNKNOWN_TASK_PENALTY;
  } else {
    if (task.type === "photo") {
      return NextResponse.json({ ok: false, error: "photo_task_requires_manual_action" }, { status: 400 });
    }
    if (!answer.trim()) {
      return NextResponse.json({ ok: false, error: "missing_answer" }, { status: 400 });
    }

    nextAttempts = currentAttempts + 1;
    if (isTaskAnswerCorrect(task, answer)) {
      nextStatus = "correct";
    } else if (nextAttempts >= MAX_TASK_ATTEMPTS) {
      nextStatus = "unknown";
      penaltyPointsForTask = UNKNOWN_TASK_PENALTY;
      nextAttempts = MAX_TASK_ATTEMPTS;
    } else {
      nextStatus = "wrong";
    }
  }

  if (nextAttempts > MAX_TASK_ATTEMPTS) {
    nextAttempts = MAX_TASK_ATTEMPTS;
  }

  const remainingAttempts =
    nextStatus === "correct" || nextStatus === "unknown" ? 0 : Math.max(0, MAX_TASK_ATTEMPTS - nextAttempts);

  if (isReplayOfCompletedMission) {
    return NextResponse.json({
      ok: true,
      status: nextStatus,
      attempts: nextAttempts,
      remainingAttempts,
      penaltyPointsForTask,
      locked: false,
      replay: true
    });
  }

  const payload = {
    child_profile_id: ownProfile.id,
    profile_code: ownProfile.profile_code,
    location_id: locationId,
    task_id: taskId,
    status: nextStatus,
    attempts: nextAttempts,
    penalty_points: penaltyPointsForTask,
    first_answered_at: existingRow ? undefined : new Date().toISOString(),
    last_answered_at: new Date().toISOString()
  };

  let saveError: { code?: string } | null = null;
  if (existingRow?.id) {
    const { error } = await admin
      .from("child_task_progress")
      .update({
        status: payload.status,
        attempts: payload.attempts,
        penalty_points: payload.penalty_points,
        last_answered_at: payload.last_answered_at
      })
      .eq("id", existingRow.id);
    saveError = error;
  } else {
    const { error } = await admin.from("child_task_progress").insert(payload);
    saveError = error;
  }

  if (saveError?.code === "42P01") {
    return NextResponse.json(
      { ok: false, error: "missing_task_progress_table", hint: "run_supabase_online_task_progress_sql" },
      { status: 500 }
    );
  }
  if (saveError) {
    return NextResponse.json({ ok: false, error: "progress_save_failed" }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const { data: locationProgressRow, error: locationProgressReadError } = await admin
    .from("child_location_progress")
    .select("profile_code, location_id, status")
    .eq("profile_code", ownProfile.profile_code)
    .eq("location_id", locationId)
    .limit(1)
    .maybeSingle<{ profile_code: string; location_id: string; status?: "in_progress" | "completed" | null }>();

  if (!locationProgressReadError || locationProgressReadError.code === "PGRST116") {
    if (!locationProgressRow) {
      const { error: insertInProgressError } = await admin.from("child_location_progress").insert({
        profile_code: ownProfile.profile_code,
        location_id: locationId,
        completed_at: nowIso,
        status: "in_progress",
        completion_source: "gameplay",
        updated_at: nowIso
      });
      if (insertInProgressError?.code === "42703") {
        await admin.from("child_location_progress").insert({
          profile_code: ownProfile.profile_code,
          location_id: locationId,
          completed_at: nowIso
        });
      }
    } else if (locationProgressRow.status !== "completed") {
      const { error: updateInProgressError } = await admin
        .from("child_location_progress")
        .update({
          status: "in_progress",
          completion_source: "gameplay",
          updated_at: nowIso
        })
        .eq("profile_code", ownProfile.profile_code)
        .eq("location_id", locationId);
      if (updateInProgressError?.code === "42703") {
        await admin
          .from("child_location_progress")
          .update({ completed_at: nowIso })
          .eq("profile_code", ownProfile.profile_code)
          .eq("location_id", locationId);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    attempts: nextAttempts,
    remainingAttempts,
    penaltyPointsForTask,
    locked: false
  });
}
