import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimitSafe, getRequestIpAddress } from "@/lib/rate-limit";
import { getCatalog, getGameplayEpisodes } from "@/lib/gameplay-server";
import { resolveResumeTarget } from "@/lib/play-resume";
import { isMissingColumnError, listActiveRunsForPlayer } from "@/lib/game-run";
import { resolveCatalogEntryForLocation } from "@/lib/catalog";

// R24/P8: všechny hry, které má hráč právě rozehrané.
//
// Zdrojem pravdy jsou BĚŽÍCÍ VÝPRAVY, ne child_location_progress. Ta je od R23
// jen nejlepší historický výsledek a o rozehranosti nevypovídá.
//
// Odpověď obsahuje i uzavřené odpovědi každé výpravy, aby aplikace uměla stejným
// výpočtem jako herní obrazovka určit, kde hráč skončil. Žádný „current screen
// index“ se neukládá.

type ChildProfileRow = {
  id: string;
  profile_code: string;
};

type TaskProgressRow = {
  task_id: string;
  status: "correct" | "wrong" | "unknown";
  attempts: number | null;
  session_id?: string | null;
  location_id: string;
  updated_at?: string | null;
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
    action: "active_runs",
    ip: getRequestIpAddress(request),
    userId: user.id,
    limit: 180,
    windowMinutes: 60,
    blockMinutes: 10
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after: rateLimitResult.retryAfterSeconds ?? 60 },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as { profileCode?: string } | null;
  const profileCode = normalizeCode(body?.profileCode ?? "");
  if (!profileCode) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
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
    return NextResponse.json({ ok: false, error: "forbidden_profile" }, { status: 403 });
  }

  const runs = await listActiveRunsForPlayer(admin, ownProfile.id);
  if (runs.length === 0) {
    return NextResponse.json({ ok: true, runs: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  let catalog: Awaited<ReturnType<typeof getCatalog>> = [];
  try {
    catalog = await getCatalog();
  } catch {
    catalog = [];
  }

  const locationIds = runs.map((run) => run.locationId).filter((id): id is string => Boolean(id));
  const runIds = runs.map((run) => run.id);

  const progressQuery = () =>
    admin
      .from("child_task_progress")
      .select("task_id, status, attempts, session_id, location_id, updated_at")
      .eq("child_profile_id", ownProfile.id)
      .in("location_id", locationIds);

  let { data: progressRows, error: progressError } = (await progressQuery().in("session_id", runIds)) as {
    data: TaskProgressRow[] | null;
    error: { code?: string } | null;
  };
  if (isMissingColumnError(progressError)) {
    // Před migrací R23 sloupec session_id neexistuje.
    ({ data: progressRows, error: progressError } = (await admin
      .from("child_task_progress")
      .select("task_id, status, attempts, location_id, updated_at")
      .eq("child_profile_id", ownProfile.id)
      .in("location_id", locationIds)) as { data: TaskProgressRow[] | null; error: { code?: string } | null });
  }
  if (progressError) {
    return NextResponse.json({ ok: false, error: "progress_load_failed" }, { status: 500 });
  }

  const byRun = new Map<string, TaskProgressRow[]>();
  (progressRows ?? []).forEach((row) => {
    const key = row.session_id ?? row.location_id;
    const current = byRun.get(key) ?? [];
    current.push(row);
    byRun.set(key, current);
  });

  const payload = await Promise.all(
    runs.map(async (run) => {
      const rows = byRun.get(run.id) ?? byRun.get(run.locationId ?? "") ?? [];
      const closedTasks = rows.filter((row) => row.status === "correct" || row.status === "unknown").length;
      const lastActivity = rows
        .map((row) => row.updated_at ?? "")
        .filter(Boolean)
        .sort()
        .at(-1);
      const entry = run.locationId ? resolveCatalogEntryForLocation(catalog, run.locationId).entry : null;

      // Pozice se počítá stejnou čistou funkcí jako na herní obrazovce, nad úkoly
      // hry z databáze. Aplikace tak nemusí znát obsah hry, aby uměla říct
      // „Zastavení 2/5 • Úkol 1/4" a název zastávky, kde hráč skončil.
      let episodes: Awaited<ReturnType<typeof getGameplayEpisodes>> = null;
      try {
        episodes = run.locationId ? await getGameplayEpisodes(run.locationId) : null;
      } catch {
        episodes = null;
      }
      const totalTasks = (episodes ?? []).reduce((sum, episode) => sum + episode.tasks.length, 0);
      const target = resolveResumeTarget({
        episodes: episodes ?? [],
        taskProgress: rows.map((row) => ({ task_id: row.task_id, status: row.status })),
        requestedEpisodeIndex: null,
        requestedTaskIndex: null
      });
      const episode = (episodes ?? [])[target.episodeIndex] ?? null;

      return {
        runId: run.id,
        locationId: run.locationId,
        mode: run.mode,
        startedAt: run.started_at,
        updatedAt: lastActivity ?? run.started_at,
        title: entry?.title ?? null,
        city: entry?.city ?? null,
        closedTasks,
        totalTasks,
        position: {
          episodeIndex: target.episodeIndex,
          taskIndex: target.taskIndex,
          episodeCount: (episodes ?? []).length,
          taskCountInEpisode: episode?.tasks.length ?? 0,
          stopName: episode?.name ?? null,
          taskTitle: episode?.tasks[target.taskIndex]?.title ?? null,
          allClosed: target.source === "completed"
        },
        taskProgress: rows.map((row) => ({
          task_id: row.task_id,
          status: row.status,
          attempts: Math.max(0, row.attempts ?? 0)
        }))
      };
    })
  );

  return NextResponse.json({ ok: true, runs: payload }, { headers: { "Cache-Control": "no-store" } });
}
