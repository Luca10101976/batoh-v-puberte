import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";

type ChildProfileRow = {
  id: string;
  child_name: string;
  profile_code: string;
  player_code?: string | null;
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
    action: "friends_resolve",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 60,
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

  const body = (await request.json()) as { playerCode?: string; profileCode?: string };
  const requestedCode = normalizeCode(body.playerCode ?? body.profileCode ?? "");

  if (!requestedCode || requestedCode.length < 4) {
    return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: ownChildProfile } = await admin
    .from("child_profiles")
    .select("id, profile_code, player_code")
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<{ id: string; profile_code: string; player_code?: string | null }>();

  if (!ownChildProfile?.id) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
  }

  const ownPublicCode = normalizeCode(ownChildProfile.player_code || ownChildProfile.profile_code);

  if (ownPublicCode === requestedCode) {
    return NextResponse.json({ ok: false, error: "own_code" }, { status: 400 });
  }

  const { data: targetByPlayerCode } = await admin
    .from("child_profiles")
    .select("id, child_name, profile_code, player_code")
    .eq("player_code", requestedCode)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  // Legacy compatibility path (A2): keep old profile_code lookup until A3 cleanup.
  const { data: targetProfile } = targetByPlayerCode?.id
    ? { data: targetByPlayerCode }
    : await admin
        .from("child_profiles")
        .select("id, child_name, profile_code, player_code")
        .eq("profile_code", requestedCode)
        .limit(1)
        .maybeSingle<ChildProfileRow>();

  if (!targetProfile?.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    profile: {
      id: targetProfile.id,
      name: targetProfile.child_name,
      code: targetProfile.player_code || targetProfile.profile_code
    }
  });
}
