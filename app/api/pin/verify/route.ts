import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPinFormatValid, normalizePin, verifyPin } from "@/lib/pin";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

type VerifyPinPayload = {
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

function getLockUntilIso() {
  return new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
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

  const body = (await request.json().catch(() => null)) as VerifyPinPayload | null;
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
  const ipAddress = getIpAddress(request);
  const userAgent = request.headers.get("user-agent") ?? null;
  const nowIso = new Date().toISOString();

  const profileQuery = requestedProfileCode
    ? admin
        .from("child_profiles")
        .select("id, profile_code, parent_user_id, pin_hash, pin_failed_attempts, pin_locked_until")
        .eq("parent_user_id", user.id)
        .eq("profile_code", requestedProfileCode)
        .limit(1)
    : admin
        .from("child_profiles")
        .select("id, profile_code, parent_user_id, pin_hash, pin_failed_attempts, pin_locked_until, created_at")
        .eq("parent_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

  const { data: profileRows, error: profileError } = await profileQuery;
  if (profileError) {
    return NextResponse.json({ ok: false, message: "Nepodařilo se načíst profil hráče." }, { status: 500 });
  }

  const profile = profileRows?.[0] as
    | {
        id: string;
        profile_code: string;
        parent_user_id: string;
        pin_hash: string | null;
        pin_failed_attempts: number | null;
        pin_locked_until: string | null;
      }
    | undefined;

  if (!profile || profile.parent_user_id !== user.id) {
    return NextResponse.json({ ok: false, message: "Profil hráče nebyl nalezen." }, { status: 404 });
  }

  if (!profile.pin_hash) {
    return NextResponse.json(
      {
        ok: false,
        code: "pin_not_set",
        message: "PIN zatím není nastavený."
      },
      { status: 400 }
    );
  }

  if (profile.pin_locked_until && new Date(profile.pin_locked_until).getTime() > Date.now()) {
    return NextResponse.json(
      {
        ok: false,
        code: "too_many_attempts",
        message: "PIN je dočasně zablokovaný. Zkus to za chvíli.",
        locked_until: profile.pin_locked_until
      },
      { status: 429 }
    );
  }

  const windowStart = new Date(Date.now() - LOCK_MINUTES * 60 * 1000).toISOString();
  let recentFailureCount = 0;

  if (ipAddress) {
    const { count } = await admin
      .from("pin_audit_log")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", user.id)
      .eq("profile_id", profile.id)
      .eq("success", false)
      .eq("ip_address", ipAddress)
      .gte("created_at", windowStart);
    recentFailureCount = count ?? 0;
  } else {
    const { count } = await admin
      .from("pin_audit_log")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", user.id)
      .eq("profile_id", profile.id)
      .eq("success", false)
      .is("ip_address", null)
      .gte("created_at", windowStart);
    recentFailureCount = count ?? 0;
  }

  if (recentFailureCount >= MAX_FAILED_ATTEMPTS) {
    const lockUntil = getLockUntilIso();
    await admin
      .from("child_profiles")
      .update({
        pin_locked_until: lockUntil
      })
      .eq("id", profile.id)
      .eq("parent_user_id", user.id);

    return NextResponse.json(
      {
        ok: false,
        code: "too_many_attempts",
        message: "Příliš mnoho pokusů. PIN je na 15 minut zablokovaný.",
        locked_until: lockUntil
      },
      { status: 429 }
    );
  }

  const pinMatches = await verifyPin(normalizedPin, profile.pin_hash);

  if (!pinMatches) {
    const nextFailedAttempts = Math.max(0, profile.pin_failed_attempts ?? 0) + 1;
    const lockUntil = nextFailedAttempts >= MAX_FAILED_ATTEMPTS ? getLockUntilIso() : null;

    const { error: updateError } = await admin
      .from("child_profiles")
      .update({
        pin_failed_attempts: nextFailedAttempts,
        pin_locked_until: lockUntil
      })
      .eq("id", profile.id)
      .eq("parent_user_id", user.id);

    if (updateError) {
      return NextResponse.json({ ok: false, message: "Nepodařilo se zapsat PIN pokus." }, { status: 500 });
    }

    await admin.from("pin_audit_log").insert({
      user_id: user.id,
      profile_id: profile.id,
      success: false,
      ip_address: ipAddress,
      user_agent: userAgent,
      created_at: nowIso
    });

    if (lockUntil) {
      return NextResponse.json(
        {
          ok: false,
          code: "too_many_attempts",
          message: "Příliš mnoho pokusů. PIN je na 15 minut zablokovaný.",
          locked_until: lockUntil
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        code: "invalid_pin",
        message: "PIN nesedí.",
        attempts_left: Math.max(0, MAX_FAILED_ATTEMPTS - nextFailedAttempts)
      },
      { status: 401 }
    );
  }

  const { error: resetError } = await admin
    .from("child_profiles")
    .update({
      pin_failed_attempts: 0,
      pin_locked_until: null
    })
    .eq("id", profile.id)
    .eq("parent_user_id", user.id);

  if (resetError) {
    return NextResponse.json({ ok: false, message: "PIN je správně, ale reset pokusů selhal." }, { status: 500 });
  }

  await admin.from("pin_audit_log").insert({
    user_id: user.id,
    profile_id: profile.id,
    success: true,
    ip_address: ipAddress,
    user_agent: userAgent,
    created_at: nowIso
  });

  return NextResponse.json({ ok: true, profileCode: profile.profile_code });
}
