import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimitSafe, getRequestIpAddress } from "@/lib/rate-limit";
import {
  buildLeaderboard,
  totalsByProfile,
  type LeaderboardPlayer,
  type LeaderboardProgressRow
} from "@/lib/leaderboard-model";
import { loadPublishedGameScores } from "@/lib/leaderboard-server";

// R33: žebříček je odvozený, ne uložený.
//
// Skóre vzniká vždy znovu ze serverově zapsaných výsledků v child_location_progress
// (R23/R26 – klient do té tabulky nesmí zapisovat). Žádná paralelní tabulka
// žebříčku neexistuje, takže nemůže vzniknout druhá pravda o bodech.
//
// Pravidla: součet nejlepších výsledků z dokončených PUBLIKOVANÝCH her, každá hra
// jednou, shodné skóre = shodné pořadí, hráč bez bodu není v pořadí, testovací
// profil se nezapočítá. Vlastní řádek se vrací vždy – i mimo TOP 20 a i s nulou.

type ChildProfileRow = {
  id: string;
  parent_user_id?: string | null;
  child_name: string;
  profile_code: string;
  player_code?: string | null;
  avatar?: string | null;
  excluded_from_leaderboard?: boolean | null;
};

type ChildFriendshipRow = {
  child_profile_id: string;
  friend_child_profile_id: string;
};

type LeaderboardScope = "friends" | "global";

const PROFILE_COLUMNS = "id, parent_user_id, child_name, profile_code, player_code, avatar, excluded_from_leaderboard";
const PROFILE_COLUMNS_LEGACY = "id, parent_user_id, child_name, profile_code, player_code, avatar";

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function toPlayer(row: ChildProfileRow, isYou: boolean): LeaderboardPlayer {
  return {
    profileCode: normalizeCode(row.profile_code),
    // R33: veřejná identita je hráčská přezdívka. Nezkracuje se – přezdívka není
    // skutečné jméno a hráč ji volí s vědomím, že ji uvidí i cizí lidé.
    nickname: (row.child_name || "Hráč").trim() || "Hráč",
    avatar: row.avatar ?? null,
    excluded: row.excluded_from_leaderboard === true,
    isYou
  };
}

/**
 * Načte profily i na databázi, která ještě nemá sloupec pro vyřazení z pořadí
 * (mezistav při nasazení migrace).
 */
async function selectProfiles(admin: any, apply: (query: any) => any) {
  const modern = await apply(admin.from("child_profiles").select(PROFILE_COLUMNS));
  if (!modern.error) {
    return (modern.data as ChildProfileRow[] | null) ?? [];
  }
  if (modern.error.code !== "42703") {
    throw new Error(`profiles_failed: ${modern.error.message}`);
  }
  const legacy = await apply(admin.from("child_profiles").select(PROFILE_COLUMNS_LEGACY));
  if (legacy.error) {
    throw new Error(`profiles_failed: ${legacy.error.message}`);
  }
  return (legacy.data as ChildProfileRow[] | null) ?? [];
}

/**
 * Vlastní profil se hledá jen mezi profily přihlášeného účtu. Když poslaný kód
 * neodpovídá žádnému z nich, nesmí se tiše vybrat jiný profil – dřív se vracel
 * první nalezený, takže hráč mohl dostat žebříček označený cizím řádkem.
 */
function findOwnProfile(rows: ChildProfileRow[], requestedCode: string) {
  const requested = normalizeCode(requestedCode);
  const byPlayerCode = rows.find((row) => normalizeCode(row.player_code ?? "") === requested);
  if (byPlayerCode) {
    return byPlayerCode;
  }
  const byProfileCode = rows.find((row) => normalizeCode(row.profile_code) === requested);
  if (byProfileCode) {
    return byProfileCode;
  }
  // Jediný profil účtu je jednoznačný a je vlastní; víc profilů bez shody kódu
  // je nejasný stav a request se odmítne.
  return rows.length === 1 ? rows[0] : null;
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: "missing_supabase_env" }, { status: 500 });
  }

  // R33/13: žebříček je jen pro přihlášeného hráče. Bez platného tokenu se
  // nevrací žádný seznam hráčů.
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

  const rateLimitResult = await checkRateLimitSafe({
    action: "leaderboard",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 120,
    windowMinutes: 60,
    blockMinutes: 15
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after: rateLimitResult.retryAfterSeconds ?? 60 },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    scope?: LeaderboardScope;
    playerCode?: string;
    profileCode?: string;
    limit?: number;
  } | null;

  const scope = body?.scope;
  const requestedCode = normalizeCode(body?.playerCode ?? body?.profileCode ?? "");
  const limit = Math.min(20, Math.max(5, Number(body?.limit) || 20));

  if (!scope || (scope !== "friends" && scope !== "global")) {
    return NextResponse.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  }
  if (!requestedCode || requestedCode.length < 4) {
    return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const ownProfileRows = await selectProfiles(admin, (query: any) => query.eq("parent_user_id", user.id));
    const ownProfile = findOwnProfile(ownProfileRows, requestedCode);
    if (!ownProfile?.id) {
      return NextResponse.json({ ok: false, error: "missing_own_profile" }, { status: 403 });
    }

    const publishedScores = await loadPublishedGameScores(admin);
    const publishedLocationIds = Array.from(publishedScores.keys());

    let profiles: ChildProfileRow[];

    if (scope === "friends") {
      const [{ data: outgoing }, { data: incoming }] = await Promise.all([
        admin
          .from("child_friendships")
          .select("child_profile_id, friend_child_profile_id")
          .eq("child_profile_id", ownProfile.id),
        admin
          .from("child_friendships")
          .select("child_profile_id, friend_child_profile_id")
          .eq("friend_child_profile_id", ownProfile.id)
      ]);

      const memberIds = new Set<string>([ownProfile.id]);
      for (const link of [
        ...((outgoing as ChildFriendshipRow[] | null) ?? []),
        ...((incoming as ChildFriendshipRow[] | null) ?? [])
      ]) {
        memberIds.add(link.child_profile_id);
        memberIds.add(link.friend_child_profile_id);
      }

      profiles = await selectProfiles(admin, (query: any) => query.in("id", Array.from(memberIds)));
    } else {
      profiles = await selectProfiles(admin, (query: any) => query);
    }

    const players = profiles.map((row) => toPlayer(row, row.id === ownProfile.id));

    let progressRows: LeaderboardProgressRow[] = [];
    if (publishedLocationIds.length > 0) {
      const { data, error } = await admin
        .from("child_location_progress")
        .select("profile_code, location_id, best_score, penalty_points, status, first_completed_at")
        .in("location_id", publishedLocationIds)
        .in(
          "profile_code",
          players.map((player) => player.profileCode)
        );
      if (error) {
        throw new Error(`progress_failed: ${error.message}`);
      }
      progressRows = (data as LeaderboardProgressRow[] | null) ?? [];
    }

    const totals = totalsByProfile(progressRows, publishedScores);
    const { entries, you, rankedPlayers } = buildLeaderboard({ players, totals, limit });

    return NextResponse.json({ ok: true, scope, entries, you, rankedPlayers });
  } catch (error) {
    console.error("[leaderboard]", error);
    return NextResponse.json({ ok: false, error: "leaderboard_failed" }, { status: 500 });
  }
}
