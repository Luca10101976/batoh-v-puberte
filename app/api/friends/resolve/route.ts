import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ChildProfileRow = {
  id: string;
  child_name: string;
  profile_code: string;
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

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

  const body = (await request.json()) as { profileCode?: string };
  const requestedCode = normalizeCode(body.profileCode ?? "");

  if (!requestedCode || requestedCode.length < 4) {
    return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: ownChildProfile } = await admin
    .from("child_profiles")
    .select("id, profile_code")
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<{ id: string; profile_code: string }>();

  if (!ownChildProfile?.id) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
  }

  if (normalizeCode(ownChildProfile.profile_code) === requestedCode) {
    return NextResponse.json({ ok: false, error: "own_code" }, { status: 400 });
  }

  const { data: targetProfile } = await admin
    .from("child_profiles")
    .select("id, child_name, profile_code")
    .eq("profile_code", requestedCode)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!targetProfile?.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    profile: {
      id: targetProfile.id,
      name: targetProfile.child_name,
      code: targetProfile.profile_code
    }
  });
}
