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

const MAX_FRIENDS_PER_CREATE = 8;

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.error === "unauthorized" ? 401 : 500 });
  }

  const rateLimitResult = await checkRateLimit({
    action: "expeditions_create",
    ip: getRequestIpAddress(request),
    userId: auth.user.id,
    limit: 10,
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
    friendCodes?: string[];
  };

  const ownProfile = await getOwnedChildProfile(auth.admin, auth.user.id, body.playerCode ?? body.profileCode);
  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
  }
  const ownProfiles = await getOwnedChildProfiles(auth.admin, auth.user.id);
  const ownProfileIds = ownProfiles.map((profile) => profile.id);

  const ownPublicCode = getPublicCode(ownProfile);
  const rawFriendCodes = Array.isArray(body.friendCodes) ? body.friendCodes : [];
  const normalizedFriendCodes = Array.from(
    new Set(
      rawFriendCodes
        .map((code) => normalizeCode(code))
        .filter((code) => code.length >= 4 && code !== ownPublicCode)
    )
  ).slice(0, MAX_FRIENDS_PER_CREATE);

  if (normalizedFriendCodes.length === 0) {
    return NextResponse.json({ ok: false, error: "missing_friend_codes" }, { status: 400 });
  }

  const { data: leaderOpenSession } = await auth.admin
    .from("child_game_sessions")
    .select("id, leader_child_profile_id, mission_id, status, started_at, finished_at, created_at")
    .eq("leader_child_profile_id", ownProfile.id)
    .in("status", ["waiting", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      leader_child_profile_id: string;
      mission_id: string | null;
      status: "waiting" | "active" | "finished" | "cancelled";
      started_at: string | null;
      finished_at: string | null;
      created_at: string;
    }>();

  let sessionId = leaderOpenSession?.id ?? null;
  if (!sessionId) {
    const { data: createdSession, error: sessionError } = await auth.admin
      .from("child_game_sessions")
      .insert({
        leader_child_profile_id: ownProfile.id,
        status: "waiting"
      })
      .select("id")
      .single<{ id: string }>();

    if (sessionError || !createdSession?.id) {
      return NextResponse.json({ ok: false, error: "session_create_failed" }, { status: 500 });
    }

    sessionId = createdSession.id;
    await auth.admin.from("child_game_session_players").upsert(
      {
        session_id: sessionId,
        child_profile_id: ownProfile.id,
        status: "accepted",
        joined_at: new Date().toISOString()
      },
      { onConflict: "session_id,child_profile_id" }
    );
  }

  const invited: Array<{ code: string; name: string }> = [];
  for (const code of normalizedFriendCodes) {
    const friendProfile = await resolveProfileByPublicCode(auth.admin, code);
    if (!friendProfile?.id) {
      continue;
    }

    if (friendProfile.id === ownProfile.id) {
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

    const nowIso = new Date().toISOString();
    const { error: upsertPlayerError } = await auth.admin.from("child_game_session_players").upsert(
      {
        session_id: sessionId,
        child_profile_id: friendProfile.id,
        status: "invited",
        joined_at: null,
        created_at: nowIso
      },
      { onConflict: "session_id,child_profile_id" }
    );

    if (!upsertPlayerError) {
      invited.push({
        code: getPublicCode(friendProfile),
        name: friendProfile.child_name
      });
    }
  }

  if (invited.length === 0 && !leaderOpenSession?.id) {
    await auth.admin.from("child_game_sessions").delete().eq("id", sessionId);
    return NextResponse.json({ ok: false, error: "no_valid_friends" }, { status: 400 });
  }

  const session = await getSession(auth.admin, sessionId);
  return NextResponse.json({
    ok: true,
    session,
    invited
  });
}
