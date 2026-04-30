import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkInMemoryRateLimit, checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";

type LoginPayload = {
  email?: string;
  password?: string;
};

function generateProfileCode() {
  return `BAT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, code: "missing_supabase_env" }, { status: 500 });
  }
  const url = supabaseUrl;
  const anonKey = supabaseAnonKey;

  const requestIp = getRequestIpAddress(request);
  let rateLimitResult;
  try {
    rateLimitResult = await checkRateLimit({
      action: "auth_login",
      ip: requestIp,
      userId: null,
      limit: 5,
      windowMinutes: 15,
      blockMinutes: 15
    });
  } catch {
    // Fallback path to keep auth available if DB limiter is temporarily unavailable.
    rateLimitResult = checkInMemoryRateLimit({
      action: "auth_login",
      ip: requestIp,
      userId: null,
      limit: 5,
      windowMinutes: 15,
      blockMinutes: 15
    });
  }

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "rate_limited",
        retry_after: rateLimitResult.retryAfterSeconds ?? 60
      },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as LoginPayload | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";

  if (!email.includes("@") || password.length < 6) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_payload"
      },
      { status: 400 }
    );
  }

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error || !data.user || !data.session) {
    const normalized = String(error?.message ?? "").toLowerCase();
    if (normalized.includes("email not confirmed")) {
      return NextResponse.json(
        {
          ok: false,
          code: "email_not_confirmed"
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        code: "invalid_credentials"
      },
      { status: 401 }
    );
  }
  const session = data.session;
  const user = data.user;

  let profile:
    | {
        child_name: string;
        child_age: number;
        profile_code: string;
        player_code: string;
        contact_email: string | null;
        has_pin: boolean;
        avatar: string | null;
        avatar_config: Record<string, unknown> | null;
      }
    | null = null;

  async function findProfileViaSession() {
    const sessionClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      }
    });

    // Newer schema path.
    const modernByUpdated = await sessionClient
      .from("child_profiles")
      .select("child_name, child_age, profile_code, player_code, contact_email, pin_hash, pin_updated_at, avatar, avatar_config, created_at, updated_at")
      .eq("parent_user_id", user.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle<{
        child_name: string;
        child_age: number;
        profile_code: string;
        player_code: string | null;
        contact_email: string | null;
        pin_hash: string | null;
        pin_updated_at: string | null;
        avatar: string | null;
        avatar_config: Record<string, unknown> | null;
      }>();

    const modern =
      modernByUpdated.error?.code === "42703"
        ? await sessionClient
            .from("child_profiles")
            .select("child_name, child_age, profile_code, player_code, contact_email, pin_hash, pin_updated_at, avatar, avatar_config, created_at")
            .eq("parent_user_id", user.id)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(1)
            .maybeSingle<{
              child_name: string;
              child_age: number;
              profile_code: string;
              player_code: string | null;
              contact_email: string | null;
              pin_hash: string | null;
              pin_updated_at: string | null;
              avatar: string | null;
              avatar_config: Record<string, unknown> | null;
            }>()
        : modernByUpdated;

    if (!modern.error && modern.data) {
      return {
        child_name: modern.data.child_name,
        child_age: modern.data.child_age,
        profile_code: modern.data.profile_code,
        player_code: modern.data.player_code || modern.data.profile_code,
        contact_email: modern.data.contact_email ?? null,
        has_pin: Boolean(modern.data.pin_hash) || Boolean(modern.data.pin_updated_at),
        avatar: modern.data.avatar ?? null,
        avatar_config: (modern.data.avatar_config as Record<string, unknown> | null) ?? null
      };
    }

    // Legacy schema compatibility path (missing player_code/contact_email/pin_hash).
    if (modern.error?.code === "42703") {
      const legacy = await sessionClient
        .from("child_profiles")
        .select("child_name, child_age, profile_code, pin_updated_at, created_at")
        .eq("parent_user_id", user.id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle<{
          child_name: string;
          child_age: number;
          profile_code: string;
          pin_updated_at: string | null;
        }>();

      if (!legacy.error && legacy.data) {
        return {
          child_name: legacy.data.child_name,
          child_age: legacy.data.child_age,
          profile_code: legacy.data.profile_code,
          player_code: legacy.data.profile_code,
          contact_email: user.email ?? null,
          has_pin: Boolean(legacy.data.pin_updated_at),
          avatar: null,
          avatar_config: null
        };
      }
    }

    return null;
  }

  async function createProfileViaSession() {
    const sessionClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      }
    });

    const childName = (user.email?.split("@")[0] || "Hráč").slice(0, 40);
    const code = generateProfileCode();

    const modernInsert = await sessionClient.from("child_profiles").insert({
      parent_user_id: user.id,
      child_name: childName,
      child_age: 11,
      profile_code: code,
      player_code: code,
      contact_email: user.email ?? null
    });

    if (modernInsert.error?.code === "42703") {
      const legacyInsert = await sessionClient.from("child_profiles").insert({
        parent_user_id: user.id,
        child_name: childName,
        child_age: 11,
        profile_code: code
      });
      if (legacyInsert.error) {
        return null;
      }
    } else if (modernInsert.error) {
      return null;
    }

    return findProfileViaSession();
  }

  // Primary path: read profile as signed-in user (works without service-role key).
  try {
    profile = await findProfileViaSession();
  } catch {
    // Non-blocking: admin fallback below.
  }

  if (!profile && serviceRoleKey) {
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

    const byParentUpdated = await admin
      .from("child_profiles")
      .select("id, parent_user_id, child_name, child_age, profile_code, player_code, contact_email, pin_hash, pin_updated_at, avatar, avatar_config, created_at, updated_at")
      .eq("parent_user_id", user.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle<{
        id: string;
        parent_user_id: string | null;
        child_name: string;
        child_age: number;
        profile_code: string;
        player_code: string | null;
        contact_email: string | null;
        pin_hash: string | null;
        pin_updated_at: string | null;
        avatar: string | null;
        avatar_config: Record<string, unknown> | null;
      }>();

    const byParent =
      byParentUpdated.error?.code === "42703"
        ? await admin
            .from("child_profiles")
            .select("id, parent_user_id, child_name, child_age, profile_code, player_code, contact_email, pin_hash, pin_updated_at, avatar, avatar_config, created_at")
            .eq("parent_user_id", user.id)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(1)
            .maybeSingle<{
              id: string;
              parent_user_id: string | null;
              child_name: string;
              child_age: number;
              profile_code: string;
              player_code: string | null;
              contact_email: string | null;
              pin_hash: string | null;
              pin_updated_at: string | null;
              avatar: string | null;
              avatar_config: Record<string, unknown> | null;
            }>()
        : byParentUpdated;

    const resolved = byParent.data ?? null;

    if (resolved) {
      profile = {
        child_name: resolved.child_name,
        child_age: resolved.child_age,
        profile_code: resolved.profile_code,
        player_code: resolved.player_code || resolved.profile_code,
        contact_email: resolved.contact_email ?? null,
        has_pin: Boolean(resolved.pin_hash) || Boolean(resolved.pin_updated_at),
        avatar: resolved.avatar ?? null,
        avatar_config: (resolved.avatar_config as Record<string, unknown> | null) ?? null
      };
    }
  }

  // Self-healing path: prevent dead-end login screen when auth account exists but profile is missing.
  if (!profile) {
    try {
      profile = await createProfileViaSession();
    } catch {
      // Keep null, client will show signup guidance.
    }
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email ?? email
    },
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    },
    profile
  });
}
