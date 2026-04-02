import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ChildProfileRow = {
  id: string;
  child_name: string;
  profile_code: string;
};

type InviteRow = {
  id: string;
  expedition_id: string;
  status: "pending" | "accepted" | "rejected";
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
  };

  const sourceProfileCode = normalizeCode(body.sourceProfileCode ?? "");
  const targetProfileCode = normalizeCode(body.targetProfileCode ?? "");

  if (!sourceProfileCode || !targetProfileCode || sourceProfileCode.length < 4 || targetProfileCode.length < 4) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  if (sourceProfileCode === targetProfileCode) {
    return NextResponse.json({ ok: false, error: "own_code" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: ownProfile } = await admin
    .from("child_profiles")
    .select("id, child_name, profile_code")
    .eq("profile_code", sourceProfileCode)
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "forbidden_source_profile" }, { status: 403 });
  }

  const { data: targetProfile } = await admin
    .from("child_profiles")
    .select("id, child_name, profile_code")
    .eq("profile_code", targetProfileCode)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!targetProfile?.id) {
    return NextResponse.json({ ok: false, error: "target_not_found" }, { status: 404 });
  }

  const blockCheck = await admin
    .from("child_profile_blocks")
    .select("child_profile_id, blocked_child_profile_id")
    .or(
      `and(child_profile_id.eq.${ownProfile.id},blocked_child_profile_id.eq.${targetProfile.id}),and(child_profile_id.eq.${targetProfile.id},blocked_child_profile_id.eq.${ownProfile.id})`
    )
    .limit(1)
    .maybeSingle<{ child_profile_id: string; blocked_child_profile_id: string }>();

  if (blockCheck.data) {
    return NextResponse.json({ ok: false, error: "blocked" }, { status: 403 });
  }
  if (blockCheck.error && !isMissingTableError(blockCheck.error)) {
    return NextResponse.json({ ok: false, error: "block_check_failed" }, { status: 500 });
  }

  const { data: existingPending } = await admin
    .from("child_expedition_invites")
    .select("id, expedition_id, status")
    .or(
      `and(inviter_child_profile_id.eq.${ownProfile.id},invitee_child_profile_id.eq.${targetProfile.id}),and(inviter_child_profile_id.eq.${targetProfile.id},invitee_child_profile_id.eq.${ownProfile.id})`
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<InviteRow>();

  if (existingPending?.id) {
    return NextResponse.json({
      ok: true,
      alreadyPending: true,
      invite: { id: existingPending.id, expeditionId: existingPending.expedition_id }
    });
  }

  const { data: inviteRow, error: inviteError } = await admin
    .from("child_expedition_invites")
    .insert({
      inviter_child_profile_id: ownProfile.id,
      inviter_profile_code: ownProfile.profile_code,
      inviter_display_name: ownProfile.child_name,
      invitee_child_profile_id: targetProfile.id,
      invitee_profile_code: targetProfile.profile_code,
      invitee_display_name: targetProfile.child_name,
      status: "pending"
    })
    .select("id, expedition_id")
    .single<{ id: string; expedition_id: string }>();

  if (inviteError || !inviteRow?.id) {
    return NextResponse.json({ ok: false, error: "invite_create_failed" }, { status: 500 });
  }

  try {
    await admin.from("child_security_events").insert({
      actor_child_profile_id: ownProfile.id,
      event_type: "invite_created",
      metadata: {
        invite_id: inviteRow.id,
        expedition_id: inviteRow.expedition_id,
        target_profile_code: targetProfile.profile_code
      }
    });
  } catch {
    // best effort audit write
  }

  return NextResponse.json({
    ok: true,
    invite: { id: inviteRow.id, expeditionId: inviteRow.expedition_id }
  });
}
