import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gameAccessHttpStatus, resolveServerGameAccess } from "@/lib/game-access-server";
import { getGameplayLocation } from "@/lib/gameplay-server";
import { checkRateLimitSafe, getRequestIpAddress } from "@/lib/rate-limit";
import { ensureActiveRun } from "@/lib/game-run";

// R24: zahájení hry. Jediná cesta, kterou v aplikaci vzniká sólo výprava.
//
// Volají ji všechna tři tlačítka na detailu hry:
//   Hrát        – hráč hru nikdy nedokončil a nemá běžící výpravu
//   Pokračovat  – hráč má běžící výpravu (vrátí se tatáž)
//   Hrát znovu  – hráč hru dokončil a nemá běžící výpravu (vznikne nová)
//
// Operace je idempotentní (lib/game-run.ts): opakovaný klik ani druhé zařízení
// nikdy nezaloží druhou výpravu téže hry. Hra je rozehraná od tohoto okamžiku,
// ne až od první odpovědi.

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
    action: "start_run",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 120,
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
  } | null;

  const profileCode = normalizeCode(body?.profileCode ?? "");
  const locationId = (body?.locationId ?? "").trim();
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
    .eq("profile_code", profileCode)
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "forbidden_profile" }, { status: 403 });
  }

  // R22 + R23/P9: zámek hry se vynucuje na serveru i při zahájení, aby zamčenou
  // hru nešlo rozehrát přímým voláním API.
  const access = await resolveServerGameAccess(admin, ownProfile.profile_code, locationId, {
    childProfileId: ownProfile.id
  });
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, error: access.reason === "not_published" ? "unknown_location" : "location_locked" },
      { status: gameAccessHttpStatus(access.reason) }
    );
  }

  const { run, created } = await ensureActiveRun(admin, { childProfileId: ownProfile.id, locationId });
  if (!run) {
    return NextResponse.json({ ok: false, error: "run_unavailable" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    created,
    run: { id: run.id, locationId: run.locationId, mode: run.mode, startedAt: run.started_at }
  });
}
