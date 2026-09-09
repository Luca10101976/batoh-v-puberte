import { NextRequest, NextResponse } from "next/server";
import { gameAccessHttpStatus, resolveServerGameAccess } from "@/lib/game-access-server";
import { checkRateLimitSafe, getRequestIpAddress } from "@/lib/rate-limit";
import { getAuthenticatedUser, getOwnedChildProfile, getSession } from "@/app/api/expeditions/_shared";
import { completeRunForParticipants } from "@/lib/game-completion";
import { getRun, getRunParticipantIds } from "@/lib/game-run";

// R23/T3: ukončení skupinové výpravy používá STEJNOU dokončovací logiku jako sólo
// hraní (lib/game-completion.ts). Zmizelo tím:
//   - kopírování skóre vedoucího všem účastníkům (P2),
//   - druhý zdroj účastníků ve staré tabulce pozvánek,
//   - filtr přes penalty_points, který přeskakoval rozehrané účastníky (T2),
//   - bodování z hodnot poslaných klientem (T1),
//   - čas dokončení z klienta (T7).

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.error === "unauthorized" ? 401 : 500 });
  }

  const rateLimitResult = await checkRateLimitSafe({
    action: "expeditions_finish",
    ip: getRequestIpAddress(request),
    userId: auth.user.id,
    limit: 60,
    windowMinutes: 60,
    blockMinutes: 10
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after: rateLimitResult.retryAfterSeconds ?? 60 },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    playerCode?: string;
    profileCode?: string;
    sessionId?: string;
    missionId?: string;
  } | null;

  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const sessionId = (body.sessionId ?? "").trim();
  const missionId = (body.missionId ?? "").trim();

  if (!sessionId || !missionId) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const ownProfile = await getOwnedChildProfile(auth.admin, auth.user.id, body.playerCode ?? body.profileCode);
  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
  }

  // R22 + R23/P9: existenci, publikaci i zámek hry určuje katalog z databáze.
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

  if (session.status !== "active") {
    return NextResponse.json({ ok: false, error: "session_not_active" }, { status: 409 });
  }

  const run = await getRun(auth.admin, sessionId);
  if (run?.locationId && run.locationId !== missionId) {
    return NextResponse.json({ ok: false, error: "mission_mismatch" }, { status: 409 });
  }

  let participantIds: string[];
  try {
    participantIds = await getRunParticipantIds(auth.admin, sessionId);
  } catch {
    return NextResponse.json({ ok: false, error: "progress_load_failed" }, { status: 500 });
  }

  if (participantIds.length === 0) {
    return NextResponse.json({ ok: false, error: "no_accepted_players" }, { status: 409 });
  }

  const outcome = await completeRunForParticipants(auth.admin, {
    runId: sessionId,
    locationId: missionId,
    participantChildProfileIds: participantIds.slice(0, 8),
    source: "expedition"
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, error: outcome.error === "save_failed" ? "progress_save_failed" : "progress_load_failed" },
      { status: 500 }
    );
  }

  // P2 + P3: kdo v této výpravě neuzavřel všechny úkoly, ten hru nedokončil.
  // Výprava se přesto uzavírá – ostatním se výsledek zapsal.
  return NextResponse.json({
    ok: true,
    sessionId,
    missionId,
    participantCodes: outcome.completedCodes,
    unfinishedCodes: outcome.participants.filter((entry) => !entry.completed).map((entry) => entry.profileCode)
  });
}
