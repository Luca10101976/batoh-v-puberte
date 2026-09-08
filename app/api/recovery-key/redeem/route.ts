import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/app/api/expeditions/_shared";
import { checkInMemoryRateLimit, checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import { normalizeRecoveryKey } from "@/lib/recovery-key";
import { hashRecoveryKey, technicalEmailForUser } from "@/lib/recovery-key-server";

// Obnova hráče pomocí Traki klíče (veřejný endpoint, bez přihlášení).
//
// Mechanismus (ověřený v auditu R17, oficiální Supabase API):
//   1. klíč -> normalizace -> HMAC -> child_profiles.recovery_key_hash (O(1) lookup, UNIQUE)
//   2. z profilu parent_user_id -> auth.admin.getUserById -> e-mail účtu
//      (u anonymních hráčů technický <uuid>@players.postope.invalid)
//   3. auth.admin.generateLink({ type: "magiclink", email }) -> properties.hashed_token
//      (NEPOSÍLÁ žádný e-mail, jen vrátí jednorázový token)
//   4. klient: supabase.auth.verifyOtp({ token_hash, type: "magiclink" }) -> session
//      PŮVODNÍHO auth user ID -> běžný sync obnoví profil, postup, přátele, expedice
//
// Ochrana:
//   - 10 pokusů / 15 min / IP (DB rate limit s in-memory fallbackem); žádný globální strop
//   - neplatný formát se odmítá lokálně (klient) i zde 400 – nespotřebuje pokus pro hádání
//   - jednotná odpověď "invalid_key" pro neexistující klíč i jakoukoli vnitřní neshodu,
//     aby nešlo rozlišit "klíč existuje" vs "neexistuje"
//   - plaintext klíče ani hash se nikdy nelogují

export async function POST(request: NextRequest) {
  const env = getSupabaseEnv();
  if (!env) {
    return NextResponse.json({ ok: false, code: "missing_supabase_env" }, { status: 500 });
  }

  const ip = getRequestIpAddress(request);
  const limitParams = { action: "recovery_key_redeem", ip, userId: null, limit: 10, windowMinutes: 15, blockMinutes: 15 };
  let rateLimit;
  try {
    rateLimit = await checkRateLimit(limitParams);
  } catch {
    rateLimit = checkInMemoryRateLimit(limitParams);
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, code: "rate_limited", retry_after: rateLimit.retryAfterSeconds ?? 60 },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  const canonical = typeof body?.key === "string" ? normalizeRecoveryKey(body.key) : null;
  if (!canonical) {
    return NextResponse.json({ ok: false, code: "invalid_format" }, { status: 400 });
  }

  let hash: string;
  try {
    hash = hashRecoveryKey(canonical);
  } catch {
    return NextResponse.json({ ok: false, code: "recovery_unavailable" }, { status: 500 });
  }

  const invalid = () =>
    NextResponse.json({ ok: false, code: "invalid_key" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false } });

  const { data: profile } = await admin
    .from("child_profiles")
    .select("id, parent_user_id")
    .eq("recovery_key_hash", hash)
    .limit(1)
    .maybeSingle<{ id: string; parent_user_id: string }>();
  if (!profile?.parent_user_id) {
    return invalid();
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.parent_user_id);
  const authUser = userData?.user;
  if (userError || !authUser) {
    return invalid();
  }

  let email = typeof authUser.email === "string" ? authUser.email.trim() : "";
  if (!email) {
    // Starší anonymní účet bez technické identity – doplnit (stejné auth user ID).
    email = technicalEmailForUser(authUser.id);
    const { error: identityError } = await admin.auth.admin.updateUserById(authUser.id, {
      email,
      email_confirm: true
    });
    if (identityError) {
      return NextResponse.json({ ok: false, code: "recovery_unavailable" }, { status: 500 });
    }
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return NextResponse.json({ ok: false, code: "recovery_unavailable" }, { status: 500 });
  }

  await admin
    .from("child_profiles")
    .update({ recovery_key_last_used_at: new Date().toISOString() })
    .eq("id", profile.id);

  return NextResponse.json(
    { ok: true, token_hash: tokenHash, verify_type: "magiclink" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
