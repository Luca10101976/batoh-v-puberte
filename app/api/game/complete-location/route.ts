import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gameAccessHttpStatus, resolveServerGameAccess } from "@/lib/game-access-server";
import { getCatalog, getGameplayEnding, getGameplayLocation } from "@/lib/gameplay-server";
import { getLocationMaxScore } from "@/lib/game-rules";
import { checkRateLimitSafe, getRequestIpAddress } from "@/lib/rate-limit";
import { completeRunForParticipants } from "@/lib/game-completion";
import { findActiveRunForPlayer, getRunParticipantIds } from "@/lib/game-run";

// R23: dokončení hry. Jediná cesta pro sólo i skupinu – veškerou logiku drží
// lib/game-completion.ts, tenhle soubor jen ověří, kdo volá a kterou výpravu.
//
// Klíčová pravidla:
//   T1 – body počítá server z uzavřených úkolů v databázi. Skóre, počty „Nevím“
//        ani penalizace poslané klientem se nečtou.
//   T7 – čas dokončení určuje server.
//   P2 – každý účastník má vlastní odpovědi a vlastní body.
//   P3 – dokončí jen ten, kdo má v této výpravě uzavřené všechny úkoly hry.
//   P4 – nula bodů je platné dokončení, když jsou všechny úkoly uzavřené.

