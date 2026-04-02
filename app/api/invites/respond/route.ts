import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ChildProfileRow = {
  id: string;
  child_name: string;
  profile_code: string;
};

type InviteDetail = {
  id: string;
  expedition_id: string;
  inviter_child_profile_id: string;
  inviter_profile_code: string;
  inviter_display_name: string;
  invitee_child_profile_id: string;
  invitee_profile_code: string;
  invitee_display_name: string;
  status: "pending" | "accepted" | "rejected";
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

  const body = (await request.json()) as {
    profileCode?: string;
    inviteId?: string;
    decision?: "accepted" | "rejected";
  };

  const profileCode = normalizeCode(body.profileCode ?? "");
  const inviteId = (body.inviteId ?? "").trim();
  const decision = body.decision;

  if (!profileCode || !inviteId || (decision !== "accepted" && decision !== "rejected")) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: ownProfile } = await admin
    .from("child_profiles")
    .select("id, child_name, profile_code")
    .eq("profile_code", profileCode)
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "forbidden_profile" }, { status: 403 });
  }

  const { data: inviteRow } = await admin
    .from("child_expedition_invites")
    .select(
      "id, expedition_id, inviter_child_profile_id, inviter_profile_code, inviter_display_name, invitee_child_profile_id, invitee_profile_code, invitee_display_name, status"
    )
    .eq("id", inviteId)
    .eq("invitee_child_profile_id", ownProfile.id)
    .limit(1)
    .maybeSingle<InviteDetail>();

  if (!inviteRow?.id) {
    return NextResponse.json({ ok: false, error: "invite_not_found" }, { status: 404 });
  }

  if (inviteRow.status !== "pending") {
    return NextResponse.json({ ok: false, error: "invite_not_pending", status: inviteRow.status }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await admin
    .from("child_expedition_invites")
    .update({ status: decision, responded_at: nowIso } as never)
    .eq("id", inviteId)
    .eq("status", "pending");

  if (updateError) {
    return NextResponse.json({ ok: false, error: "invite_update_failed" }, { status: 500 });
  }

  if (decision === "accepted") {
    await admin.from("child_friendships").upsert(
      [
        {
          child_profile_id: inviteRow.inviter_child_profile_id,
          friend_child_profile_id: inviteRow.invitee_child_profile_id,
          friend_profile_code: inviteRow.invitee_profile_code,
          friend_display_name: inviteRow.invitee_display_name
        },
        {
          child_profile_id: inviteRow.invitee_child_profile_id,
          friend_child_profile_id: inviteRow.inviter_child_profile_id,
          friend_profile_code: inviteRow.inviter_profile_code,
          friend_display_name: inviteRow.inviter_display_name
        }
      ],
      { onConflict: "child_profile_id,friend_child_profile_id" }
    );
  }

  try {
    await admin.from("child_security_events").insert({
      actor_child_profile_id: ownProfile.id,
      event_type: decision === "accepted" ? "invite_accepted" : "invite_rejected",
      metadata: {
        invite_id: inviteRow.id,
        expedition_id: inviteRow.expedition_id,
        inviter_profile_code: inviteRow.inviter_profile_code
      }
    });
  } catch {
    // best effort audit write
  }

  return NextResponse.json({
    ok: true,
    decision,
    expeditionId: decision === "accepted" ? inviteRow.expedition_id : null,
    inviter: {
      code: inviteRow.inviter_profile_code,
      name: inviteRow.inviter_display_name
    }
  });
}
