import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkInMemoryRateLimit, checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";

type SignUpPayload = {
  email?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, code: "missing_supabase_env" }, { status: 500 });
  }

  const requestIp = getRequestIpAddress(request);
  let rateLimitResult;
  try {
    rateLimitResult = await checkRateLimit({
      action: "auth_signup",
      ip: requestIp,
      userId: null,
      limit: 3,
      windowMinutes: 30,
      blockMinutes: 30
    });
  } catch {
    // Fallback path to keep signup available if DB limiter is temporarily unavailable.
    rateLimitResult = checkInMemoryRateLimit({
      action: "auth_signup",
      ip: requestIp,
      userId: null,
      limit: 3,
      windowMinutes: 30,
      blockMinutes: 30
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

  const body = (await request.json().catch(() => null)) as SignUpPayload | null;
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

  const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const origin = new URL(request.url).origin;
  const { data, error } = await authClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`
    }
  });

  if (error || !data.user) {
    const normalized = String(error?.message ?? "").toLowerCase();
    if (normalized.includes("already registered")) {
      return NextResponse.json({ ok: false, code: "already_registered" }, { status: 409 });
    }
    if (normalized.includes("rate limit")) {
      return NextResponse.json({ ok: false, code: "provider_rate_limited" }, { status: 429 });
    }
    return NextResponse.json({ ok: false, code: "signup_failed" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email ?? email
    },
    needs_email_confirmation: !data.session,
    session: data.session
      ? {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        }
      : null
  });
}
