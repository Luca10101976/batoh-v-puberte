// R23: rozehrání hry = VÝPRAVA. Jednotný model pro sólo i skupinu.
//
// Pojmy (schválený doménový model):
//   HRA      = obsah (missions + mission_stops + mission_tasks)
//   VÝPRAVA  = jedno konkrétní rozehrání jedné hry jedním nebo více hráči
//              (tabulka child_game_sessions; sólo = výprava s jedním hráčem)
//   ZASTÁVKA = mission_stops
//   ÚKOL     = mission_tasks
//
// Sólo hráč o slově „výprava“ nemusí v UI vědět, technicky je to ale stejný záznam.
// Odpověď na úkol patří konkrétní výpravě (child_task_progress.session_id), takže
// opakované hraní je NOVÁ výprava a historii předchozího průchodu nemaže.
//
// Offline (R27–R29) tento model nepotřebuje měnit: výprava je stabilní identita
// jednoho rozehrání a dvojice (výprava, úkol) je přirozený idempotentní klíč fronty.

/** Kód chyby „sloupec neexistuje“ z PostgREST i z Postgresu. */
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

export function isMissingColumnError(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && MISSING_COLUMN_CODES.has(error.code));
}

export type GameRunStatus = "waiting" | "active" | "finished" | "cancelled";

export type GameRun = {
  id: string;
  leader_child_profile_id: string;
  locationId: string | null;
  status: GameRunStatus;
  mode: "solo" | "group";
  started_at: string | null;
};

type SessionRow = {
  id: string;
  leader_child_profile_id: string;
  status: GameRunStatus;
  started_at: string | null;
  mode?: string | null;
  location_id?: string | null;
  mission_id?: string | null;
};

// Sloupec s adresou hry se v R23 přejmenovává z `mission_id` (matoucí – neobsahuje
// UUID mise) na `location_id`. Dokud migrace neproběhne, kód musí fungovat s oběma.
let locationColumnCache: "location_id" | "mission_id" | null = null;

async function resolveLocationColumn(admin: any): Promise<"location_id" | "mission_id"> {
  if (locationColumnCache) {
    return locationColumnCache;
  }
  const probe = await admin.from("child_game_sessions").select("id, location_id").limit(1);
  locationColumnCache = isMissingColumnError(probe.error) ? "mission_id" : "location_id";
  return locationColumnCache;
}

/** Jen pro testy: zapomenout zjištěný tvar schématu. */
export function resetGameRunSchemaCache() {
  locationColumnCache = null;
}

function toRun(row: SessionRow, column: "location_id" | "mission_id"): GameRun {
  return {
    id: row.id,
    leader_child_profile_id: row.leader_child_profile_id,
    locationId: (column === "location_id" ? row.location_id : row.mission_id) ?? null,
    status: row.status,
    mode: row.mode === "group" ? "group" : "solo",
    started_at: row.started_at ?? null
  };
}

async function selectRun(admin: any, runId: string): Promise<GameRun | null> {
  const column = await resolveLocationColumn(admin);
  const { data } = (await admin
    .from("child_game_sessions")
    .select(`id, leader_child_profile_id, status, started_at, ${column}`)
    .eq("id", runId)
    .limit(1)
    .maybeSingle()) as { data: SessionRow | null };
  return data ? toRun(data, column) : null;
}

export async function getRun(admin: any, runId: string) {
  return selectRun(admin, runId);
}

/** Je hráč přijatým účastníkem této výpravy? Ověřuje se výhradně proti databázi. */
export async function isAcceptedRunMember(admin: any, runId: string, childProfileId: string) {
  const { data } = (await admin
    .from("child_game_session_players")
    .select("id")
    .eq("session_id", runId)
    .eq("child_profile_id", childProfileId)
    .eq("status", "accepted")
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null };
  return Boolean(data?.id);
}

