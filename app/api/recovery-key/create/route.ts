import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getOwnedChildProfile } from "@/app/api/expeditions/_shared";
import { checkInMemoryRateLimit, checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import {
  formatRecoveryKey,
  generateRecoveryKey,
  hashRecoveryKey,
  isTechnicalEmail,
  technicalEmailForUser
} from "@/lib/recovery-key-server";

// Vytvoří (nebo nahradí) Traki klíč pro přihlášeného hráče.
//
// - klíč generuje VÝHRADNĚ server (CSPRNG), klient dostane plaintext jen v této odpovědi
// - do DB jde pouze HMAC (recovery_key_hash) + čas vytvoření; UNIQUE index hlídá kolize
// - starý klíč je po regeneraci okamžitě neplatný (hash se přepíše)
// - anonymní účet dostane interní technický e-mail (<uuid>@players.postope.invalid),
//   který je nutný pro pozdější obnovu přes generateLink – nikdy se nezobrazuje
//   a nikam se neposílá; auth user ID se nemění
//
// Plaintext klíče se NIKDY neloguje.

const MAX_GENERATION_ATTEMPTS = 5;
const UNIQUE_VIOLATION = "23505";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, code: auth.error }, { status: auth.error === "unauthorized" ? 401 : 500 });
  }
  const { user, admin } = auth;

  const ip = getRequestIpAddress(request);
  const limitParams = { action: "recovery_key_create", ip, userId: user.id, limit: 5, windowMinutes: 60, blockMinutes: 30 };
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

  const profile = await getOwnedChildProfile(admin, user.id);
  if (!profile) {
    return NextResponse.json({ ok: false, code: "no_profile" }, { status: 404 });
  }

  // Účet bez e-mailu (anonymní) potřebuje interní technickou identitu pro budoucí obnovu.
  const currentEmail = typeof user.email === "string" ? user.email.trim() : "";
  if (!currentEmail) {
    const { error: identityError } = await admin.auth.admin.updateUserById(user.id, {
      email: technicalEmailForUser(user.id),
      email_confirm: true
    });
    if (identityError) {
      return NextResponse.json({ ok: false, code: "identity_setup_failed" }, { status: 500 });
    }
  }

  // Rozlišení "první klíč" vs. "regenerace" pro hlášku v UI – podle skutečného stavu
  // na serveru (ne podle lokálního úložiště zařízení). Žádná DB změna, jen čtení.
  const { data: existing } = await admin
    .from("child_profiles")
    .select("recovery_key_hash")
    .eq("id", profile.id)
    .eq("parent_user_id", user.id)
    .maybeSingle<{ recovery_key_hash: string | null }>();
  const replaced = Boolean(existing?.recovery_key_hash);

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const canonical = generateRecoveryKey();
    let hash: string;
    try {
      hash = hashRecoveryKey(canonical);
    } catch {
      return NextResponse.json({ ok: false, code: "recovery_unavailable" }, { status: 500 });
    }

    const { error: updateError } = await admin
      .from("child_profiles")
      .update({
        recovery_key_hash: hash,
        recovery_key_created_at: new Date().toISOString(),
        recovery_key_last_used_at: null
      })
      .eq("id", profile.id)
      .eq("parent_user_id", user.id);

    if (!updateError) {
      return NextResponse.json(
        {
          ok: true,
          recovery_key: formatRecoveryKey(canonical),
          replaced,
          identity: isTechnicalEmail(currentEmail) || !currentEmail ? "traki" : "email"
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    if (updateError.code !== UNIQUE_VIOLATION) {
      return NextResponse.json({ ok: false, code: "key_store_failed" }, { status: 500 });
    }
    // kolize hashů (prakticky nemožná) -> vygenerovat nový klíč a zkusit znovu
  }

  return NextResponse.json({ ok: false, code: "key_generation_failed" }, { status: 500 });
}
