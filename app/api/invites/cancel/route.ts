import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ChildProfileRow = {
  id: string;
};

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

  const body = (await request.json()) as { sourceProfileCode?: string; inviteId?: string };
  const sourceProfileCode = (body.sourceProfileCode ?? "").trim().toUpperCase();
  const inviteId = (body.inviteId ?? "").trim();

  if (!sourceProfileCode || !inviteId) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: ownProfile } = await admin
    .from("child_profiles")
    .select("id")
    .eq("profile_code", sourceProfileCode)
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "forbidden_profile" }, { status: 403 });
  }

  const { data: inviteRow } = await admin
    .from("child_expedition_invites")
    .select("id")
    .eq("id", inviteId)
    .eq("inviter_child_profile_id", ownProfile.id)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (!inviteRow?.id) {
    return NextResponse.json({ ok: false, error: "invite_not_cancelable" }, { status: 404 });
  }

  const { error } = await admin.from("child_expedition_invites").delete().eq("id", inviteId);

  if (error) {
    return NextResponse.json({ ok: false, error: "invite_cancel_failed" }, { status: 500 });
  }

  try {
    await admin.from("child_security_events").insert({
      actor_child_profile_id: ownProfile.id,
      event_type: "invite_canceled",
      metadata: {
        invite_id: inviteId
      }
    });
  } catch {
    // best effort audit write
  }

  return NextResponse.json({ ok: true });
}