/** Přijatí účastníci výpravy. Sólo výprava vrací jednoho hráče. */
export async function getRunParticipantIds(admin: any, runId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("child_game_session_players")
    .select("child_profile_id")
    .eq("session_id", runId)
    .eq("status", "accepted");
  if (error) {
    throw new Error(`run_participants_unavailable: ${error.message}`);
  }
  return Array.from(new Set(((data as Array<{ child_profile_id: string }> | null) ?? []).map((row) => row.child_profile_id)));
}

/** Běžící výprava dané hry, ve které je hráč přijatým účastníkem. */
export async function findActiveRunForPlayer(
  admin: any,
  childProfileId: string,
  locationId: string
): Promise<GameRun | null> {
  const column = await resolveLocationColumn(admin);
  const { data: memberships } = await admin
    .from("child_game_session_players")
    .select("session_id")
    .eq("child_profile_id", childProfileId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(50);

  const sessionIds = ((memberships as Array<{ session_id: string }> | null) ?? []).map((row) => row.session_id);
  if (sessionIds.length === 0) {
    return null;
  }

  const { data } = await admin
    .from("child_game_sessions")
    .select(`id, leader_child_profile_id, status, started_at, ${column}`)
    .in("id", sessionIds)
    .in("status", ["waiting", "active"])
    .eq(column, locationId)
    .order("created_at", { ascending: false })
    .limit(1);

  const rows = (data as SessionRow[] | null) ?? [];
  return rows[0] ? toRun(rows[0], column) : null;
}

/**
 * Založí novou výpravu dané hry a přidá zakladatele jako přijatého účastníka.
 * Volající MUSÍ mít ke hře ověřený přístup (R22), tato funkce zámek nekontroluje.
 */
export async function startRun(
  admin: any,
  args: { leaderChildProfileId: string; locationId: string; mode?: "solo" | "group" }
): Promise<GameRun | null> {
  const column = await resolveLocationColumn(admin);
  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    leader_child_profile_id: args.leaderChildProfileId,
    [column]: args.locationId,
    status: "active",
    started_at: nowIso,
    mode: args.mode ?? "solo"
  };

  let inserted = (await admin.from("child_game_sessions").insert(payload).select("id").single()) as {
    data: { id: string } | null;
    error: { code?: string } | null;
  };
  if (isMissingColumnError(inserted.error)) {
    // Schéma ještě nemá sloupec `mode` (před migrací R23).
    const { mode: _ignoredMode, ...withoutMode } = payload;
    inserted = (await admin.from("child_game_sessions").insert(withoutMode).select("id").single()) as {
      data: { id: string } | null;
      error: { code?: string } | null;
    };
  }
  if (inserted.error?.code === "23505") {
    // Souběh: výpravu téže hry mezitím založil jiný požadavek téhož hráče.
    return findActiveRunForPlayer(admin, args.leaderChildProfileId, args.locationId);
  }
  if (inserted.error || !inserted.data?.id) {
    return null;
  }

  const runId = inserted.data.id;
  const { error: playerError } = await admin.from("child_game_session_players").upsert(
    {
      session_id: runId,
      child_profile_id: args.leaderChildProfileId,
      status: "accepted",
      joined_at: nowIso
    },
    { onConflict: "session_id,child_profile_id" }
  );
  if (playerError) {
    // Výprava bez zakladatele by byla neviditelná – radši ji hned zrušit.
    await admin.from("child_game_sessions").delete().eq("id", runId);
    return null;
  }

  return selectRun(admin, runId);
}

/**
 * R24: JEDINÁ operace zahájení hry – „najdi běžící výpravu této hry, a když žádná
 * není, založ ji". Používají ji Hrát, Pokračovat i Hrát znovu.
 *
 * Je idempotentní: opakované volání vrátí tutéž výpravu a nikdy nezaloží druhou.
 * `created` říká, jestli výprava právě vznikla.
 */
export async function ensureActiveRun(
  admin: any,
  args: { childProfileId: string; locationId: string }
): Promise<{ run: GameRun | null; created: boolean }> {
  const existing = await findActiveRunForPlayer(admin, args.childProfileId, args.locationId);
  if (existing) {
    return { run: existing, created: false };
  }
  const started = await startRun(admin, {
    leaderChildProfileId: args.childProfileId,
    locationId: args.locationId,
    mode: "solo"
  });
  // startRun při souběhu dohledá existující výpravu, takže se druhá nikdy nezaloží.
  return { run: started, created: Boolean(started) };
}

