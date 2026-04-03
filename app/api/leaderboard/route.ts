import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { locations } from "@/lib/mock-data";

type ChildProfileRow = {
  id: string;
  child_name: string;
  profile_code: string;
};

type ChildFriendshipRow = {
  child_profile_id: string;
  friend_child_profile_id: string;
};

type ChildProgressRow = {
  profile_code: string;
  location_id: string;
  penalty_points?: number | null;
};

type LeaderboardScope = "friends" | "global";

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function scoreRowsByProfile(rows: ChildProgressRow[]) {
  const map = new Map<string, { locations: Set<string>; score: number }>();

  rows.forEach((row) => {
    const code = normalizeCode(row.profile_code);
    if (!map.has(code)) {
      map.set(code, { locations: new Set<string>(), score: 0 });
    }

    const entry = map.get(code);
    if (!entry) {
      return;
    }
    if (entry.locations.has(row.location_id)) {
      return;
    }

    entry.locations.add(row.location_id);
    const penaltyPoints = Math.max(0, Number(row.penalty_points) || 0);
    entry.score += Math.max(0, 120 - penaltyPoints);
  });

  return map;
}

function publicAlias(name: string, profileCode: string) {
  const cleanName = (name || "Hráč").trim();
  const firstWord = cleanName.split(/\s+/)[0] || "Hráč";
  const suffix = normalizeCode(profileCode).slice(-2) || "XX";
  return `${firstWord} #${suffix}`;
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

  const body = (await request.json()) as {
    scope?: LeaderboardScope;
    profileCode?: string;
    limit?: number;
  };
  const scope = body.scope;
  const requestedCode = normalizeCode(body.profileCode ?? "");
  const limit = Math.min(50, Math.max(5, Number(body.limit) || 20));

  if (!scope || (scope !== "friends" && scope !== "global")) {
    return NextResponse.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  }

  if (!requestedCode || requestedCode.length < 4) {
    return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: ownChildProfile } = await admin
    .from("child_profiles")
    .select("id, child_name, profile_code")
    .eq("parent_user_id", user.id)
    .eq("profile_code", requestedCode)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!ownChildProfile?.id) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
  }

  if (scope === "friends") {
    const [{ data: outgoing }, { data: incoming }] = await Promise.all([
      admin
        .from("child_friendships")
        .select("child_profile_id, friend_child_profile_id")
        .eq("child_profile_id", ownChildProfile.id),
      admin
        .from("child_friendships")
        .select("child_profile_id, friend_child_profile_id")
        .eq("friend_child_profile_id", ownChildProfile.id)
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
      .select("id, child_name, profile_code")
      .in("id", memberIdList);

    const typedProfiles = (profiles as ChildProfileRow[] | null) ?? [];
    const profileCodes = typedProfiles.map((profile) => profile.profile_code);

    let progressRows: ChildProgressRow[] = [];
    const { data: progressRowsWithPenalty, error: progressRowsWithPenaltyError } = await admin
      .from("child_location_progress")
      .select("profile_code, location_id, penalty_points")
      .in("profile_code", profileCodes);
    if (progressRowsWithPenaltyError?.code === "42703") {
      const { data: progressRowsLegacy } = await admin
        .from("child_location_progress")
        .select("profile_code, location_id")
        .in("profile_code", profileCodes);
      progressRows = (progressRowsLegacy as ChildProgressRow[] | null) ?? [];
    } else {
      progressRows = (progressRowsWithPenalty as ChildProgressRow[] | null) ?? [];
    }

    const scoreMap = scoreRowsByProfile(progressRows);

    const entries = typedProfiles
      .map((profile) => {
        const stats = scoreMap.get(normalizeCode(profile.profile_code));
        const completed = stats?.locations.size ?? 0;
        return {
          name: profile.child_name,
          score: stats?.score ?? 0,
          completed,
          isYou: profile.id === ownChildProfile.id
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return NextResponse.json({ ok: true, entries });
  }

  const allLocationIds = locations.map((location) => location.id);

  let progressRows: ChildProgressRow[] = [];
  const { data: progressRowsWithPenalty, error: progressRowsWithPenaltyError } = await admin
    .from("child_location_progress")
    .select("profile_code, location_id, penalty_points")
    .in("location_id", allLocationIds);
  if (progressRowsWithPenaltyError?.code === "42703") {
    const { data: progressRowsLegacy } = await admin
      .from("child_location_progress")
      .select("profile_code, location_id")
      .in("location_id", allLocationIds);
    progressRows = (progressRowsLegacy as ChildProgressRow[] | null) ?? [];
  } else {
    progressRows = (progressRowsWithPenalty as ChildProgressRow[] | null) ?? [];
  }

  const scoredByProfile = scoreRowsByProfile(progressRows);

  const topCodes = Array.from(scoredByProfile.entries())
    .map(([profileCode, stats]) => ({
      profileCode,
      completed: stats.locations.size,
      score: stats.score
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (topCodes.length === 0) {
    return NextResponse.json({ ok: true, entries: [] });
  }

  const topCodeList = topCodes.map((entry) => entry.profileCode);
  const { data: profiles } = await admin
    .from("child_profiles")
    .select("id, child_name, profile_code")
    .in("profile_code", topCodeList);

  const profileByCode = new Map<string, ChildProfileRow>();
  ((profiles as ChildProfileRow[] | null) ?? []).forEach((profile) => {
    profileByCode.set(normalizeCode(profile.profile_code), profile);
  });

  const entries = topCodes
    .map((entry) => {
      const profile = profileByCode.get(normalizeCode(entry.profileCode));
      if (!profile) {
        return null;
      }
      return {
        name: publicAlias(profile.child_name, profile.profile_code),
        score: entry.score,
        completed: entry.completed,
        isYou: normalizeCode(profile.profile_code) === normalizeCode(ownChildProfile.profile_code)
      };
    })
    .filter((entry): entry is { name: string; score: number; completed: number; isYou: boolean } => !!entry);

  return NextResponse.json({ ok: true, entries });
}
