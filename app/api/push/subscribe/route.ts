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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: "missing_supabase_env" }, { status: 500 });
  }

  const body = (await request.json()) as {
    profileCode?: string;
    subscription?: PushSubscriptionPayload;
    userAgent?: string;
  };

  const profileCode = body.profileCode?.trim().toUpperCase();
  const endpoint = body.subscription?.endpoint?.trim();
  const p256dh = body.subscription?.keys?.p256dh?.trim();
  const auth = body.subscription?.keys?.auth?.trim();

  if (!profileCode || !endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { error } = await admin.from("child_push_subscriptions").upsert(
    {
      profile_code: profileCode,
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
