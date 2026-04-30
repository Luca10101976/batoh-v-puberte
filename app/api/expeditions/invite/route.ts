import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import {
  areFriendsAcrossOwnProfiles,
  getAuthenticatedUser,
  getOwnedChildProfile,
  getOwnedChildProfiles,
  getPublicCode,
  getSession,
  getSessionMembershipForAny,
  normalizeCode,
  resolveProfileByPublicCode
} from "@/app/api/expeditions/_shared";

const MAX_FRIENDS_PER_INVITE = 8;

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.error === "unauthorized" ? 401 : 500 });
  }

  const rateLimitResult = await checkRateLimit({
    action: "expeditions_invite",
    ip: getRequestIpAddress(request),
    userId: auth.user.id,
    limit: 20,
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
    friendCodes?: string[];
  };

  const sessionId = (body.sessionId ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "missing_session_id" }, { status: 400 });
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

  if (session.leader_child_profile_id !== ownProfile.id) {
    return NextResponse.json({ ok: false, error: "leader_only" }, { status: 403 });
  }

  if (session.status !== "waiting") {
    return NextResponse.json({ ok: false, error: "session_not_waiting" }, { status: 409 });
  }

  const ownPublicCode = getPublicCode(ownProfile);
  const normalizedFriendCodes = Array.from(
    new Set(
      (Array.isArray(body.friendCodes) ? body.friendCodes : [])
        .map((code) => normalizeCode(code))
        .filter((code) => code.length >= 4 && code !== ownPublicCode)
    )
  ).slice(0, MAX_FRIENDS_PER_INVITE);

  if (normalizedFriendCodes.length === 0) {
    return NextResponse.json({ ok: false, error: "missing_friend_codes" }, { status: 400 });
  }

  const invited: Array<{ code: string; name: string }> = [];
  for (const code of normalizedFriendCodes) {
    const friendProfile = await resolveProfileByPublicCode(auth.admin, code);
    if (!friendProfile?.id || friendProfile.id === ownProfile.id) {
      continue;
    }

    const isFriend = await areFriendsAcrossOwnProfiles(auth.admin, ownProfileIds, friendProfile.id);
    if (!isFriend) {
      continue;
    }

    const existing = await getSessionMembershipForAny(auth.admin, sessionId, [friendProfile.id]);
    if (existing && existing.status !== "removed" && existing.status !== "declined") {
      continue;
    }

    const { error: upsertError } = await auth.admin.from("child_game_session_players").upsert(
      {
        session_id: sessionId,
        child_profile_id: friendProfile.id,
        status: "invited",
        joined_at: null
      },
      { onConflict: "session_id,child_profile_id" }
    );

    if (!upsertError) {
      invited.push({ code: getPublicCode(friendProfile), name: friendProfile.child_name });
    }
  }

  return NextResponse.json({ ok: true, invited });
}
