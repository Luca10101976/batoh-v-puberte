import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import { getAuthenticatedUser, getOwnedChildProfile, getOwnedChildProfiles } from "@/app/api/expeditions/_shared";

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

type ProfileRow = {
  id: string;
  child_name: string;
  profile_code: string;
  player_code?: string | null;
};

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.error === "unauthorized" ? 401 : 500 });
  }

  const rateLimitResult = await checkRateLimit({
    action: "expeditions_active",
    ip: getRequestIpAddress(request),
    userId: auth.user.id,
    limit: 120,
    windowMinutes: 60,
    blockMinutes: 10
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after: rateLimitResult.retryAfterSeconds ?? 60 },
      { status: 429 }
    );
  }

  const ownProfile = await getOwnedChildProfile(auth.admin, auth.user.id);
  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
  }
  const ownProfiles = await getOwnedChildProfiles(auth.admin, auth.user.id);
  const ownProfileIds = ownProfiles.map((profile) => profile.id);

  const { data: memberships } = await auth.admin
    .from("child_game_session_players")
    .select("session_id, status, created_at")
    .in("child_profile_id", ownProfileIds)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(10);

  const membershipRows = (memberships as MembershipRow[] | null) ?? [];
  if (membershipRows.length === 0) {
    return NextResponse.json({ ok: true, session: null });
  }

  const sessionIds = membershipRows.map((row) => row.session_id);
  const { data: sessionsData } = await auth.admin
    .from("child_game_sessions")
    .select("id, leader_child_profile_id, mission_id, status, started_at, created_at")
    .in("id", sessionIds)
    .in("status", ["waiting", "active"])
    .order("created_at", { ascending: false })
    .limit(10);

  const sessions = (sessionsData as SessionRow[] | null) ?? [];
  if (sessions.length === 0) {
    return NextResponse.json({ ok: true, session: null });
  }

  const activeSession = sessions[0];
  const { data: playersData } = await auth.admin
    .from("child_game_session_players")
    .select("child_profile_id, status, joined_at, created_at")
    .eq("session_id", activeSession.id)
    .order("created_at", { ascending: true });

  const players = (playersData as SessionPlayerRow[] | null) ?? [];
  const playerIds = Array.from(new Set(players.map((row) => row.child_profile_id)));

  const { data: profilesData } = await auth.admin
    .from("child_profiles")
    .select("id, child_name, profile_code, player_code")
    .in("id", playerIds);

  const profileById = new Map(((profilesData as ProfileRow[] | null) ?? []).map((profile) => [profile.id, profile]));

  const sessionPlayers = players
    .map((player) => {
      const profile = profileById.get(player.child_profile_id);
      if (!profile) {
        return null;
      }
      return {
        childProfileId: profile.id,
        name: profile.child_name,
        code: (profile.player_code || profile.profile_code).trim().toUpperCase(),
        status: player.status,
        joinedAt: player.joined_at
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const myMembership = membershipRows.find((row) => row.session_id === activeSession.id);
  const isLeader = ownProfileIds.includes(activeSession.leader_child_profile_id);
  const leaderProfile = profileById.get(activeSession.leader_child_profile_id);

  return NextResponse.json({
    ok: true,
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
            code: (leaderProfile.player_code || leaderProfile.profile_code).trim().toUpperCase()
          }
        : null,
      players: sessionPlayers
    }
  });
}
