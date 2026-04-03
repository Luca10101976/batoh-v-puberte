import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ChildProfileDto = {
  child_name: string;
  child_age: number;
  profile_code: string;
  pin_hash: string | null;
};

export async function GET(request: Request) {
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

  const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const {
    data: { user },
    error: authError
  } = await authClient.auth.getUser(accessToken);

  if (authError || !user?.id) {
    return NextResponse.json({ ok: false, message: "Neplatné přihlášení." }, { status: 401 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: profileRows, error: profileError } = await adminClient
    .from("child_profiles")
    .select("child_name, child_age, profile_code, pin_hash, created_at")
    .eq("parent_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (profileError) {
    return NextResponse.json({ ok: false, message: "Nepodařilo se načíst profil dítěte." }, { status: 500 });
  }

  const profile = (profileRows?.[0] as ChildProfileDto | undefined) ?? null;
  if (!profile) {
    return NextResponse.json({ ok: true, profile: null, progress: [] });
  }

  const { data: progressRows } = await adminClient
    .from("child_location_progress")
    .select("location_id, completed_at")
    .eq("profile_code", profile.profile_code);

  return NextResponse.json({
    ok: true,
    profile,
    progress: (progressRows ?? []) as Array<{ location_id: string; completed_at: string }>
  });
}

