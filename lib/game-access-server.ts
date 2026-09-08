// R22: serverové vynucení herního zámku.
//
// Klientský zámek zůstává jako UX, ale rozhoduje výhradně tato funkce: body a postup
// vznikají jen zápisy přes API, takže hru nejde odemknout přímou URL ani voláním API.
// Fail-closed: jakákoli chyba (výpadek DB, nedostupný katalog) znamená zamčeno.

import { getCatalog } from "@/lib/gameplay-server";
import { resolveGameAccess, type GameAccess } from "@/lib/game-access";
import { hasHistoricalLocationCompletion } from "@/lib/location-progress-state";

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
  locationId: string
): Promise<GameAccess> {
  try {
    const [catalog, completed] = await Promise.all([getCatalog(), loadCompletedLocationIds(admin, profileCode)]);
    return resolveGameAccess(catalog, locationId, completed);
  } catch {
    return { allowed: false, reason: "locked" };
  }
}

/** HTTP kód pro odmítnutí: nepublikovaná hra 400, zamčená 403. */
export function gameAccessHttpStatus(reason: string) {
  return reason === "not_published" ? 400 : 403;
}
