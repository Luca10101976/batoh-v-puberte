import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gameAccessHttpStatus, resolveServerGameAccess } from "@/lib/game-access-server";
import { getGameplayLocation } from "@/lib/gameplay-server";
import { checkRateLimitSafe, getRequestIpAddress } from "@/lib/rate-limit";
import { ensureActiveRun, loadRunTaskProgress } from "@/lib/game-run";
import { confirmStopTransition } from "@/lib/stop-transition-server";
import { isStopCompleted } from "@/lib/task-order";

// R26/Q4: potvrzení přechodové obrazovky mezi zastávkami.
//
// Obrazovka se objeví, jakmile jsou uzavřené všechny úkoly zastávky, a zůstává
// hráčovým aktuálním stavem i po reloadu a na druhém zařízení. Tenhle endpoint
// je jediný způsob, jak ji zavřít.
//
// Zapisuje se jen fakt, že hráč klikl. Jestli je zastávka dokončená, se dál
// odvozuje z uzavřených úkolů výpravy – druhá pravda o dokončení nevzniká.
// Volání je idempotentní: opakované potvrzení téže zastávky nic nemění.

type ChildProfileRow = {
  id: string;
  profile_code: string;
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

  const rateLimitResult = await checkRateLimitSafe({
    action: "confirm_stop_transition",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 200,
    windowMinutes: 60,
    blockMinutes: 10
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after: rateLimitResult.retryAfterSeconds ?? 60 },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    profileCode?: string;
    locationId?: string;
    stopId?: string;
  } | null;

  const profileCode = normalizeCode(body?.profileCode ?? "");
  const locationId = (body?.locationId ?? "").trim();
  const stopId = (body?.stopId ?? "").trim();
  if (!profileCode || !locationId || !stopId) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
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
    return NextResponse.json({ ok: false, error: "forbidden_profile" }, { status: 403 });
  }

  // R22 + R23/P9: k zamčené hře se nedostane nikdo.
  const access = await resolveServerGameAccess(admin, ownProfile.profile_code, locationId, {
    childProfileId: ownProfile.id
  });
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, error: access.reason === "not_published" ? "unknown_location" : "location_locked" },
      { status: gameAccessHttpStatus(access.reason) }
    );
  }

  const location = await getGameplayLocation(locationId);
  const episode = location?.episodes.find((item) => item.id === stopId) ?? null;
  if (!location || !episode) {
    return NextResponse.json({ ok: false, error: "unknown_stop" }, { status: 400 });
  }

  const { run } = await ensureActiveRun(admin, { childProfileId: ownProfile.id, locationId });
  if (!run) {
    return NextResponse.json({ ok: false, error: "run_unavailable" }, { status: 500 });
  }

  // Potvrdit jde jen přechod ze zastávky, kterou má hráč v téhle výpravě opravdu
  // celou uzavřenou. Jinak by šlo obrazovku „odklikat" dopředu.
  let progress: Array<{ task_id: string; status: "correct" | "wrong" | "unknown" }>;
  try {
    const byChild = await loadRunTaskProgress(admin, {
      runId: run.id,
      locationId,
      childProfileIds: [ownProfile.id]
    });
    progress = (byChild.get(ownProfile.id) ?? []).map((row) => ({ task_id: row.task_id, status: row.status }));
  } catch {
    return NextResponse.json({ ok: false, error: "progress_load_failed" }, { status: 500 });
  }

  if (!isStopCompleted({ id: episode.id, name: episode.name, tasks: episode.tasks }, progress)) {
    return NextResponse.json({ ok: false, error: "stop_not_completed" }, { status: 409 });
  }

  const outcome = await confirmStopTransition(admin, {
    runId: run.id,
    childProfileId: ownProfile.id,
    stopId
  });

  if (!outcome.ok) {
    if (outcome.error === "unsupported") {
      // Prostředí bez migrace R26: přechod se chová jako dřív, hra se nezastaví.
      return NextResponse.json({ ok: true, confirmedStopTransitions: [], persisted: false });
    }
    return NextResponse.json(
      { ok: false, error: outcome.error === "not_a_participant" ? "forbidden_profile" : "confirm_failed" },
      { status: outcome.error === "not_a_participant" ? 403 : 500 }
    );
  }

  return NextResponse.json({ ok: true, confirmedStopTransitions: outcome.confirmedStopIds, persisted: true });
}
