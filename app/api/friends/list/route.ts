import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";

type OwnProfileRow = {
  id: string;
  profile_code: string;
  player_code?: string | null;
};

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

type ChildProfileRow = {
  id: string;
  child_name: string;
  profile_code: string;
  player_code?: string | null;
};

type OwnProfileWithCreatedAt = OwnProfileRow & {
  created_at?: string | null;
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

export async function GET(request: NextRequest) {
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
    action: "friends_list",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 60,
    windowMinutes: 15,
    blockMinutes: 5
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

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: ownProfilesData } = await admin
    .from("child_profiles")
    .select("id, profile_code, player_code, created_at")
    .eq("parent_user_id", user.id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  const ownProfiles = (ownProfilesData as OwnProfileWithCreatedAt[] | null) ?? [];
  const ownProfile = ownProfiles[0] ?? null;
  const ownProfileIds = ownProfiles.map((profile) => profile.id);
  const ownPublicCodes = new Set(
    ownProfiles.map((profile) => normalizeCode(profile.player_code || profile.profile_code)).filter(Boolean)
  );

  if (!ownProfile?.id) {
    return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
  }

  const [{ data: outgoingRows }, { data: incomingRows }] = await Promise.all([
    admin
      .from("child_friendships")
      .select("friend_child_profile_id, friend_profile_code, friend_display_name, created_at")
      .in("child_profile_id", ownProfileIds),
    admin
      .from("child_friendships")
      .select("child_profile_id, created_at")
      .in("friend_child_profile_id", ownProfileIds)
  ]);

  const outgoing = (outgoingRows as OutgoingFriendshipRow[] | null) ?? [];
  const incoming = (incomingRows as IncomingFriendshipRow[] | null) ?? [];
  const incomingIds = incoming.map((row) => row.child_profile_id);

  let incomingProfilesById = new Map<string, ChildProfileRow>();
  if (incomingIds.length > 0) {
    const { data } = await admin
      .from("child_profiles")
      .select("id, child_name, profile_code, player_code")
      .in("id", incomingIds);
    incomingProfilesById = new Map(((data as ChildProfileRow[] | null) ?? []).map((row) => [row.id, row]));
  }

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

  return NextResponse.json({
    ok: true,
    myCode: ownProfile.player_code || ownProfile.profile_code,
    friends
  });
}
