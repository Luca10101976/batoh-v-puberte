import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";

type ChildProfileDto = {
  child_name: string;
  // New public player code used for friend sharing. Kept alongside profile_code for compatibility.
  player_code: string;
  child_age: number;
  profile_code: string;
  contact_email: string | null;
  has_pin: boolean;
  avatar: string;
  avatar_config: {
    head: "round" | "oval" | "square";
    eyes: "dot" | "smile" | "wide";
    hair: "short" | "long" | "spiky";
    color: string;
  };
};

type PatchPayload = {
  child_name?: string;
  child_age?: number;
  profile_code?: string;
  player_code?: string;
  avatar?: string;
  avatar_config?: unknown;
};

const DEFAULT_AVATAR = "🕵️";
const DEFAULT_AVATAR_CONFIG: ChildProfileDto["avatar_config"] = {
  head: "round",
  eyes: "dot",
  hair: "short",
  color: "#7EC8FF"
};

function generateProfileCode() {
  return `BAT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function isEmojiAvatar(value: string) {
  return /[\p{Extended_Pictographic}]/u.test(value);
}

function isBackpackAvatarId(value: string) {
  return /^batuzek-\d{2}$/.test(value);
}

function normalizeAvatarConfig(input: unknown): ChildProfileDto["avatar_config"] | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const data = input as Record<string, unknown>;
  const head = data.head;
  const eyes = data.eyes;
  const hair = data.hair;
  const color = data.color;

  if (head !== "round" && head !== "oval" && head !== "square") {
    return null;
  }
  if (eyes !== "dot" && eyes !== "smile" && eyes !== "wide") {
    return null;
  }
  if (hair !== "short" && hair !== "long" && hair !== "spiky") {
    return null;
  }
  if (typeof color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return null;
  }

  return { head, eyes, hair, color };
}

type GenericProfileRow = Record<string, unknown> & {
  id?: string;
  parent_user_id?: string | null;
  profile_code?: string | null;
  player_code?: string | null;
  contact_email?: string | null;
  child_name?: string | null;
  child_age?: number | null;
  pin_hash?: string | null;
  pin_updated_at?: string | null;
  avatar?: string | null;
  avatar_config?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

function toStr(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toCode(value: unknown) {
  return toStr(value).trim().toUpperCase();
}

function toInt(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function normalizeProfileRow(row: GenericProfileRow, userEmail: string | null): ChildProfileDto {
  const legacyProfileCode = toCode(row.profile_code) || generateProfileCode();
  const publicPlayerCode = toCode(row.player_code) || legacyProfileCode;
  const avatarConfig = normalizeAvatarConfig(row.avatar_config) || DEFAULT_AVATAR_CONFIG;
  const avatar = toStr(row.avatar) || DEFAULT_AVATAR;

  return {
    child_name: toStr(row.child_name).trim() || "Hráč",
    player_code: publicPlayerCode,
    child_age: Math.max(8, toInt(row.child_age, 11)),
    profile_code: legacyProfileCode,
    contact_email: toStr(row.contact_email).trim() || userEmail || null,
    has_pin: Boolean(row.pin_hash) || Boolean(row.pin_updated_at),
    avatar,
    avatar_config: avatarConfig
  };
}

function sortProfilesNewest(rows: GenericProfileRow[]) {
  const toTimestamp = (row: GenericProfileRow) => {
    const updatedRaw = toStr(row.updated_at);
    const createdRaw = toStr(row.created_at);
    const updatedParsed = Date.parse(updatedRaw);
    if (Number.isFinite(updatedParsed)) {
      return updatedParsed;
    }
    const createdParsed = Date.parse(createdRaw);
    if (Number.isFinite(createdParsed)) {
      return createdParsed;
    }
    return 0;
  };

  const toStableId = (row: GenericProfileRow) => toStr(row.id) || toCode(row.profile_code) || "NO-ID";

  return [...rows].sort((a, b) => {
    const aTime = toTimestamp(a);
    const bTime = toTimestamp(b);
    if (aTime !== bTime) {
      return bTime - aTime;
    }
    const aId = toStableId(a);
    const bId = toStableId(b);
    return bId.localeCompare(aId);
  });
}

function sortProfilesCanonical(rows: GenericProfileRow[]) {
  const toTimestamp = (value: unknown) => {
    const parsed = Date.parse(toStr(value));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return [...rows].sort((a, b) => {
    const aCreated = toTimestamp(a.created_at);
    const bCreated = toTimestamp(b.created_at);
    if (aCreated !== bCreated) {
      // Canonical row is the oldest profile row for the user.
      return aCreated - bCreated;
    }

    const aId = toStr(a.id);
    const bId = toStr(b.id);
    return aId.localeCompare(bId);
  });
}

function pickCanonicalProfile(rows: GenericProfileRow[]) {
  return sortProfilesCanonical(rows)[0] ?? null;
}

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Vary: "Authorization"
    }
  });
}

async function fetchCanonicalProfile(
  adminClient: any,
  userId: string
): Promise<{ canonical: GenericProfileRow | null; hasDuplicates: boolean }> {
  const rowsQuery = await adminClient
    .from("child_profiles")
    .select("*")
    .eq("parent_user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(2);
  const rows = (rowsQuery.data as GenericProfileRow[] | null) ?? [];
  const canonical = rows[0] ?? null;

  return {
    canonical,
    hasDuplicates: rows.length > 1
  };
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonNoStore({ ok: false, message: "Supabase konfigurace chybí." }, 500);
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return jsonNoStore({ ok: false, message: "Chybí přihlášení." }, 401);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const {
    data: { user },
    error: authError
  } = await authClient.auth.getUser(accessToken);

  if (authError || !user?.id) {
    return jsonNoStore({ ok: false, message: "Neplatné přihlášení." }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const requestUrl = new URL(request.url);
  const includeProgress = requestUrl.searchParams.get("withProgress") === "1";
  const { canonical, hasDuplicates } = await fetchCanonicalProfile(adminClient, user.id);
  const rawProfile = canonical;

  if (hasDuplicates) {
    // Legacy guard: there should be one profile per user; we keep app stable by pinning canonical row.
    console.warn(`[child-profile/me] legacy duplicate profiles detected for user ${user.id}`);
  }

  if (!rawProfile) {
    return jsonNoStore({ ok: true, profile: null, progress: [] });
  }

  const profile = normalizeProfileRow(rawProfile, user.email ?? null);

  let progressRows: Array<{
    location_id: string;
    completed_at: string;
    penalty_points?: number;
    first_completed_at?: string;
    status?: "in_progress" | "completed";
    completion_source?: string;
    best_score?: number;
  }> = [];

  if (includeProgress) {
    const progressQuery = await adminClient
      .from("child_location_progress")
      .select("*")
      .eq("profile_code", profile.profile_code);
    const rawProgressRows = (progressQuery.data as Array<Record<string, unknown>> | null) ?? [];
    progressRows = rawProgressRows
      .map((row) => {
        const locationId = toStr(row.location_id).trim();
        const completedAt = toStr(row.completed_at).trim();
        if (!locationId || !completedAt) {
          return null;
        }
        const penaltyRaw = row.penalty_points;
        const penaltyPoints =
          typeof penaltyRaw === "number" && Number.isFinite(penaltyRaw) ? Math.max(0, penaltyRaw) : undefined;
        const firstCompletedAtRaw = toStr(row.first_completed_at).trim();
        const statusRaw = toStr(row.status).trim().toLowerCase();
        const completionSourceRaw = toStr(row.completion_source).trim().toLowerCase();
        const bestScoreRaw = row.best_score;
        const bestScore =
          typeof bestScoreRaw === "number" && Number.isFinite(bestScoreRaw) ? Math.max(0, Math.floor(bestScoreRaw)) : undefined;
        return {
          location_id: locationId,
          completed_at: completedAt,
          ...(typeof penaltyPoints === "number" ? { penalty_points: penaltyPoints } : {}),
          ...(firstCompletedAtRaw ? { first_completed_at: firstCompletedAtRaw } : {}),
          ...(statusRaw === "in_progress" || statusRaw === "completed" ? { status: statusRaw } : {}),
          ...(completionSourceRaw ? { completion_source: completionSourceRaw } : {}),
          ...(typeof bestScore === "number" ? { best_score: bestScore } : {})
        };
      })
      .filter(
        (
          row
        ): row is {
          location_id: string;
          completed_at: string;
          penalty_points?: number;
          first_completed_at?: string;
          status?: "in_progress" | "completed";
          completion_source?: string;
          best_score?: number;
        } => Boolean(row)
      );
  }

  return jsonNoStore({
    ok: true,
    profile,
    profile_id: toStr(rawProfile.id) || null,
    progress: progressRows
  });
}

export async function PATCH(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonNoStore({ ok: false, message: "Supabase konfigurace chybí." }, 500);
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return jsonNoStore({ ok: false, message: "Chybí přihlášení." }, 401);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const {
    data: { user },
    error: authError
  } = await authClient.auth.getUser(accessToken);

  if (authError || !user?.id) {
    return jsonNoStore({ ok: false, message: "Neplatné přihlášení." }, 401);
  }

  const rateLimitResult = await checkRateLimit({
    action: "child_profile_patch",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 60,
    windowMinutes: 60,
    blockMinutes: 15
  });

  if (!rateLimitResult.allowed) {
    return jsonNoStore(
      {
        ok: false,
        code: "rate_limited",
        message: "Příliš mnoho změn profilu. Zkus to znovu později.",
        retry_after: rateLimitResult.retryAfterSeconds ?? 60
      },
      429
    );
  }

  const payload = (await request.json().catch(() => null)) as PatchPayload | null;
  const childName = typeof payload?.child_name === "string" ? payload.child_name.trim() : "";
  const childAge = typeof payload?.child_age === "number" ? payload.child_age : Number(payload?.child_age);
  const profileCode = typeof payload?.profile_code === "string" ? payload.profile_code.trim().toUpperCase() : "";
  const playerCode = typeof payload?.player_code === "string" ? payload.player_code.trim().toUpperCase() : "";
  const avatar = typeof payload?.avatar === "string" ? payload.avatar.trim() : "";
  const avatarConfig = payload?.avatar_config ? normalizeAvatarConfig(payload.avatar_config) : null;
  const hasNameUpdate = typeof payload?.child_name === "string";
  const hasAgeUpdate = Object.prototype.hasOwnProperty.call(payload ?? {}, "child_age");
  const hasAvatarUpdate = typeof payload?.avatar === "string";
  const hasAvatarConfigUpdate = Object.prototype.hasOwnProperty.call(payload ?? {}, "avatar_config");

  if (!hasNameUpdate && !hasAgeUpdate && !hasAvatarUpdate && !hasAvatarConfigUpdate) {
    return jsonNoStore({ ok: false, code: "no_changes" }, 400);
  }

  if (hasNameUpdate && (!childName || childName.length < 2 || childName.length > 40)) {
    return jsonNoStore({ ok: false, code: "invalid_child_name" }, 400);
  }
  if (hasAgeUpdate && (!Number.isInteger(childAge) || childAge < 8 || childAge > 18)) {
    return jsonNoStore({ ok: false, code: "invalid_child_age" }, 400);
  }
  if (
    hasAvatarUpdate &&
    (!avatar || avatar.length > 24 || (!isEmojiAvatar(avatar) && !isBackpackAvatarId(avatar) && avatar.length > 2))
  ) {
    return jsonNoStore({ ok: false, code: "invalid_avatar" }, 400);
  }
  if (hasAvatarConfigUpdate && !avatarConfig) {
    return jsonNoStore({ ok: false, code: "invalid_avatar_config" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let { canonical, hasDuplicates } = await fetchCanonicalProfile(adminClient, user.id);
  if (hasDuplicates) {
    // Legacy guard: we intentionally write only to canonical row to avoid profile drift.
    console.warn(`[child-profile/me] legacy duplicate profiles detected for user ${user.id}`);
  }

  // Canonical-only writes: legacy duplicate rows can exist, but profile updates must always
  // target one deterministic row to avoid name/avatar drift between devices.
  let targetRow = canonical;

  if (!targetRow?.id) {
    const safeChildName = childName || (user.email?.split("@")[0] || "Hráč").slice(0, 40);
    const safeChildAge = hasAgeUpdate ? childAge : 11;
    let profileCodeSeed = playerCode || profileCode || generateProfileCode();
    let created = false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const legacyInsert = await adminClient.from("child_profiles").insert({
        parent_user_id: user.id,
        child_name: safeChildName,
        child_age: safeChildAge,
        profile_code: profileCodeSeed
      });

      if (!legacyInsert.error) {
        created = true;
        // Best-effort upgrades for modern schema; ignored on legacy schema.
        await adminClient
          .from("child_profiles")
          .update({
            player_code: profileCodeSeed,
            contact_email: user.email ?? null
          })
          .eq("parent_user_id", user.id)
          .eq("profile_code", profileCodeSeed);
        break;
      }

      if (legacyInsert.error.code === "23505") {
        profileCodeSeed = generateProfileCode();
        continue;
      }

      return jsonNoStore({ ok: false, code: "profile_create_failed", message: "Nepodařilo se vytvořit profil dítěte." }, 500);
    }

    if (!created) {
      return jsonNoStore({ ok: false, code: "profile_create_failed", message: "Nepodařilo se vytvořit profil dítěte." }, 500);
    }

    ({ canonical: targetRow } = await fetchCanonicalProfile(adminClient, user.id));
    if (!targetRow?.id) {
      return jsonNoStore({ ok: false, code: "profile_not_found" }, 404);
    }
  }

  const updateData: Record<string, unknown> = {};
  if (hasNameUpdate) {
    updateData.child_name = childName;
  }
  if (hasAgeUpdate) {
    updateData.child_age = childAge;
  }
  if (hasAvatarUpdate) {
    updateData.avatar = avatar;
  }
  if (hasAvatarConfigUpdate && avatarConfig) {
    updateData.avatar_config = avatarConfig;
  }
  // Keep row ordering deterministic when multiple legacy rows exist.
  updateData.updated_at = new Date().toISOString();

  const updateResult = await adminClient
    .from("child_profiles")
    .update(updateData)
    .eq("id", targetRow.id);

  if (updateResult.error) {
    if (updateResult.error.code === "42703" && (hasAvatarUpdate || hasAvatarConfigUpdate)) {
      return jsonNoStore(
        {
          ok: false,
          code: "avatar_schema_missing",
          message: "V databázi chybí nové sloupce pro avatar."
        },
        500
      );
    }
    return jsonNoStore(
      {
        ok: false,
        code: "profile_update_failed",
        message: "Uložení profilu se nepodařilo."
      },
      500
    );
  }

  // Legacy stabilization:
  // Some old flows may still read a different historical row for the same user.
  // Mirror mutable profile fields across all rows of this parent_user_id so reads remain consistent.
  const mirrorData: Record<string, unknown> = {};
  if (hasNameUpdate) {
    mirrorData.child_name = childName;
  }
  if (hasAgeUpdate) {
    mirrorData.child_age = childAge;
  }
  if (hasAvatarUpdate) {
    mirrorData.avatar = avatar;
  }
  if (hasAvatarConfigUpdate && avatarConfig) {
    mirrorData.avatar_config = avatarConfig;
  }
  if (Object.keys(mirrorData).length > 0) {
    mirrorData.updated_at = new Date().toISOString();
    await adminClient.from("child_profiles").update(mirrorData).eq("parent_user_id", user.id);
  }

  const { data: reloadedTargetRaw, error: reloadedTargetError } = await adminClient
    .from("child_profiles")
    .select("*")
    .eq("id", targetRow.id)
    .maybeSingle<GenericProfileRow>();

  if (reloadedTargetError) {
    return jsonNoStore(
      {
        ok: false,
        code: "profile_reload_failed",
        message: "Profil se po uložení nepodařilo načíst."
      },
      500
    );
  }

  const reloadedTarget = reloadedTargetRaw ?? targetRow;

  if (reloadedTarget) {
    return jsonNoStore({
      ok: true,
      profile: normalizeProfileRow(reloadedTarget, user.email ?? null),
      profile_id: toStr(reloadedTarget.id) || toStr(targetRow.id) || null
    });
  }

  return jsonNoStore({
    ok: true,
      profile: {
        child_name: childName || "Hráč",
        child_age: hasAgeUpdate ? childAge : 11,
        player_code: toCode(targetRow.player_code) || toCode(targetRow.profile_code),
        profile_code: toCode(targetRow.profile_code),
        contact_email: user.email ?? null,
        has_pin: false,
        avatar: hasAvatarUpdate ? avatar : DEFAULT_AVATAR,
        avatar_config: hasAvatarConfigUpdate && avatarConfig ? avatarConfig : DEFAULT_AVATAR_CONFIG
      },
      profile_id: toStr(targetRow.id) || null
  });
}
