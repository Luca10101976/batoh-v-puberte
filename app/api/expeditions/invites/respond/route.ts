import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import {
  getAuthenticatedUser,
  getOwnedChildProfile,
  getOwnedChildProfiles,
  getSession,
  getSessionMembershipForAny
} from "@/app/api/expeditions/_shared";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.error === "unauthorized" ? 401 : 500 });
  }

  const rateLimitResult = await checkRateLimit({
    action: "expeditions_invite_respond",
    ip: getRequestIpAddress(request),
    userId: auth.user.id,
    limit: 30,
    windowMinutes: 60,
    blockMinutes: 15
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
    decision?: "accepted" | "declined";
  };

  const sessionId = (body.sessionId ?? "").trim();
  const decision = body.decision;
  if (!sessionId || (decision !== "accepted" && decision !== "declined")) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const ownProfile = await getOwnedChildProfile(auth.admin, auth.user.id, body.playerCode ?? body.profileCode);
  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
  }
  const ownProfiles = await getOwnedChildProfiles(auth.admin, auth.user.id);
  const ownProfileIds = ownProfiles.map((profile) => profile.id);

  const session = await getSession(auth.admin, sessionId);
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "session_not_found" }, { status: 404 });
  }

  if (session.status !== "waiting") {
    return NextResponse.json({ ok: false, error: "session_not_waiting" }, { status: 409 });
  }

  const membership = await getSessionMembershipForAny(auth.admin, sessionId, ownProfileIds);
  if (!membership?.id) {
    return NextResponse.json({ ok: false, error: "invite_not_found" }, { status: 404 });
  }

  if (membership.status !== "invited") {
    return NextResponse.json({ ok: false, error: "invite_not_pending" }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await auth.admin
    .from("child_game_session_players")
    .update({
      status: decision,
      joined_at: decision === "accepted" ? nowIso : null
    })
    .eq("id", membership.id)
    .eq("status", "invited");

  if (updateError) {
    return NextResponse.json({ ok: false, error: "invite_update_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    decision,
    session: {
      id: session.id,
      status: session.status,
      missionId: session.mission_id
    }
  });
}
