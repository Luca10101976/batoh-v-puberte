import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getGameplayLocation } from "@/lib/gameplay-server";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";

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

  const rateLimitResult = await checkRateLimit({
    action: "reset_location_replay",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 30,
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
  };

  const profileCode = normalizeCode(body.profileCode ?? "");
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

  const { error: deleteError } = await admin
    .from("child_task_progress")
    .delete()
    .eq("child_profile_id", ownProfile.id)
    .eq("location_id", locationId);

  if (deleteError?.code === "42P01") {
    return NextResponse.json(
      { ok: false, error: "missing_task_progress_table", hint: "run_supabase_online_task_progress_sql" },
      { status: 500 }
    );
  }

  if (deleteError) {
    return NextResponse.json({ ok: false, error: "reset_replay_failed" }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await admin
    .from("child_location_progress")
    .update({
      status: "in_progress",
      completion_source: "gameplay",
      updated_at: nowIso
    })
    .eq("profile_code", ownProfile.profile_code)
    .eq("location_id", locationId);

  if (updateError?.code === "42703") {
    await admin
      .from("child_location_progress")
      .update({ completed_at: nowIso })
      .eq("profile_code", ownProfile.profile_code)
      .eq("location_id", locationId);
  } else if (updateError) {
    return NextResponse.json({ ok: false, error: "reset_replay_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reset: true });
}
