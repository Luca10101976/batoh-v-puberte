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
};

type LeaderboardScope = "friends" | "city";

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function scoreRowsByProfile(rows: ChildProgressRow[]) {
  const map = new Map<string, Set<string>>();

  rows.forEach((row) => {
    const code = normalizeCode(row.profile_code);
    if (!map.has(code)) {
      map.set(code, new Set<string>());
    }
    map.get(code)?.add(row.location_id);
  });

  return map;
}

function cityAlias(name: string, profileCode: string) {
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
    city?: string;
    limit?: number;
  };
  const scope = body.scope;
  const requestedCode = normalizeCode(body.profileCode ?? "");
  const city = (body.city ?? "").trim();
  const limit = Math.min(50, Math.max(5, Number(body.limit) || 20));

  if (!scope || (scope !== "friends" && scope !== "city")) {
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

    const { data: progressRows } = await admin
      .from("child_location_progress")
      .select("profile_code, location_id")
      .in("profile_code", profileCodes);

    const scoreMap = scoreRowsByProfile((progressRows as ChildProgressRow[] | null) ?? []);

    const entries = typedProfiles
      .map((profile) => {
        const completed = scoreMap.get(normalizeCode(profile.profile_code))?.size ?? 0;
        return {
          name: profile.child_name,
          score: completed * 120,
          completed,
          isYou: profile.id === ownChildProfile.id
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return NextResponse.json({ ok: true, entries });
  }

  const cityLocationIds = locations.filter((location) => location.city === city).map((location) => location.id);

  if (cityLocationIds.length === 0) {
    return NextResponse.json({ ok: true, entries: [] });
  }

  const { data: progressRows } = await admin
    .from("child_location_progress")
    .select("profile_code, location_id")
    .in("location_id", cityLocationIds);

  const scoredByProfile = scoreRowsByProfile((progressRows as ChildProgressRow[] | null) ?? []);

  const topCodes = Array.from(scoredByProfile.entries())
    .map(([profileCode, completedLocations]) => ({
      profileCode,
      completed: completedLocations.size,
      score: completedLocations.size * 120
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
        name: cityAlias(profile.child_name, profile.profile_code),
        score: entry.score,
        completed: entry.completed,
        isYou: normalizeCode(profile.profile_code) === normalizeCode(ownChildProfile.profile_code)
      };
    })
    .filter((entry): entry is { name: string; score: number; completed: number; isYou: boolean } => !!entry);

  return NextResponse.json({ ok: true, entries });
}
