import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type PushRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) {
    return true;
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: "missing_supabase_env" }, { status: 500 });
  }

  if (!ensureVapid()) {
    return NextResponse.json({ ok: false, error: "missing_vapid_env" }, { status: 500 });
  }

  const body = (await request.json()) as {
    responderPlayerCode?: string;
    responderProfileCode?: string;
    inviteId?: string;
    decision?: "accepted" | "rejected";
  };

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

  const responderProfileCode = (body.responderPlayerCode ?? body.responderProfileCode)?.trim().toUpperCase();
  const inviteId = body.inviteId?.trim();
  const decision = body.decision;

  if (!responderProfileCode || !inviteId || (decision !== "accepted" && decision !== "rejected")) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: responderByPlayerCode } = await admin
    .from("child_profiles")
    .select("id, child_name")
    .eq("player_code", responderProfileCode)
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<{ id: string; child_name: string }>();

  // Legacy compatibility path (A2): fallback to old profile_code until A3 cleanup.
  const responderProfile = responderByPlayerCode?.id
    ? responderByPlayerCode
    : (
        await admin
          .from("child_profiles")
          .select("id, child_name")
          .eq("profile_code", responderProfileCode)
          .eq("parent_user_id", user.id)
          .limit(1)
          .maybeSingle<{ id: string; child_name: string }>()
      ).data;

  if (!responderProfile?.id) {
    return NextResponse.json({ ok: false, error: "forbidden_responder_profile" }, { status: 403 });
  }

  const { data: inviteRow } = await admin
    .from("child_expedition_invites")
    .select("id, inviter_profile_code, invitee_child_profile_id, status")
    .eq("id", inviteId)
    .eq("invitee_child_profile_id", responderProfile.id)
    .limit(1)
    .maybeSingle<{ id: string; inviter_profile_code: string; invitee_child_profile_id: string; status: string }>();

  if (!inviteRow?.id) {
    return NextResponse.json({ ok: false, error: "invite_not_found" }, { status: 404 });
  }

  if (inviteRow.status !== decision) {
    return NextResponse.json({ ok: false, error: "invite_status_mismatch" }, { status: 409 });
  }

  const targetProfileCode = inviteRow.inviter_profile_code;
  const { data: subscriptions, error } = await admin
    .from("child_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("profile_code", targetProfileCode);

  if (error) {
    return NextResponse.json({ ok: false, error: "load_subscriptions_failed" }, { status: 500 });
  }

  const rows = (subscriptions as PushRow[] | null) ?? [];

  const payload = JSON.stringify({
    title: decision === "accepted" ? "Pozvánka přijatá" : "Pozvánka odmítnutá",
    body:
      decision === "accepted"
        ? `${responderProfile.child_name} přijal(a) tvou pozvánku.`
        : `${responderProfile.child_name} odmítl(a) tvou pozvánku.`,
    url: "/profile"
  });

  let sent = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: {
              p256dh: row.p256dh,
              auth: row.auth
            }
          },
          payload
        );
        sent += 1;
      } catch (notifyError) {
        const statusCode = (notifyError as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("child_push_subscriptions").delete().eq("endpoint", row.endpoint);
        }
      }
    })
  );

  return NextResponse.json({ ok: true, sent });
}
