import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";

type ChildProfileRow = {
  id: string;
  child_name: string;
  profile_code: string;
  player_code?: string | null;
  contact_email?: string | null;
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
    action: "friends_add",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 10,
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
    sourcePlayerCode?: string;
    targetPlayerCode?: string;
    sourceProfileCode?: string;
    targetProfileCode?: string;
  };
  const sourcePublicCode = normalizeCode(body.sourcePlayerCode ?? body.sourceProfileCode ?? "");
  const targetPublicCode = normalizeCode(body.targetPlayerCode ?? body.targetProfileCode ?? "");
  if (!sourcePublicCode || !targetPublicCode || sourcePublicCode.length < 4 || targetPublicCode.length < 4) {
    return NextResponse.json({ ok: false, error: "invalid_target_code" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: ownProfileByPlayerCode, error: ownProfileError } = await admin
    .from("child_profiles")
    .select("id, child_name, profile_code, player_code, contact_email")
    .eq("player_code", sourcePublicCode)
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (ownProfileError) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
  }

  // Legacy compatibility path (A2): fallback to old profile_code until A3 cleanup.
  const ownProfile = ownProfileByPlayerCode?.id
    ? ownProfileByPlayerCode
    : (
        await admin
          .from("child_profiles")
          .select("id, child_name, profile_code, player_code, contact_email")
          .eq("profile_code", sourcePublicCode)
          .eq("parent_user_id", user.id)
          .limit(1)
          .maybeSingle<ChildProfileRow>()
      ).data;

  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
  }

  const ownPublicCode = normalizeCode(ownProfile.player_code || ownProfile.profile_code);

  if (ownPublicCode === targetPublicCode) {
    return NextResponse.json({ ok: false, error: "own_code" }, { status: 400 });
  }

  const { data: targetByPlayerCode, error: targetError } = await admin
    .from("child_profiles")
    .select("id, child_name, profile_code, player_code, contact_email")
    .eq("player_code", targetPublicCode)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (targetError) {
    return NextResponse.json({ ok: false, error: "target_not_found" }, { status: 404 });
  }

  // Legacy compatibility path (A2): fallback to old profile_code until A3 cleanup.
  const targetProfile = targetByPlayerCode?.id
    ? targetByPlayerCode
    : (
        await admin
          .from("child_profiles")
          .select("id, child_name, profile_code, player_code, contact_email")
          .eq("profile_code", targetPublicCode)
          .limit(1)
          .maybeSingle<ChildProfileRow>()
      ).data;

  if (!targetProfile?.id) {
    return NextResponse.json({ ok: false, error: "target_not_found" }, { status: 404 });
  }

  const targetResolvedPublicCode = targetProfile.player_code || targetProfile.profile_code;

  const { data: existingFriendship } = await admin
    .from("child_friendships")
    .select("child_profile_id")
    .eq("child_profile_id", ownProfile.id)
    .eq("friend_child_profile_id", targetProfile.id)
    .limit(1)
    .maybeSingle<{ child_profile_id: string }>();

  if (existingFriendship?.child_profile_id) {
    return NextResponse.json(
      {
        ok: true,
        alreadyFriend: true,
        friend: {
          id: targetProfile.id,
          code: targetResolvedPublicCode,
          name: targetProfile.child_name
        }
      },
      { status: 200 }
    );
  }

  const { error: insertError } = await admin.from("child_friendships").upsert(
    [
      {
        child_profile_id: ownProfile.id,
        friend_child_profile_id: targetProfile.id,
        friend_profile_code: targetResolvedPublicCode,
        friend_display_name: targetProfile.child_name
      },
      {
        child_profile_id: targetProfile.id,
        friend_child_profile_id: ownProfile.id,
        friend_profile_code: ownPublicCode,
        friend_display_name: ownProfile.child_name
      }
    ],
    { onConflict: "child_profile_id,friend_child_profile_id" }
  );

  if (insertError) {
    return NextResponse.json({ ok: false, error: "friendship_insert_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    friend: {
      id: targetProfile.id,
      code: targetResolvedPublicCode,
      name: targetProfile.child_name
    }
  });
}
