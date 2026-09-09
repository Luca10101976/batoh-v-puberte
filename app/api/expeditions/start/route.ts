import { NextRequest, NextResponse } from "next/server";
import { gameAccessHttpStatus, resolveServerGameAccess } from "@/lib/game-access-server";
import { checkRateLimitSafe, getRequestIpAddress } from "@/lib/rate-limit";
import { getAuthenticatedUser, getOwnedChildProfile, getSession } from "@/app/api/expeditions/_shared";
import { isMissingColumnError } from "@/lib/game-run";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.error === "unauthorized" ? 401 : 500 });
  }

  const rateLimitResult = await checkRateLimitSafe({
    action: "expeditions_start",
    ip: getRequestIpAddress(request),
    userId: auth.user.id,
    limit: 30,
    windowMinutes: 60,
    blockMinutes: 10
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after: rateLimitResult.retryAfterSeconds ?? 60 },
      { status: 429 }
    );
  }

  const body = (await request.json()) as {
    playerCode?: string;
    profileCode?: string;
    sessionId?: string;
    missionId?: string;
  };

  const sessionId = (body.sessionId ?? "").trim();
  const missionId = (body.missionId ?? "").trim();

  if (!sessionId || !missionId) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const ownProfile = await getOwnedChildProfile(auth.admin, auth.user.id, body.playerCode ?? body.profileCode);
  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
  }

  // R22: i skupinová výprava se řídí serverovým herním zámkem (fail-closed).
  // Existenci a publikaci hry určuje katalog z DB (not_published → 400 unknown_mission),
  // ne mock whitelist – publikovaná hra z Mozku tak projde i bez lib/mock-data.ts.
  const access = await resolveServerGameAccess(auth.admin, ownProfile.profile_code, missionId, {
    childProfileId: ownProfile.id
  });
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, error: access.reason === "not_published" ? "unknown_mission" : "mission_locked" },
      { status: gameAccessHttpStatus(access.reason) }
    );
  }


  const session = await getSession(auth.admin, sessionId);
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "session_not_found" }, { status: 404 });
  }

  if (session.leader_child_profile_id !== ownProfile.id) {
    return NextResponse.json({ ok: false, error: "leader_only" }, { status: 403 });
  }

  if (session.status !== "waiting" && session.status !== "active") {
    return NextResponse.json({ ok: false, error: "session_not_open" }, { status: 409 });
  }

  // R23/T6: sloupec drží veřejnou adresu hry (locationId), ne UUID mise – proto
  // se po migraci jmenuje location_id. Fallback pokrývá okno před migrací.
  const nowIso = new Date().toISOString();
  const basePayload = {
    status: "active",
    started_at: session.started_at ?? nowIso,
    mode: "group"
  };
  let { error: updateError } = await auth.admin
    .from("child_game_sessions")
    .update({ ...basePayload, location_id: missionId } as never)
    .eq("id", sessionId)
    .in("status", ["waiting", "active"]);
  if (isMissingColumnError(updateError)) {
    ({ error: updateError } = await auth.admin
      .from("child_game_sessions")
      .update({ status: "active", started_at: session.started_at ?? nowIso, mission_id: missionId } as never)
      .eq("id", sessionId)
      .in("status", ["waiting", "active"]));
  }

  if (updateError) {
    return NextResponse.json({ ok: false, error: "session_start_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    session: {
      id: sessionId,
      status: "active",
      missionId
    }
  });
}

