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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: "missing_supabase_env" }, { status: 500 });
  }

  if (!ensureVapid()) {
    return NextResponse.json({ ok: false, error: "missing_vapid_env" }, { status: 500 });
  }

  const body = (await request.json()) as {
    targetProfileCode?: string;
    title?: string;
    message?: string;
    url?: string;
  };

  const targetProfileCode = body.targetProfileCode?.trim().toUpperCase();

  if (!targetProfileCode) {
    return NextResponse.json({ ok: false, error: "missing_target" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: subscriptions, error } = await admin
    .from("child_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("profile_code", targetProfileCode);

  if (error) {
    return NextResponse.json({ ok: false, error: "load_subscriptions_failed" }, { status: 500 });
  }

  const rows = (subscriptions as PushRow[] | null) ?? [];

  const payload = JSON.stringify({
    title: body.title || "Nová pozvánka do výpravy",
    body: body.message || "Někdo tě zve do výpravy.",
    url: body.url || "/"
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