type ChildProfileRow = {
  id: string;
  profile_code: string;
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
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

  const rateLimitResult = await checkRateLimitSafe({
    action: "complete_location",
    ip: getRequestIpAddress(request),
    userId: user.id,
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

  const body = (await request.json().catch(() => null)) as {
    profileCode?: string;
    locationId?: string;
    mode?: "solo" | "group";
    source?: "gameplay" | "manual" | "expedition";
    // R23/T1 + T7: unknownTaskIds, unknownCount, penaltyPoints a completedAt starší
    // aplikace stále posílá. Server je ZÁMĚRNĚ nečte – body i čas určuje sám.
  } | null;

  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const profileCode = normalizeCode(body.profileCode ?? "");
  const locationId = (body.locationId ?? "").trim();
  const source: "gameplay" | "expedition" = body.source === "expedition" ? "expedition" : "gameplay";

  if (!profileCode || !locationId) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  if (body.source === "manual") {
    return NextResponse.json(
      {
        ok: false,
        error: "manual_completion_removed",
        message: "Papírová verze už se bodově neuzavírá ručně. Odpovědi zadej do stejné mise v aplikaci."
      },
      { status: 400 }
    );
  }

  const knownLocation = await getGameplayLocation(locationId);
  if (!knownLocation) {
    return NextResponse.json({ ok: false, error: "unknown_location" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: ownProfile } = await admin
    .from("child_profiles")
    .select("id, profile_code")
    .eq("profile_code", profileCode)
    .eq("parent_user_id", user.id)
    .limit(1)
    .maybeSingle<ChildProfileRow>();

  if (!ownProfile?.id) {
    // Profil musí patřit přihlášenému účtu; nikdy se nezakládá podle kódu z klienta.
    return NextResponse.json({ ok: false, error: "forbidden_profile" }, { status: 403 });
  }

  // R22 + R23/P9: zámek hry se vynucuje na serveru, výjimku má jen platný člen výpravy.
  const access = await resolveServerGameAccess(admin, ownProfile.profile_code, locationId, {
    childProfileId: ownProfile.id
  });
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, error: access.reason === "not_published" ? "unknown_location" : "location_locked" },
      { status: gameAccessHttpStatus(access.reason) }
    );
  }

  // R23: dokončuje se konkrétní běžící výprava. Když žádná není (historická data
  // před R23), vyhodnotí se odpovědi bez vazby na výpravu.
  const run = await findActiveRunForPlayer(admin, ownProfile.id, locationId);

  // R24: druhé dokončení téže hry musí být idempotentní. Když už žádná výprava
  // neběží a hráč má hru dokončenou, request nic nemění a vrátí uložený stav.
  // Bez toho by dvojklik nebo druhé zařízení dostaly nepravdivou hlášku
  // o nevyřešených úkolech, protože uzavřená výprava už odpovědi nedodá.
  if (!run) {
    const { data: existingProgress } = await admin
      .from("child_location_progress")
      .select("status, first_completed_at, best_score")
      .eq("profile_code", ownProfile.profile_code)
      .eq("location_id", locationId)
      .limit(1)
      .maybeSingle<{ status?: string | null; first_completed_at?: string | null; best_score?: number | null }>();

    if (existingProgress?.status === "completed" || existingProgress?.first_completed_at) {
      return NextResponse.json({
        ok: true,
        alreadyCompleted: true,
        participantCodes: [normalizeCode(ownProfile.profile_code)],
        firstCompletionProfileCodes: [],
        bestScore: existingProgress.best_score ?? null
      });
    }
  }

  let participantIds = [ownProfile.id];
  if (run) {
    try {
      const members = await getRunParticipantIds(admin, run.id);
      if (members.length > 0) {
        participantIds = members.includes(ownProfile.id) ? members : [...members, ownProfile.id];
      }
    } catch {
      return NextResponse.json({ ok: false, error: "progress_load_failed" }, { status: 500 });
    }
  }

  const outcome = await completeRunForParticipants(admin, {
    runId: run?.id ?? null,
    locationId,
    participantChildProfileIds: participantIds.slice(0, 8),
    source
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, error: outcome.error === "save_failed" ? "save_progress_failed" : "progress_load_failed" },
      { status: 500 }
    );
  }

  // P3: hra se uzavře jen tomu, kdo má opravdu vyřešené všechny úkoly.
  if (!outcome.completedCodes.includes(normalizeCode(ownProfile.profile_code))) {
    return NextResponse.json(
      {
        ok: false,
        error: "mission_not_finished",
        message: "Hru uzavřeme, až budeš mít vyřešené všechny úkoly. Co nevíš, můžeš uzavřít tlačítkem Nevím."
      },
      { status: 409 }
    );
  }

  // R42: zápis do child_security_events zanikl. Log se jen plnil a nikdy nikdo
  // ho nečetl – ani kód, ani Mozek. Dokončení hry zůstává zaznamenané tam, kde
  // se opravdu čte: v child_location_progress a child_task_progress.

  // R26/Q6: závěrečnou obrazovku musí umět vykreslit server. Klient si už nic
  // nepřepočítává – dostane hotové skóre, rekord, závěr hry i případné odemčení.
  const mine = outcome.participants.find((entry) => entry.profileCode === normalizeCode(ownProfile.profile_code));
  const ending = await getGameplayEnding(locationId);
  const unlockedGame = mine?.firstCompletion ? await resolveUnlockedGame(locationId) : null;

  return NextResponse.json({
    ok: true,
    participantCodes: outcome.completedCodes,
    firstCompletionProfileCodes: outcome.firstCompletionCodes,
    result: mine
      ? {
          score: mine.result.score,
          maxScore: getLocationMaxScore(mine.result.totalTasks),
          totalTasks: mine.result.totalTasks,
          correctTasks: mine.result.correctTasks,
          unknownTasks: mine.result.unknownTasks
        }
      : null,
    bestScore: mine?.bestScore ?? null,
    isNewBest: mine?.isNewBest ?? false,
    ending,
    unlockedGame
  });
}

/**
 * R26: hra, kterou hráč tímhle dokončením odemkl. Bere se z katalogu, aby platila
 * stejná pravidla jako u zámku (R22): jen publikovaná hra ve stejném městě.
 */
async function resolveUnlockedGame(locationId: string) {
  try {
    const catalog = await getCatalog();
    const source = catalog.find((entry) => entry.locationId === locationId) ?? null;
    const next = catalog.find(
      (entry) =>
        entry.unlockAfterLocationId === locationId &&
        !entry.unlockPrerequisiteInvalid &&
        (!source || entry.city === source.city)
    );
    return next ? { locationId: next.locationId, title: next.title } : null;
  } catch {
    // Informace navíc; když se nepodaří, hráč jen neuvidí zprávu o odemčení.
    return null;
  }
}
