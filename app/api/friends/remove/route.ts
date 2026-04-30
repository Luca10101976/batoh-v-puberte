import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";

type ChildProfileRow = {
  id: string;
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
    action: "friends_remove",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 20,
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
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  if (sourcePublicCode === targetPublicCode) {
    return NextResponse.json({ ok: false, error: "own_code" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: ownProfileByPlayerCode } = await admin
    .from("child_profiles")
    .select("id, profile_code, player_code")
    .eq("player_code", sourcePublicCode)
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  // Legacy compatibility path (A2): fallback to old profile_code until A3 cleanup.
  const ownProfile = ownProfileByPlayerCode?.id
    ? ownProfileByPlayerCode
    : (
        await admin
          .from("child_profiles")
          .select("id, profile_code, player_code")
          .eq("profile_code", sourcePublicCode)
          .eq("parent_user_id", user.id)
          .limit(1)
          .maybeSingle<ChildProfileRow>()
      ).data;

  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "forbidden_source_profile" }, { status: 403 });
  }

  const { data: targetByPlayerCode } = await admin
    .from("child_profiles")
    .select("id, profile_code, player_code")
    .eq("player_code", targetPublicCode)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  // Legacy compatibility path (A2): fallback to old profile_code until A3 cleanup.
  const targetProfile = targetByPlayerCode?.id
    ? targetByPlayerCode
    : (
        await admin
          .from("child_profiles")
          .select("id, profile_code, player_code")
          .eq("profile_code", targetPublicCode)
          .limit(1)
          .maybeSingle<ChildProfileRow>()
      ).data;

  if (!targetProfile?.id) {
    return NextResponse.json({ ok: false, error: "target_not_found" }, { status: 404 });
  }

  const [firstDelete, secondDelete] = await Promise.all([
    admin
      .from("child_friendships")
      .delete()
      .eq("child_profile_id", ownProfile.id)
      .eq("friend_child_profile_id", targetProfile.id),
    admin
      .from("child_friendships")
      .delete()
      .eq("child_profile_id", targetProfile.id)
      .eq("friend_child_profile_id", ownProfile.id)
  ]);

  if (firstDelete.error || secondDelete.error) {
    return NextResponse.json({ ok: false, error: "friendship_remove_failed" }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("child_expedition_invites")
    .update({ status: "rejected", responded_at: nowIso } as never)
    .or(
      `and(inviter_child_profile_id.eq.${ownProfile.id},invitee_child_profile_id.eq.${targetProfile.id},status.eq.pending),and(inviter_child_profile_id.eq.${targetProfile.id},invitee_child_profile_id.eq.${ownProfile.id},status.eq.pending)`
    );

  try {
    await admin.from("child_security_events").insert({
      actor_child_profile_id: ownProfile.id,
      event_type: "friend_removed",
      metadata: {
        target_profile_code: targetProfile.player_code || targetProfile.profile_code
      }
    });
  } catch {
    // best effort audit write
  }

  return NextResponse.json({ ok: true });
}
