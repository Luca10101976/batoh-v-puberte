import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ChildProfileRow = {
  id: string;
  profile_code: string;
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function isMissingTableError(error: unknown) {
  const message = (error as { message?: string })?.message ?? "";
  return message.toLowerCase().includes("does not exist") || message.toLowerCase().includes("relation");
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

  const body = (await request.json()) as {
    sourceProfileCode?: string;
    targetProfileCode?: string;
    block?: boolean;
  };

  const sourceProfileCode = normalizeCode(body.sourceProfileCode ?? "");
  const targetProfileCode = normalizeCode(body.targetProfileCode ?? "");
  const shouldBlock = body.block !== false;

  if (!sourceProfileCode || !targetProfileCode) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: ownProfile } = await admin
    .from("child_profiles")
    .select("id, profile_code")
    .eq("profile_code", sourceProfileCode)
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "forbidden_profile" }, { status: 403 });
  }

  const { data: targetProfile } = await admin
    .from("child_profiles")
    .select("id, profile_code")
    .eq("profile_code", targetProfileCode)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!targetProfile?.id) {
    return NextResponse.json({ ok: false, error: "target_not_found" }, { status: 404 });
  }

  if (shouldBlock) {
    const { error } = await admin.from("child_profile_blocks").upsert(
      {
        child_profile_id: ownProfile.id,
        blocked_child_profile_id: targetProfile.id
      },
      { onConflict: "child_profile_id,blocked_child_profile_id" }
    );

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ ok: false, error: "missing_block_table" }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: "block_failed" }, { status: 500 });
    }

    await admin
      .from("child_expedition_invites")
      .delete()
      .or(
        `and(inviter_child_profile_id.eq.${ownProfile.id},invitee_child_profile_id.eq.${targetProfile.id},status.eq.pending),and(inviter_child_profile_id.eq.${targetProfile.id},invitee_child_profile_id.eq.${ownProfile.id},status.eq.pending)`
      );

    try {
      await admin.from("child_security_events").insert({
        actor_child_profile_id: ownProfile.id,
        event_type: "friend_blocked",
        metadata: { target_profile_code: targetProfile.profile_code }
      });
    } catch {
      // best effort audit write
    }

    return NextResponse.json({ ok: true, blocked: true });
  }

  const { error } = await admin
    .from("child_profile_blocks")
    .delete()
    .eq("child_profile_id", ownProfile.id)
    .eq("blocked_child_profile_id", targetProfile.id);

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ ok: false, error: "missing_block_table" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "unblock_failed" }, { status: 500 });
  }

  try {
    await admin.from("child_security_events").insert({
      actor_child_profile_id: ownProfile.id,
      event_type: "friend_unblocked",
      metadata: { target_profile_code: targetProfile.profile_code }
    });
  } catch {
    // best effort audit write
  }

  return NextResponse.json({ ok: true, blocked: false });
}
