import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PushSubscriptionPayload = {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
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

  const body = (await request.json()) as {
    playerCode?: string;
    profileCode?: string;
    subscription?: PushSubscriptionPayload;
    userAgent?: string;
  };

  const profileCode = (body.playerCode ?? body.profileCode)?.trim().toUpperCase();
  const endpoint = body.subscription?.endpoint?.trim();
  const p256dh = body.subscription?.keys?.p256dh?.trim();
  const auth = body.subscription?.keys?.auth?.trim();

  if (!profileCode || !endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: ownByPlayerCode } = await admin
    .from("child_profiles")
    .select("id, profile_code, player_code")
    .eq("player_code", profileCode)
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<{ id: string; profile_code: string; player_code?: string | null }>();

  // Legacy compatibility path (A2): fallback to old profile_code until A3 cleanup.
  const ownChildProfile = ownByPlayerCode?.id
    ? ownByPlayerCode
    : (
        await admin
          .from("child_profiles")
          .select("id, profile_code, player_code")
          .eq("profile_code", profileCode)
          .eq("parent_user_id", user.id)
          .limit(1)
          .maybeSingle<{ id: string; profile_code: string; player_code?: string | null }>()
      ).data;

  if (!ownChildProfile?.id) {
    return NextResponse.json({ ok: false, error: "forbidden_profile" }, { status: 403 });
  }

  const publicPlayerCode = ownChildProfile.player_code || ownChildProfile.profile_code;

  const { error } = await admin.from("child_push_subscriptions").upsert(
    {
      profile_code: publicPlayerCode,
      endpoint,
      p256dh,
      auth,
      user_agent: body.userAgent || null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
