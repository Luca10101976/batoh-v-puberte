import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import { getAuthenticatedUser, getOwnedChildProfile, getOwnedChildProfiles } from "@/app/api/expeditions/_shared";

type InviteMembershipRow = {
  session_id: string;
  created_at: string;
};

type SessionRow = {
  id: string;
  leader_child_profile_id: string;
  mission_id: string | null;
  status: "waiting" | "active" | "finished" | "cancelled";
  created_at: string;
};

type LeaderRow = {
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
    action: "expeditions_invites_list",
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

  const { data: inviteRows } = await auth.admin
    .from("child_game_session_players")
    .select("session_id, created_at")
    .in("child_profile_id", ownProfileIds)
    .eq("status", "invited")
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = (inviteRows as InviteMembershipRow[] | null) ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, invites: [] });
  }

  const sessionIds = rows.map((row) => row.session_id);
  const { data: sessionsData } = await auth.admin
    .from("child_game_sessions")
    .select("id, leader_child_profile_id, mission_id, status, created_at")
    .in("id", sessionIds)
    .in("status", ["waiting", "active"]);

  const sessions = (sessionsData as SessionRow[] | null) ?? [];
  const sessionById = new Map(sessions.map((item) => [item.id, item]));
  const leaderIds = Array.from(new Set(sessions.map((item) => item.leader_child_profile_id)));

  let leaderById = new Map<string, LeaderRow>();
  if (leaderIds.length > 0) {
    const { data: leadersData } = await auth.admin
      .from("child_profiles")
      .select("id, child_name, profile_code, player_code")
      .in("id", leaderIds);

    leaderById = new Map(((leadersData as LeaderRow[] | null) ?? []).map((row) => [row.id, row]));
  }

  const invites = rows
    .map((row) => {
      const session = sessionById.get(row.session_id);
      if (!session) {
        return null;
      }
      const leader = leaderById.get(session.leader_child_profile_id);
      if (!leader) {
        return null;
      }
      return {
        sessionId: session.id,
        invitedAt: row.created_at,
        missionId: session.mission_id,
        leader: {
          name: leader.child_name,
          code: (leader.player_code || leader.profile_code).trim().toUpperCase()
        }
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return NextResponse.json({ ok: true, invites });
}
