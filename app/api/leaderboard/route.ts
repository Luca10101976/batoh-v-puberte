import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import { locations } from "@/lib/mock-data";
import { scoreRowsByProfile, type LeaderboardProgressRow } from "@/lib/leaderboard-scoring";

type ChildProfileRow = {
  id: string;
  parent_user_id?: string | null;
  child_name: string;
  profile_code: string;
  player_code?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ChildFriendshipRow = {
  child_profile_id: string;
  friend_child_profile_id: string;
};

type ChildProgressRow = {
  profile_code: string;
  location_id: string;
  penalty_points?: number | null;
  best_score?: number | null;
  first_completed_at?: string | null;
  completed_at?: string | null;
  status?: "in_progress" | "completed" | null;
};

type LeaderboardScope = "friends" | "global";

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function publicAlias(name: string) {
  const cleanName = (name || "Hráč").trim();
  const firstWord = cleanName.split(/\s+/)[0] || "Hráč";
  return firstWord;
}

function toTimestamp(value?: string | null) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function canonicalizeProfiles(rows: ChildProfileRow[]) {
  const byParent = new Map<string, ChildProfileRow>();
  const withoutParent: ChildProfileRow[] = [];

  rows.forEach((row) => {
    const parentId = row.parent_user_id?.trim();
    if (!parentId) {
      withoutParent.push(row);
      return;
    }

    const existing = byParent.get(parentId);
    if (!existing) {
      byParent.set(parentId, row);
      return;
    }

    // Kanonický profil = nejstarší řádek (stejné pravidlo jako login a pin/verify).
    const existingTs = toTimestamp(existing.created_at);
    const rowTs = toTimestamp(row.created_at);
    if (rowTs < existingTs || (rowTs === existingTs && row.id < existing.id)) {
      byParent.set(parentId, row);
    }
  });

  return [...byParent.values(), ...withoutParent];
}

function findOwnCanonicalProfile(
  rows: ChildProfileRow[],
  requestedCode: string
): ChildProfileRow | null {
  if (rows.length === 0) {
    return null;
  }

  const canonicalRows = canonicalizeProfiles(rows);
  const req = normalizeCode(requestedCode);

  const byPlayerCode = canonicalRows.find(
    (row) => normalizeCode(row.player_code ?? "") === req
  );
  if (byPlayerCode) {
    return byPlayerCode;
  }

  // Legacy compatibility path (A2): fallback to old profile_code until A3 cleanup.
  const byProfileCode = canonicalRows.find(
    (row) => normalizeCode(row.profile_code) === req
  );
  if (byProfileCode) {
    return byProfileCode;
  }

  return canonicalRows[0] ?? null;
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

  const rateLimitResult = await checkRateLimit({
    action: "leaderboard",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 120,
    windowMinutes: 60,
    blockMinutes: 15
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        retry_after: rateLimitResult.retryAfterSeconds ?? 60
      },
      { status: 429 }
    );
  }

  const body = (await request.json()) as {
    scope?: LeaderboardScope;
    playerCode?: string;
    profileCode?: string;
    limit?: number;
  };
  const scope = body.scope;
  const requestedCode = normalizeCode(body.playerCode ?? body.profileCode ?? "");
  const limit = Math.min(20, Math.max(5, Number(body.limit) || 20));

  if (!scope || (scope !== "friends" && scope !== "global")) {
    return NextResponse.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  }

  if (!requestedCode || requestedCode.length < 4) {
    return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: ownProfileRows } = await admin
    .from("child_profiles")
    .select("id, parent_user_id, child_name, profile_code, player_code, created_at, updated_at")
    .eq("parent_user_id", user.id);

  const ownChildProfile = findOwnCanonicalProfile(
    (ownProfileRows as ChildProfileRow[] | null) ?? [],
    requestedCode
  );
  const ownProfilesAll = canonicalizeProfiles((ownProfileRows as ChildProfileRow[] | null) ?? []);
  const ownProfileIds = new Set(ownProfilesAll.map((profile) => profile.id));

  if (!ownChildProfile?.id) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
  }
  const ownParentUserId = ownChildProfile.parent_user_id ?? null;

  if (scope === "friends") {
    const [{ data: outgoing }, { data: incoming }] = await Promise.all([
      admin
        .from("child_friendships")
        .select("child_profile_id, friend_child_profile_id")
        .in("child_profile_id", Array.from(ownProfileIds)),
      admin
        .from("child_friendships")
        .select("child_profile_id, friend_child_profile_id")
        .in("friend_child_profile_id", Array.from(ownProfileIds))
    ]);

    const links = [
      ...((outgoing as ChildFriendshipRow[] | null) ?? []),
      ...((incoming as ChildFriendshipRow[] | null) ?? [])
    ];

    const memberIds = new Set<string>([ownChildProfile.id]);
    links.forEach((link) => {
      memberIds.add(link.child_profile_id);
      memberIds.add(link.friend_child_profile_id);
    });

    const memberIdList = Array.from(memberIds);

    const { data: profiles } = await admin
      .from("child_profiles")
      .select("id, parent_user_id, child_name, profile_code, player_code, created_at, updated_at")
      .in("id", memberIdList);

    const typedProfiles = canonicalizeProfiles((profiles as ChildProfileRow[] | null) ?? []);
    const profileCodes = typedProfiles.map((profile) => profile.profile_code);

    let progressRows: ChildProgressRow[] = [];
    const { data: progressRowsWithPenalty, error: progressRowsWithPenaltyError } = await admin
      .from("child_location_progress")
      .select("profile_code, location_id, penalty_points, best_score, first_completed_at, completed_at, status")
      .in("profile_code", profileCodes);
    if (progressRowsWithPenaltyError?.code === "42703") {
      const { data: progressRowsLegacy } = await admin
        .from("child_location_progress")
        .select("profile_code, location_id, penalty_points, best_score, first_completed_at, completed_at, status")
        .in("profile_code", profileCodes);
      progressRows = (progressRowsLegacy as ChildProgressRow[] | null) ?? [];
    } else {
      progressRows = (progressRowsWithPenalty as ChildProgressRow[] | null) ?? [];
    }

    const scoreMap = scoreRowsByProfile(progressRows as LeaderboardProgressRow[]);

    const entries = typedProfiles
      .map((profile) => {
        const stats = scoreMap.get(normalizeCode(profile.profile_code));
        const completed = stats?.locations.size ?? 0;
        const isYou =
          ownProfileIds.has(profile.id) ||
          (ownParentUserId && profile.parent_user_id && profile.parent_user_id === ownParentUserId);
        return {
          name: profile.child_name,
          score: stats?.score ?? 0,
          completed,
          isYou
        };
      })
      .filter((entry) => !entry.isYou)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return NextResponse.json({ ok: true, entries });
  }

  const allLocationIds = locations.map((location) => location.id);

  const { data: allProfiles } = await admin
    .from("child_profiles")
    .select("id, parent_user_id, child_name, profile_code, player_code, created_at, updated_at");
  const typedAllProfiles = canonicalizeProfiles((allProfiles as ChildProfileRow[] | null) ?? []);

  if (typedAllProfiles.length === 0) {
    return NextResponse.json({ ok: true, entries: [] });
  }

  let progressRows: ChildProgressRow[] = [];
  const { data: progressRowsWithPenalty, error: progressRowsWithPenaltyError } = await admin
    .from("child_location_progress")
    .select("profile_code, location_id, penalty_points, best_score, first_completed_at, completed_at, status")
    .in("location_id", allLocationIds);
  if (progressRowsWithPenaltyError?.code === "42703") {
    const { data: progressRowsLegacy } = await admin
      .from("child_location_progress")
      .select("profile_code, location_id, penalty_points, best_score, first_completed_at, completed_at, status")
      .in("location_id", allLocationIds);
    progressRows = (progressRowsLegacy as ChildProgressRow[] | null) ?? [];
  } else {
    progressRows = (progressRowsWithPenalty as ChildProgressRow[] | null) ?? [];
  }

  const scoredByProfile = scoreRowsByProfile(progressRows as LeaderboardProgressRow[]);

  const entries = typedAllProfiles
    .map((profile) => {
      const stats = scoredByProfile.get(normalizeCode(profile.profile_code));
      return {
        name: publicAlias(profile.child_name),
        score: stats?.score ?? 0,
        completed: stats?.locations.size ?? 0,
        isYou: normalizeCode(profile.profile_code) === normalizeCode(ownChildProfile.profile_code)
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return NextResponse.json({ ok: true, entries });
}
