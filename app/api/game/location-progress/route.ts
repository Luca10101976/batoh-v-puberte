import { NextRequest, NextResponse } from "next/server";
import { gameAccessHttpStatus, resolveServerGameAccess } from "@/lib/game-access-server";
import { findActiveRunForPlayer, isMissingColumnError } from "@/lib/game-run";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimitSafe, getRequestIpAddress } from "@/lib/rate-limit";
import { getGameplayEnding, getGameplayLocation } from "@/lib/gameplay-server";
import { getLocationMaxScore } from "@/lib/game-rules";
import { loadConfirmedStopTransitions } from "@/lib/stop-transition-server";
import { isCompletedLocationProgress } from "@/lib/location-progress-state";

type ChildProfileRow = {
  id: string;
  profile_code: string;
};

type TaskProgressRow = {
  hint_used_at?: string | null;
  task_id: string;
  status: "correct" | "wrong" | "unknown";
  attempts: number;
};

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

  const rateLimitResult = await checkRateLimitSafe({
    action: "location_progress",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 120,
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
  };

  const profileCode = (body.profileCode ?? "").trim().toUpperCase();
  const locationId = (body.locationId ?? "").trim();
  if (!profileCode || !locationId) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const knownLocation = await getGameplayLocation(locationId);
  if (!knownLocation) {
    return NextResponse.json({ ok: false, error: "unknown_location" }, { status: 400 });
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

  // R22: herní zámek se vynucuje na serveru (fail-closed), ne jen v UI.
  const access = await resolveServerGameAccess(admin, ownProfile.profile_code, locationId, {
    childProfileId: ownProfile.id
  });
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, error: access.reason === "not_published" ? "unknown_location" : "location_locked" },
      { status: gameAccessHttpStatus(access.reason) }
    );
  }

  // R23: vrací se postup AKTUÁLNÍ výpravy. Odpovědi z dřívějších průchodů zůstávají
  // v databázi u své výpravy, ale do rozehrané hry se nemíchají.
  const run = await findActiveRunForPlayer(admin, ownProfile.id, locationId);
  const taskQuery = () =>
    admin
      .from("child_task_progress")
      .select("task_id, status, attempts, hint_used_at")
      .eq("child_profile_id", ownProfile.id)
      .eq("location_id", locationId);

  let taskRows: TaskProgressRow[] = [];
  if (run) {
    let { data, error } = (await taskQuery().eq("session_id", run.id)) as {
      data: TaskProgressRow[] | null;
      error: { code?: string; message?: string } | null;
    };
    if (error && /hint_used_at/i.test(error.message ?? "")) {
      // Prostředí bez migrace R25.
      ({ data, error } = (await admin
        .from("child_task_progress")
        .select("task_id, status, attempts")
        .eq("child_profile_id", ownProfile.id)
        .eq("location_id", locationId)
        .eq("session_id", run.id)) as { data: TaskProgressRow[] | null; error: { code?: string; message?: string } | null });
    }
    if (isMissingColumnError(error)) {
      // Před migrací R23 sloupec session_id neexistuje.
      ({ data, error } = await taskQuery());
    }
    taskRows = (data as TaskProgressRow[] | null) ?? [];
  }

  // R26/Q4: přechodová obrazovka musí přežít reload i druhé zařízení. Server proto
  // vrací, které přechody hráč v téhle výpravě už odklikl; samotné „zastávka je
  // hotová" se dál odvozuje z uzavřených úkolů, nikam se neukládá.
  const confirmedStopTransitions = run
    ? await loadConfirmedStopTransitions(admin, { runId: run.id, childProfileId: ownProfile.id })
    : [];

  const { data: locationRow } = await admin
    .from("child_location_progress")
    .select("status, first_completed_at, completed_at, best_score")
    .eq("profile_code", ownProfile.profile_code)
    .eq("location_id", locationId)
    .limit(1)
    .maybeSingle<{
      status?: "in_progress" | "completed" | null;
      first_completed_at?: string | null;
      completed_at?: string | null;
      best_score?: number | null;
    }>();

  // Dokončená hra bez běžící výpravy = nabídka opakovaného hraní: prázdný postup
  // je pro aplikaci signál, aby si vyžádala novou výpravu (reset-location-replay).
  const finishedWithoutRun = !run && isCompletedLocationProgress(locationRow);

  // R26/Q8: dokončená hra bez běžící výpravy se NESMÍ sama znovu spustit. Server
  // proto pošle hotový výsledek a aplikace nabídne vědomé „Hrát znovu“ místo toho,
  // aby tiše založila novou výpravu.
  const totalTasks = knownLocation.episodes.reduce((sum, episode) => sum + episode.tasks.length, 0);
  const completedSummary = finishedWithoutRun
    ? {
        bestScore: Math.max(0, locationRow?.best_score ?? 0),
        maxScore: getLocationMaxScore(totalTasks),
        totalTasks,
        completedAt: locationRow?.completed_at ?? null,
        firstCompletedAt: locationRow?.first_completed_at ?? null,
        // Závěr hry vidí jen hráč, který ji opravdu dokončil.
        ending: await getGameplayEnding(locationId)
      }
    : null;

  return NextResponse.json({
    ok: true,
    location: {
      status: locationRow?.status ?? null,
      first_completed_at: locationRow?.first_completed_at ?? null,
      completed_at: locationRow?.completed_at ?? null
    },
    run: run ? { id: run.id, mode: run.mode, startedAt: run.started_at } : null,
    confirmedStopTransitions,
    completed: completedSummary,
    task_progress: finishedWithoutRun
      ? []
      : taskRows.map((row) => ({
          task_id: row.task_id,
          status: row.status,
          attempts: Math.max(0, row.attempts ?? 0),
          hintUsed: Boolean(row.hint_used_at)
        }))
  });
}
