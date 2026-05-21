import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import { getGameplayLocation } from "@/lib/gameplay-server";
import { isCompletedLocationProgress } from "@/lib/location-progress-state";

type ChildProfileRow = {
  id: string;
  profile_code: string;
};

type TaskProgressRow = {
  task_id: string;
  status: "correct" | "wrong" | "unknown";
  attempts: number;
};

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

  const rateLimitResult = await checkRateLimit({
    action: "location_progress",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 120,
    windowMinutes: 60,
    blockMinutes: 15
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        retry_after: rateLimitResult.retryAfterSeconds ?? 60
      },
      { status: 429 }
    );
  }

  const body = (await request.json()) as {
    profileCode?: string;
    locationId?: string;
  };

  const profileCode = (body.profileCode ?? "").trim().toUpperCase();
  const locationId = (body.locationId ?? "").trim();
  if (!profileCode || !locationId) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const knownLocation = await getGameplayLocation(locationId);
  if (!knownLocation) {
    return NextResponse.json({ ok: false, error: "unknown_location" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: ownProfile } = await admin
    .from("child_profiles")
    .select("id, profile_code")
    .eq("parent_user_id", user.id)
    .eq("profile_code", profileCode)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "forbidden_profile" }, { status: 403 });
  }

  const { data: taskRows } = await admin
    .from("child_task_progress")
    .select("task_id, status, attempts")
    .eq("child_profile_id", ownProfile.id)
    .eq("location_id", locationId);

  const { data: locationRow } = await admin
    .from("child_location_progress")
    .select("status, first_completed_at, completed_at")
    .eq("profile_code", ownProfile.profile_code)
    .eq("location_id", locationId)
    .limit(1)
    .maybeSingle<{ status?: "in_progress" | "completed" | null; first_completed_at?: string | null; completed_at?: string | null }>();

  const isReplayOfCompletedMission = isCompletedLocationProgress(locationRow);

  return NextResponse.json({
    ok: true,
    location: {
      status: locationRow?.status ?? null,
      first_completed_at: locationRow?.first_completed_at ?? null,
      completed_at: locationRow?.completed_at ?? null
    },
    task_progress: isReplayOfCompletedMission
      ? []
      : ((taskRows as TaskProgressRow[] | null) ?? []).map((row) => ({
      task_id: row.task_id,
      status: row.status,
      attempts: Math.max(0, row.attempts ?? 0)
    }))
  });
}
