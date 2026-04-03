import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { locations } from "@/lib/mock-data";

type ChildProfileRow = {
  id: string;
  profile_code: string;
};

type AcceptedInviteRow = {
  inviter_profile_code: string;
  invitee_profile_code: string;
};

type ProgressUpsertRow = {
  profile_code: string;
  location_id: string;
  completed_at: string;
  penalty_points?: number;
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

  const body = (await request.json()) as {
    profileCode?: string;
    locationId?: string;
    expeditionId?: string | null;
    mode?: "solo" | "group";
    completedAt?: string;
    penaltyPoints?: number;
  };

  const profileCode = normalizeCode(body.profileCode ?? "");
  const locationId = (body.locationId ?? "").trim();
  const expeditionId = (body.expeditionId ?? "").trim();
  const mode = body.mode === "group" ? "group" : "solo";
  const completedAt = body.completedAt ? new Date(body.completedAt).toISOString() : new Date().toISOString();
  const penaltyPoints = Math.max(0, Number(body.penaltyPoints) || 0);

  if (!profileCode || !locationId) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const isKnownLocation = locations.some((location) => location.id === locationId);
  if (!isKnownLocation) {
    return NextResponse.json({ ok: false, error: "unknown_location" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: ownProfile } = await admin
    .from("child_profiles")
    .select("id, profile_code")
    .eq("profile_code", profileCode)
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "forbidden_profile" }, { status: 403 });
  }

  const participantCodes = new Set<string>([profileCode]);

  if (mode === "group" && expeditionId) {
    const { data: acceptedRows } = await admin
      .from("child_expedition_invites")
      .select("inviter_profile_code, invitee_profile_code")
      .eq("expedition_id", expeditionId)
      .eq("status", "accepted")
      .or(`inviter_child_profile_id.eq.${ownProfile.id},invitee_child_profile_id.eq.${ownProfile.id}`);

    ((acceptedRows as AcceptedInviteRow[] | null) ?? []).forEach((row) => {
      participantCodes.add(normalizeCode(row.inviter_profile_code));
      participantCodes.add(normalizeCode(row.invitee_profile_code));
    });
  }

  const safeParticipants = Array.from(participantCodes).slice(0, 8);

  const rows: ProgressUpsertRow[] = safeParticipants.map((code) => ({
    profile_code: code,
    location_id: locationId,
    completed_at: completedAt,
    penalty_points: penaltyPoints
  }));

  let saveError: { code?: string } | null = null;

  const { error: saveWithPenaltyError } = await admin.from("child_location_progress").upsert(rows, {
    onConflict: "profile_code,location_id"
  });

  if (saveWithPenaltyError?.code === "42703") {
    const fallbackRows = rows.map(({ penalty_points: _ignoredPenalty, ...row }) => row);
    const { error: saveFallbackError } = await admin.from("child_location_progress").upsert(fallbackRows, {
      onConflict: "profile_code,location_id"
    });
    saveError = saveFallbackError;
  } else {
    saveError = saveWithPenaltyError;
  }

  if (saveError) {
    return NextResponse.json({ ok: false, error: "save_progress_failed" }, { status: 500 });
  }

  try {
    await admin.from("child_security_events").insert({
      actor_child_profile_id: ownProfile.id,
      event_type: "location_completed",
      metadata: {
        location_id: locationId,
        mode,
        expedition_id: expeditionId || null,
        participants: safeParticipants
      }
    });
  } catch {
    // best effort audit write
  }

  return NextResponse.json({
    ok: true,
    participantCodes: safeParticipants
  });
}
