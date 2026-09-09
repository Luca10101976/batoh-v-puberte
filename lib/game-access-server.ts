// R22: serverové vynucení herního zámku.
//
// Klientský zámek zůstává jako UX, ale rozhoduje výhradně tato funkce: body a postup
// vznikají jen zápisy přes API, takže hru nejde odemknout přímou URL ani voláním API.
// Fail-closed: jakákoli chyba (výpadek DB, nedostupný katalog) znamená zamčeno.

import { getCatalog } from "@/lib/gameplay-server";
import { resolveGameAccess, type GameAccess } from "@/lib/game-access";
import { hasHistoricalLocationCompletion } from "@/lib/location-progress-state";
import { findActiveRunForPlayer } from "@/lib/game-run";

type ProgressRow = {
  location_id: string;
  status?: "in_progress" | "completed" | null;
  first_completed_at?: string | null;
  completed_at?: string | null;
};

/** Hry, které má hráč historicky dokončené (stejná sémantika jako v klientovi). */
export async function loadCompletedLocationIds(admin: any, profileCode: string): Promise<string[]> {
  const { data, error } = await admin
    .from("child_location_progress")
    .select("location_id, status, first_completed_at, completed_at")
    .eq("profile_code", profileCode);

  if (error) {
    throw new Error(`progress_unavailable: ${error.message}`);
  }

  return ((data as ProgressRow[] | null) ?? [])
    .filter((row) => hasHistoricalLocationCompletion(row))
    .map((row) => row.location_id);
}

/**
 * Smí tento hráč hrát tuto hru? Volat ve VŠECH zapisujících herních endpointech
 * po ověření vlastnictví profilu a před jakýmkoli zápisem postupu nebo bodů.
 */
export async function resolveServerGameAccess(
  admin: any,
  profileCode: string,
  locationId: string,
  options?: { childProfileId?: string | null }
): Promise<GameAccess> {
  try {
    const [catalog, completed] = await Promise.all([getCatalog(), loadCompletedLocationIds(admin, profileCode)]);
    const direct = resolveGameAccess(catalog, locationId, completed);
    if (direct.allowed) {
      return direct;
    }

    // R23/P9: sociální hraní má přednost před osobním herním prerequisite.
    // Hráč smí hrát KONKRÉTNÍ společnou výpravu hry, kterou sám nemá odemčenou,
    // pokud je jejím platným přijatým účastníkem a vedoucí výpravy ke hře přístup má.
    //
    // Výjimka je záměrně úzká:
    //   - platí jen pro běžící výpravu, ve které je hráč přijatým členem (ověřeno v DB),
    //   - neplatí, když je hráč sám vedoucím (jinak by si zámek obešel sám sobě),
    //   - nepublikovanou hru neodemyká nikdy,
    //   - neoznačuje hru jako obecně odemčenou; katalog i sólo hraní zůstávají zamčené,
    //   - z požadavku se nepřebírá nic než identita hráče, členství se čte z databáze.
    const childProfileId = options?.childProfileId ?? null;
    if (!childProfileId || direct.reason === "not_published") {
      return direct;
    }

    const run = await findActiveRunForPlayer(admin, childProfileId, locationId);
    if (!run || run.leader_child_profile_id === childProfileId) {
      return direct;
    }

    const { data: leader } = await admin
      .from("child_profiles")
      .select("profile_code")
      .eq("id", run.leader_child_profile_id)
      .limit(1)
      .maybeSingle();
    const leaderCode = (leader as { profile_code?: string } | null)?.profile_code;
    if (!leaderCode) {
      return direct;
    }

    const leaderAccess = resolveGameAccess(catalog, locationId, await loadCompletedLocationIds(admin, leaderCode));
    if (!leaderAccess.allowed) {
      return direct;
    }

    return { allowed: true, locationId: leaderAccess.locationId };
  } catch {
    return { allowed: false, reason: "locked" };
  }
}

/** HTTP kód pro odmítnutí: nepublikovaná hra 400, zamčená 403. */
export function gameAccessHttpStatus(reason: string) {
  return reason === "not_published" ? 400 : 403;
}
