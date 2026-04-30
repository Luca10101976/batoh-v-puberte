import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export type ChildProfileRow = {
  id: string;
  child_name: string;
  profile_code: string;
  player_code?: string | null;
  parent_user_id: string;
};

export type SessionRow = {
  id: string;
  leader_child_profile_id: string;
  mission_id: string | null;
  status: "waiting" | "active" | "finished" | "cancelled";
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type SessionPlayerRow = {
  id: string;
  session_id: string;
  child_profile_id: string;
  status: "invited" | "accepted" | "declined" | "removed";
  joined_at: string | null;
  created_at: string;
};

export function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

export function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey };
}

export async function getAuthenticatedUser(request: NextRequest) {
  const env = getSupabaseEnv();
  if (!env) {
    return { error: "missing_supabase_env" as const };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return { error: "unauthorized" as const };
  }

  const authClient = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
  const {
    data: { user },
    error
  } = await authClient.auth.getUser(accessToken);

  if (error || !user) {
    return { error: "unauthorized" as const };
  }

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false } });
  return { env, user, admin };
}

export async function getOwnedChildProfile(
  admin: any,
  userId: string,
  requestedCode?: string
) {
  const { data: ownProfilesData } = await admin
    .from("child_profiles")
    .select("id, child_name, profile_code, player_code, parent_user_id, created_at")
    .eq("parent_user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  const ownProfiles = ((ownProfilesData as Array<ChildProfileRow & { created_at?: string }> | null) ?? []).map(
    ({ created_at: _createdAt, ...profile }) => profile
  );

  if (ownProfiles.length === 0) {
    return null;
  }

  // Canonical profile for this user is the oldest profile row (stable with child-profile/me API).
  const canonicalProfile = ownProfiles[0];
  const normalized = normalizeCode(requestedCode ?? "");

  if (normalized) {
    const matched = ownProfiles.find(
      (profile) =>
        normalizeCode(profile.player_code ?? "") === normalized ||
        // Legacy compatibility path (A2): fallback to old profile_code until A3 cleanup.
        normalizeCode(profile.profile_code) === normalized
    );
    if (matched) {
      return matched;
    }
  }

  return canonicalProfile;
}

export async function getOwnedChildProfiles(admin: any, userId: string): Promise<ChildProfileRow[]> {
  const { data } = await admin
    .from("child_profiles")
    .select("id, child_name, profile_code, player_code, parent_user_id, created_at")
    .eq("parent_user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  return (((data as Array<ChildProfileRow & { created_at?: string }> | null) ?? []).map(
    ({ created_at: _createdAt, ...profile }) => profile
  ) as ChildProfileRow[]);
}

export async function resolveProfileByPublicCode(
  admin: any,
  publicCode: string
) {
  const normalized = normalizeCode(publicCode);
  if (!normalized) {
    return null;
  }

  const { data: byPlayerCode } = await admin
    .from("child_profiles")
    .select("id, child_name, profile_code, player_code, parent_user_id")
    .eq("player_code", normalized)
    .limit(1)
    .maybeSingle();

  if (byPlayerCode?.id) {
    return byPlayerCode;
  }

  // Legacy compatibility path (A2): fallback to old profile_code until A3 cleanup.
  const { data: byProfileCode } = await admin
    .from("child_profiles")
    .select("id, child_name, profile_code, player_code, parent_user_id")
    .eq("profile_code", normalized)
    .limit(1)
    .maybeSingle();

  return byProfileCode ?? null;
}

export function getPublicCode(profile: Pick<ChildProfileRow, "player_code" | "profile_code">) {
  return normalizeCode(profile.player_code || profile.profile_code);
}

export async function areFriends(
  admin: any,
  ownChildProfileId: string,
  targetChildProfileId: string
) {
  const { data } = await admin
    .from("child_friendships")
    .select("child_profile_id")
    .eq("child_profile_id", ownChildProfileId)
    .eq("friend_child_profile_id", targetChildProfileId)
    .limit(1)
    .maybeSingle();

  return Boolean(data?.child_profile_id);
}

export async function areFriendsAcrossOwnProfiles(
  admin: any,
  ownChildProfileIds: string[],
  targetChildProfileId: string
) {
  const uniqueOwnIds = Array.from(new Set(ownChildProfileIds.filter(Boolean)));
  if (uniqueOwnIds.length === 0) {
    return false;
  }

  const { data } = await admin
    .from("child_friendships")
    .select("child_profile_id")
    .in("child_profile_id", uniqueOwnIds)
    .eq("friend_child_profile_id", targetChildProfileId)
    .limit(1)
    .maybeSingle();

  return Boolean(data?.child_profile_id);
}

export async function getSession(admin: any, sessionId: string) {
  const { data } = await admin
    .from("child_game_sessions")
    .select("id, leader_child_profile_id, mission_id, status, started_at, finished_at, created_at")
    .eq("id", sessionId)
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

export async function getSessionMembership(
  admin: any,
  sessionId: string,
  childProfileId: string
) {
  const { data } = await admin
    .from("child_game_session_players")
    .select("id, session_id, child_profile_id, status, joined_at, created_at")
    .eq("session_id", sessionId)
    .eq("child_profile_id", childProfileId)
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

export async function getSessionMembershipForAny(
  admin: any,
  sessionId: string,
  childProfileIds: string[]
) {
  const uniqueIds = Array.from(new Set(childProfileIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return null;
  }

  const { data } = await admin
    .from("child_game_session_players")
    .select("id, session_id, child_profile_id, status, joined_at, created_at")
    .eq("session_id", sessionId)
    .in("child_profile_id", uniqueIds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}
