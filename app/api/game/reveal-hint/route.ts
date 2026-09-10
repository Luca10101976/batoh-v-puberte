import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gameAccessHttpStatus, resolveServerGameAccess } from "@/lib/game-access-server";
import { getGameplayTask } from "@/lib/gameplay-server";
import { checkRateLimitSafe, getRequestIpAddress } from "@/lib/rate-limit";
import { ensureActiveRun, isMissingColumnError } from "@/lib/game-run";
import { resolveServerTaskAvailability, taskAvailabilityResponse } from "@/lib/task-order-server";

// R25: otevření nápovědy.
//
// Text nápovědy se do prohlížeče posílá teprve tímto voláním, ne v datech stránky.
// Kdyby byl v datech stránky, dalo by se ho přečíst zadarmo a pravidlo o polovičních
// bodech by nic neznamenalo.
//
// Otevření se zapisuje serverově k odpovědi v konkrétní výpravě, takže:
//   - přežije reload i přechod na druhé zařízení,
//   - je idempotentní (opakované otevření nic nemění),
//   - nejde vzít zpět; jednou nastavený čas se už nepřepisuje na prázdno,
//   - server si při vyhodnocení odpovědi sám zjistí, že nápověda padla.

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
    action: "reveal_hint",
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
    taskId?: string;
  } | null;

  const profileCode = normalizeCode(body?.profileCode ?? "");
  const locationId = (body?.locationId ?? "").trim();
  const taskId = (body?.taskId ?? "").trim();
  if (!profileCode || !locationId || !taskId) {
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

  // R22 + R23/P9: nápovědu k zamčené hře nedostane nikdo.
  const access = await resolveServerGameAccess(admin, ownProfile.profile_code, locationId, {
    childProfileId: ownProfile.id
  });
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, error: access.reason === "not_published" ? "unknown_location" : "location_locked" },
      { status: gameAccessHttpStatus(access.reason) }
    );
  }

  const task = await getGameplayTask(locationId, taskId);
  const hintText = (task?.hintText ?? "").trim();
  if (!task) {
    return NextResponse.json({ ok: false, error: "unknown_location_or_task" }, { status: 400 });
  }
  if (!hintText) {
    return NextResponse.json({ ok: false, error: "task_has_no_hint" }, { status: 404 });
  }

  const { run } = await ensureActiveRun(admin, { childProfileId: ownProfile.id, locationId });
  if (!run) {
    return NextResponse.json({ ok: false, error: "run_unavailable" }, { status: 500 });
  }

  // R26/Q1: nápověda k budoucímu úkolu je stejné přeskočení pořadí jako odpověď.
  // K uzavřenému úkolu se nevydá také – dodatečně otevřená nápověda by snížila
  // hodnotu úkolu, který má hráč dávno zodpovězený.
  const availability = await resolveServerTaskAvailability(admin, {
    runId: run.id,
    locationId,
    childProfileId: ownProfile.id,
    taskId
  });
  const orderRejection = taskAvailabilityResponse(availability);
  if (orderRejection) {
    return NextResponse.json(orderRejection.body, { status: orderRejection.status });
  }

  const nowIso = new Date().toISOString();
  const rowQuery = () =>
    admin
      .from("child_task_progress")
      .select("id, status, attempts, hint_used_at")
      .eq("child_profile_id", ownProfile.id)
      .eq("location_id", locationId)
      .eq("task_id", taskId);

  let { data: existingRow, error: readError } = await rowQuery()
    .eq("session_id", run.id)
    .limit(1)
    .maybeSingle<{ id: string; status: string; attempts: number; hint_used_at: string | null }>();
  if (isMissingColumnError(readError)) {
    ({ data: existingRow, error: readError } = await rowQuery()
      .limit(1)
      .maybeSingle<{ id: string; status: string; attempts: number; hint_used_at: string | null }>());
  }
  if (readError && readError.code !== "PGRST116") {
    return NextResponse.json({ ok: false, error: "progress_load_failed" }, { status: 500 });
  }

  if (existingRow?.id) {
    // Idempotentní: jednou zapsaný čas se už nepřepisuje.
    if (!existingRow.hint_used_at) {
      const { error } = await admin
        .from("child_task_progress")
        .update({ hint_used_at: nowIso })
        .eq("id", existingRow.id)
        .is("hint_used_at", null);
      if (error) {
        return NextResponse.json({ ok: false, error: "hint_save_failed" }, { status: 500 });
      }
    }
  } else {
    // Nápověda může padnout dřív, než hráč vůbec odpoví. Řádek proto vzniká už tady,
    // se stavem „wrong" a nula pokusy, což všechny výpočty berou jako neuzavřený úkol.
    const { error } = await admin.from("child_task_progress").insert({
      child_profile_id: ownProfile.id,
      profile_code: ownProfile.profile_code,
      session_id: run.id,
      location_id: locationId,
      task_id: taskId,
      status: "wrong",
      attempts: 0,
      penalty_points: 0,
      hint_used_at: nowIso,
      first_answered_at: nowIso,
      last_answered_at: nowIso
    });
    if (error && error.code !== "23505") {
      return NextResponse.json({ ok: false, error: "hint_save_failed" }, { status: 500 });
    }
    if (error?.code === "23505") {
      // Souběh dvou zařízení: řádek mezitím vznikl, jen doplníme čas.
      await admin
        .from("child_task_progress")
        .update({ hint_used_at: nowIso })
        .eq("child_profile_id", ownProfile.id)
        .eq("location_id", locationId)
        .eq("task_id", taskId)
        .is("hint_used_at", null);
    }
  }

  return NextResponse.json({
    ok: true,
    hintText,
    hintUsed: true,
    maxPointsForTask: 5
  });
}
