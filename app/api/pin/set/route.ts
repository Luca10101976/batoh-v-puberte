import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hashPin, isPinFormatValid, normalizePin } from "@/lib/pin";

type SetPinPayload = {
  pin?: string;
  profileCode?: string;
};

function getIpAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return request.headers.get("x-real-ip")?.trim() || null;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ ok: false, message: "Supabase konfigurace chybí." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ ok: false, message: "Chybí přihlášení." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as SetPinPayload | null;
  const normalizedPin = normalizePin(body?.pin ?? "");
  if (!isPinFormatValid(normalizedPin)) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_pin_format",
        message: "PIN musí mít 4 až 6 číslic."
      },
      { status: 400 }
    );
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const {
    data: { user },
    error: authError
  } = await authClient.auth.getUser(accessToken);

  if (authError || !user?.id) {
    return NextResponse.json({ ok: false, message: "Neplatné přihlášení." }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const requestedProfileCode = (body?.profileCode ?? "").trim().toUpperCase();

  const profileQuery = requestedProfileCode
    ? admin
        .from("child_profiles")
        .select("id, profile_code")
        .eq("parent_user_id", user.id)
        .eq("profile_code", requestedProfileCode)
        .limit(1)
    : admin
        .from("child_profiles")
        .select("id, profile_code, created_at")
        .eq("parent_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

  const { data: profileRows, error: profileError } = await profileQuery;

  if (profileError) {
    return NextResponse.json({ ok: false, message: "Nepodařilo se načíst profil hráče." }, { status: 500 });
  }

  const profile = profileRows?.[0] as { id: string; profile_code: string } | undefined;
  if (!profile) {
    return NextResponse.json({ ok: false, message: "Profil hráče nebyl nalezen." }, { status: 404 });
  }

  const nextHash = await hashPin(normalizedPin);
  const now = new Date().toISOString();
  const ipAddress = getIpAddress(request);
  const userAgent = request.headers.get("user-agent") ?? null;

  const { error: updateError } = await admin
    .from("child_profiles")
    .update({
      pin_hash: nextHash,
      pin_failed_attempts: 0,
      pin_locked_until: null,
      pin_updated_at: now
    })
    .eq("id", profile.id)
    .eq("parent_user_id", user.id);

  if (updateError) {
    return NextResponse.json({ ok: false, message: "PIN se nepodařilo uložit." }, { status: 500 });
  }

  const { error: auditError } = await admin.from("pin_audit_log").insert({
    user_id: user.id,
    profile_id: profile.id,
    success: true,
    ip_address: ipAddress,
    user_agent: userAgent
  });

  if (auditError) {
    return NextResponse.json({ ok: false, message: "PIN byl uložen, ale audit log selhal." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    profileCode: profile.profile_code
  });
}
