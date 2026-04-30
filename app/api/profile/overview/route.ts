import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import { getAuthenticatedUser, getOwnedChildProfile, getOwnedChildProfiles, normalizeCode } from "@/app/api/expeditions/_shared";

type OutgoingFriendshipRow = {
  friend_child_profile_id: string;
  friend_profile_code: string;
  friend_display_name: string;
  created_at: string;
};

type IncomingFriendshipRow = {
  child_profile_id: string;
  created_at: string;
};

type ChildProfileBasicRow = {
  id: string;
  child_name: string;
  child_age?: number | null;
  profile_code: string;
  player_code?: string | null;
  avatar?: string | null;
  avatar_config?: Record<string, unknown> | null;
  pin_hash?: string | null;
};

type MembershipRow = {
  session_id: string;
  status: "invited" | "accepted" | "declined" | "removed";
  created_at: string;
};

type SessionRow = {
  id: string;
  leader_child_profile_id: string;
  mission_id: string | null;
  status: "waiting" | "active" | "finished" | "cancelled";
  started_at: string | null;
  created_at: string;
};

type SessionPlayerRow = {
  child_profile_id: string;
  status: "invited" | "accepted" | "declined" | "removed";
  joined_at: string | null;
  created_at: string;
};

function jsonNoStore(body: unknown, init?: number | ResponseInit) {
  if (typeof init === "number") {
    return NextResponse.json(body, {
      status: init,
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  }

  return NextResponse.json(body, {
    ...(init ?? {}),
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init && "headers" in init ? (init.headers as HeadersInit) : {})
    }
  });
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ("error" in auth) {
    return jsonNoStore({ ok: false, error: auth.error }, auth.error === "unauthorized" ? 401 : 500);
  }

  const rateLimitResult = await checkRateLimit({
    action: "profile_overview",
    ip: getRequestIpAddress(request),
    userId: auth.user.id,
    limit: 90,
    windowMinutes: 15,
    blockMinutes: 5
  });

  if (!rateLimitResult.allowed) {
    return jsonNoStore(
      { ok: false, error: "rate_limited", retry_after: rateLimitResult.retryAfterSeconds ?? 60 },
      429
    );
  }

  const ownProfile = await getOwnedChildProfile(auth.admin, auth.user.id);
  if (!ownProfile?.id) {
    return jsonNoStore({ ok: false, error: "missing_own_profile" }, 403);
  }

  const ownProfiles = await getOwnedChildProfiles(auth.admin, auth.user.id);
  const ownProfileIds = ownProfiles.map((profile) => profile.id);
  const ownPublicCodes = new Set(ownProfiles.map((profile) => normalizeCode(profile.player_code || profile.profile_code)));
  const { data: canonicalProfileData } = await auth.admin
    .from("child_profiles")
    .select("id, child_name, child_age, profile_code, player_code, avatar, avatar_config, pin_hash")
    .eq("id", ownProfile.id)
    .limit(1)
    .maybeSingle();

  const canonicalProfile = (canonicalProfileData as ChildProfileBasicRow | null) ?? null;

  const [{ data: outgoingRows }, { data: incomingRows }, { data: membershipsData }] = await Promise.all([
    auth.admin
      .from("child_friendships")
      .select("friend_child_profile_id, friend_profile_code, friend_display_name, created_at")
      .in("child_profile_id", ownProfileIds),
    auth.admin
      .from("child_friendships")
      .select("child_profile_id, created_at")
      .in("friend_child_profile_id", ownProfileIds),
    auth.admin
      .from("child_game_session_players")
      .select("session_id, status, created_at")
      .in("child_profile_id", ownProfileIds)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  const outgoing = (outgoingRows as OutgoingFriendshipRow[] | null) ?? [];
  const incoming = (incomingRows as IncomingFriendshipRow[] | null) ?? [];
  const memberships = (membershipsData as MembershipRow[] | null) ?? [];

  const incomingIds = Array.from(new Set(incoming.map((row) => row.child_profile_id)));
  const [incomingProfilesResponse, sessionResponse] = await Promise.all([
    incomingIds.length > 0
      ? auth.admin.from("child_profiles").select("id, child_name, profile_code, player_code").in("id", incomingIds)
      : Promise.resolve({ data: [] as ChildProfileBasicRow[] }),
    memberships.length > 0
      ? auth.admin
          .from("child_game_sessions")
          .select("id, leader_child_profile_id, mission_id, status, started_at, created_at")
          .in(
            "id",
            memberships.map((row) => row.session_id)
          )
          .in("status", ["waiting", "active"])
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as SessionRow[] })
  ]);

  const incomingProfilesById = new Map(
    (((incomingProfilesResponse.data as ChildProfileBasicRow[] | null) ?? []).map((row) => [row.id, row]))
  );

  const friendsByCode = new Map<string, { code: string; name: string; addedAt: string }>();

  outgoing.forEach((row) => {
    const code = normalizeCode(row.friend_profile_code);
    if (!code || ownPublicCodes.has(code)) {
      return;
    }
    const existing = friendsByCode.get(code);
    if (!existing || new Date(row.created_at).getTime() < new Date(existing.addedAt).getTime()) {
      friendsByCode.set(code, {
        code,
        name: row.friend_display_name || "Kamarád",
        addedAt: row.created_at
      });
    }
  });

  incoming.forEach((row) => {
    const profile = incomingProfilesById.get(row.child_profile_id);
    if (!profile) {
      return;
    }
    const code = normalizeCode(profile.player_code || profile.profile_code);
    if (!code || ownPublicCodes.has(code)) {
      return;
    }
    const existing = friendsByCode.get(code);
    if (!existing || new Date(row.created_at).getTime() < new Date(existing.addedAt).getTime()) {
      friendsByCode.set(code, {
        code,
        name: profile.child_name || "Kamarád",
        addedAt: row.created_at
      });
    }
  });

  const friends = Array.from(friendsByCode.values()).sort(
    (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  );

  const sessions = (sessionResponse.data as SessionRow[] | null) ?? [];
  if (sessions.length === 0) {
    return jsonNoStore({
      ok: true,
      myCode: ownProfile.player_code || ownProfile.profile_code,
      profile_id: canonicalProfile?.id ?? ownProfile.id,
      profile: canonicalProfile
        ? {
            child_name: canonicalProfile.child_name,
            child_age: canonicalProfile.child_age ?? 11,
            profile_code: canonicalProfile.profile_code,
            player_code: canonicalProfile.player_code || canonicalProfile.profile_code,
            avatar: canonicalProfile.avatar ?? "PB",
            avatar_config: canonicalProfile.avatar_config ?? null,
            has_pin: Boolean(canonicalProfile.pin_hash)
          }
        : null,
      friends,
      session: null
    });
  }

  const activeSession = sessions[0];
  const { data: playersData } = await auth.admin
    .from("child_game_session_players")
    .select("child_profile_id, status, joined_at, created_at")
    .eq("session_id", activeSession.id)
    .order("created_at", { ascending: true });

  const players = (playersData as SessionPlayerRow[] | null) ?? [];
  const playerIds = Array.from(new Set(players.map((row) => row.child_profile_id)));
  const { data: allProfilesData } = await auth.admin
    .from("child_profiles")
    .select("id, child_name, profile_code, player_code")
    .in("id", playerIds);

  const profileById = new Map(((allProfilesData as ChildProfileBasicRow[] | null) ?? []).map((profile) => [profile.id, profile]));

  const sessionPlayers = players
    .map((player) => {
      const profile = profileById.get(player.child_profile_id);
      if (!profile) {
        return null;
      }
      return {
        childProfileId: profile.id,
        name: profile.child_name,
        code: normalizeCode(profile.player_code || profile.profile_code),
        status: player.status,
        joinedAt: player.joined_at
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const myMembership = memberships.find((row) => row.session_id === activeSession.id);
  const isLeader = ownProfileIds.includes(activeSession.leader_child_profile_id);
  const leaderProfile = profileById.get(activeSession.leader_child_profile_id);

  return jsonNoStore({
    ok: true,
    myCode: ownProfile.player_code || ownProfile.profile_code,
    profile_id: canonicalProfile?.id ?? ownProfile.id,
    profile: canonicalProfile
      ? {
          child_name: canonicalProfile.child_name,
          child_age: canonicalProfile.child_age ?? 11,
          profile_code: canonicalProfile.profile_code,
          player_code: canonicalProfile.player_code || canonicalProfile.profile_code,
          avatar: canonicalProfile.avatar ?? "PB",
          avatar_config: canonicalProfile.avatar_config ?? null,
          has_pin: Boolean(canonicalProfile.pin_hash)
        }
      : null,
    friends,
    session: {
      id: activeSession.id,
      status: activeSession.status,
      missionId: activeSession.mission_id,
      startedAt: activeSession.started_at,
      isLeader,
      myStatus: myMembership?.status ?? null,
      leader: leaderProfile
        ? {
            childProfileId: leaderProfile.id,
            name: leaderProfile.child_name,
            code: normalizeCode(leaderProfile.player_code || leaderProfile.profile_code)
          }
        : null,
      players: sessionPlayers
    }
  });
}