/**
 * R24/P8: všechny běžící výpravy hráče. Hráč smí mít rozehraných více RŮZNÝCH her,
 * ale nejvýš jednu výpravu jedné hry.
 *
 * Tohle je jediný zdroj pravdy pro otázku „má hráč tuhle hru právě rozehranou?".
 * child_location_progress je od R23 jen nejlepší historický výsledek a na tuhle
 * otázku se ho ptát nesmíme.
 */
export async function listActiveRunsForPlayer(admin: any, childProfileId: string): Promise<GameRun[]> {
  const column = await resolveLocationColumn(admin);
  const { data: memberships } = await admin
    .from("child_game_session_players")
    .select("session_id")
    .eq("child_profile_id", childProfileId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(100);

  const sessionIds = ((memberships as Array<{ session_id: string }> | null) ?? []).map((row) => row.session_id);
  if (sessionIds.length === 0) {
    return [];
  }

  const { data } = await admin
    .from("child_game_sessions")
    .select(`id, leader_child_profile_id, status, started_at, ${column}`)
    .in("id", sessionIds)
    .in("status", ["waiting", "active"])
    .order("created_at", { ascending: false });

  const runs = ((data as SessionRow[] | null) ?? []).map((row) => toRun(row, column)).filter((run) => run.locationId);

  // Pojistka: kdyby přece jen existovaly dvě otevřené výpravy téže hry, platí
  // nejnovější – stejně jako ve findActiveRunForPlayer, aby si obě cesty odpovídaly.
  const byLocation = new Map<string, GameRun>();
  runs.forEach((run) => {
    if (run.locationId && !byLocation.has(run.locationId)) {
      byLocation.set(run.locationId, run);
    }
  });
  return Array.from(byLocation.values());
}

/** Uzavře výpravu. Idempotentní: už uzavřená výprava se znovu nemění. */
export async function finishRun(admin: any, runId: string) {
  const { error } = await admin
    .from("child_game_sessions")
    .update({ status: "finished", finished_at: new Date().toISOString() })
    .eq("id", runId)
    .in("status", ["waiting", "active"]);
  return !error;
}

/** Odpovědi jednoho hráče v jedné výpravě. Legacy řádky bez výpravy se nemíchají. */
export async function loadRunTaskProgress(
  admin: any,
  args: { runId: string | null; locationId: string; childProfileIds: string[] }
) {
  if (args.childProfileIds.length === 0) {
    return new Map<string, Array<{ task_id: string; status: "correct" | "wrong" | "unknown" }>>();
  }

  let query = admin
    .from("child_task_progress")
    .select("child_profile_id, task_id, status")
    .eq("location_id", args.locationId)
    .in("child_profile_id", args.childProfileIds);
  query = args.runId ? query.eq("session_id", args.runId) : query.is("session_id", null);

  let { data, error } = await query;
  if (isMissingColumnError(error)) {
    // Před migrací R23 sloupec neexistuje – odpovědi jsou jen jedny.
    ({ data, error } = await admin
      .from("child_task_progress")
      .select("child_profile_id, task_id, status")
      .eq("location_id", args.locationId)
      .in("child_profile_id", args.childProfileIds));
  }
  if (error) {
    throw new Error(`run_progress_unavailable: ${error.message}`);
  }

  const byChild = new Map<string, Array<{ task_id: string; status: "correct" | "wrong" | "unknown" }>>();
  ((data as Array<{ child_profile_id: string; task_id: string; status: "correct" | "wrong" | "unknown" }> | null) ?? []).forEach(
    (row) => {
      const current = byChild.get(row.child_profile_id) ?? [];
      current.push({ task_id: row.task_id, status: row.status });
      byChild.set(row.child_profile_id, current);
    }
  );
  return byChild;
}
