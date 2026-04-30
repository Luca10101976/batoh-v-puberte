import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import { getAuthenticatedUser, getOwnedChildProfile, getSession } from "@/app/api/expeditions/_shared";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.error === "unauthorized" ? 401 : 500 });
  }

  const rateLimitResult = await checkRateLimit({
    action: "expeditions_cancel",
    ip: getRequestIpAddress(request),
    userId: auth.user.id,
    limit: 20,
    windowMinutes: 60,
    blockMinutes: 10
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after: rateLimitResult.retryAfterSeconds ?? 60 },
      { status: 429 }
    );
  }

  const body = (await request.json()) as { playerCode?: string; profileCode?: string; sessionId?: string };
  const sessionId = (body.sessionId ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "missing_session_id" }, { status: 400 });
  }

  const ownProfile = await getOwnedChildProfile(auth.admin, auth.user.id, body.playerCode ?? body.profileCode);
  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
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

  const nowIso = new Date().toISOString();
  const { error: sessionError } = await auth.admin
    .from("child_game_sessions")
    .update({ status: "cancelled", finished_at: nowIso } as never)
    .eq("id", sessionId)
    .in("status", ["waiting", "active"]);

  if (sessionError) {
    return NextResponse.json({ ok: false, error: "session_cancel_failed" }, { status: 500 });
  }

  await auth.admin
    .from("child_game_session_players")
    .update({ status: "removed" } as never)
    .eq("session_id", sessionId)
    .neq("child_profile_id", ownProfile.id)
    .in("status", ["invited", "accepted"]);

  return NextResponse.json({ ok: true });
}

