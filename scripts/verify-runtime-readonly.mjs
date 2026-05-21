#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

function printHelp() {
  console.log(`
Ověří, že runtime hry nemění admin obsah v mission_tasks.

Použití:
  npm run verify:runtime-readonly
  npm run verify:runtime-readonly -- --include-complete

Povinné env:
  APP_BASE_URL                      URL běžící aplikace, např. http://localhost:3000
  NEXT_PUBLIC_SUPABASE_URL         URL Supabase projektu
  NEXT_PUBLIC_SUPABASE_ANON_KEY    nebo NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  SUPABASE_SERVICE_ROLE_KEY        service role pro read-only snapshot mission_tasks
  TEST_PLAYER_EMAIL                testovací hráčský účet
  TEST_PLAYER_PASSWORD             heslo testovacího účtu

Automatický výběr mise:
  ADMIN_BASIC_USER
  ADMIN_BASIC_PASS

Volitelný fallback bez admin exportu:
  MISSION_ID
  LOCATION_ID

Poznámka:
  Script nic neopravuje. Změnit se smí jen hráčský progress.
  Mission_tasks se nesmí změnit ani o jeden řádek.
`);
}

function getArgFlag(name) {
  return process.argv.slice(2).includes(name);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Chybí povinné env ${name}.`);
  }
  return value;
}

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const message =
      (json && (json.message || json.error)) ||
      text ||
      `HTTP ${response.status} ${response.statusText}`;
    throw new Error(`${url} selhalo: ${message}`);
  }

  return json;
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(sortKeysDeep(value));
}

function buildTaskSnapshot(rows) {
  return rows
    .map((row) => sortKeysDeep(row))
    .sort((a, b) => {
      const stopCompare = String(a.stop_id ?? "").localeCompare(String(b.stop_id ?? ""));
      if (stopCompare !== 0) {
        return stopCompare;
      }

      const orderCompare = Number(a.order ?? 0) - Number(b.order ?? 0);
      if (orderCompare !== 0) {
        return orderCompare;
      }

      return String(a.id ?? "").localeCompare(String(b.id ?? ""));
    });
}

function diffTaskSnapshots(beforeRows, afterRows) {
  const beforeById = new Map(beforeRows.map((row) => [String(row.id), stableStringify(row)]));
  const afterById = new Map(afterRows.map((row) => [String(row.id), stableStringify(row)]));
  const changed = [];

  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  for (const id of ids) {
    if (beforeById.get(id) !== afterById.get(id)) {
      changed.push(id);
    }
  }

  return changed.sort();
}

async function resolveMissionAndLocation(admin, appBaseUrl) {
  const explicitMissionId = optionalEnv("MISSION_ID");
  const explicitLocationId = optionalEnv("LOCATION_ID");

  if (explicitMissionId && explicitLocationId) {
    const { data: mission, error } = await admin
      .from("missions")
      .select("id, title, city, is_published")
      .eq("id", explicitMissionId)
      .eq("is_published", true)
      .maybeSingle();

    if (error || !mission) {
      throw new Error(`MISSION_ID ${explicitMissionId} nebyla nalezena mezi publikovanými misemi.`);
    }

    return {
      missionId: mission.id,
      missionTitle: mission.title,
      city: mission.city,
      locationId: explicitLocationId
    };
  }

  const basicUser = optionalEnv("ADMIN_BASIC_USER");
  const basicPass = optionalEnv("ADMIN_BASIC_PASS");

  if (!basicUser || !basicPass) {
    throw new Error(
      "Pro automatický výběr mise chybí ADMIN_BASIC_USER/ADMIN_BASIC_PASS. " +
        "Buď je doplň, nebo zadej MISSION_ID a LOCATION_ID."
    );
  }

  const { data: mission, error } = await admin
    .from("missions")
    .select("id, title, city, is_published, created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !mission) {
    throw new Error("Nepodařilo se vybrat publikovanou misi.");
  }

  const exportPayload = await fetchJson(`${appBaseUrl}/api/export/game-content?format=json`, {
    headers: {
      Authorization: basicAuth(basicUser, basicPass)
    }
  });

  const locationRow = Array.isArray(exportPayload?.rows)
    ? exportPayload.rows.find(
        (row) =>
          row.section === "location" &&
          String(row.city).trim().toLowerCase() === String(mission.city).trim().toLowerCase() &&
          String(row.locationName).trim().toLowerCase() === String(mission.title).trim().toLowerCase()
      )
    : null;

  if (!locationRow?.locationId) {
    throw new Error(
      `Nepodařilo se namapovat publikovanou misi "${mission.title}" (${mission.city}) na veřejné locationId.`
    );
  }

  return {
    missionId: mission.id,
    missionTitle: mission.title,
    city: mission.city,
    locationId: String(locationRow.locationId)
  };
}

async function getMissionTaskRows(admin, missionId) {
  const { data: stops, error: stopsError } = await admin
    .from("mission_stops")
    .select("id, order")
    .eq("mission_id", missionId)
    .order("order", { ascending: true });

  if (stopsError) {
    throw new Error(`Nepodařilo se načíst mission_stops: ${stopsError.message}`);
  }

  if (!stops?.length) {
    throw new Error(`Mise ${missionId} nemá žádná zastavení.`);
  }

  const stopIds = stops.map((row) => row.id);
  const { data: tasks, error: tasksError } = await admin
    .from("mission_tasks")
    .select("*")
    .in("stop_id", stopIds)
    .order("stop_id", { ascending: true })
    .order("order", { ascending: true });

  if (tasksError) {
    throw new Error(`Nepodařilo se načíst mission_tasks: ${tasksError.message}`);
  }

  if (!tasks?.length) {
    throw new Error(`Mise ${missionId} nemá žádné úkoly.`);
  }

  return { stops, tasks };
}

async function loginTestPlayer(supabaseUrl, anonKey, email, password) {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const result = await anon.auth.signInWithPassword({ email, password });

  if (result.error || !result.data.session?.access_token) {
    throw new Error(`Přihlášení testovacího hráče selhalo: ${result.error?.message ?? "bez detailu"}`);
  }

  return result.data.session.access_token;
}

async function loadPlayerProfile(appBaseUrl, accessToken) {
  const payload = await fetchJson(`${appBaseUrl}/api/child-profile/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!payload?.ok || !payload?.profile?.profile_code) {
    throw new Error("Nepodařilo se načíst cloud profil testovacího hráče.");
  }

  return payload.profile;
}

async function submitRuntimeAnswer(appBaseUrl, accessToken, profileCode, locationId, taskId) {
  return fetchJson(`${appBaseUrl}/api/game/submit-task-answer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      profileCode,
      locationId,
      taskId,
      action: "answer",
      answer: "__runtime_readonly_probe__"
    })
  });
}

async function loadRuntimeProgress(appBaseUrl, accessToken, profileCode, locationId) {
  return fetchJson(`${appBaseUrl}/api/game/location-progress`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      profileCode,
      locationId
    })
  });
}

async function completeMission(appBaseUrl, accessToken, profileCode, locationId, taskId) {
  return fetchJson(`${appBaseUrl}/api/game/complete-location`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      profileCode,
      locationId,
      expeditionId: null,
      mode: "solo",
      completedAt: new Date().toISOString(),
      unknownTaskIds: [taskId],
      unknownCount: 1,
      source: "gameplay"
    })
  });
}

async function fetchProgressCounts(admin, profileCode, locationId) {
  const [taskProgress, locationProgress] = await Promise.all([
    admin
      .from("child_task_progress")
      .select("id", { count: "exact", head: true })
      .eq("profile_code", profileCode)
      .eq("location_id", locationId),
    admin
      .from("child_location_progress")
      .select("profile_code", { count: "exact", head: true })
      .eq("profile_code", profileCode)
      .eq("location_id", locationId)
  ]);

  return {
    taskProgressCount: taskProgress.count ?? 0,
    locationProgressCount: locationProgress.count ?? 0
  };
}

async function main() {
  if (getArgFlag("--help")) {
    printHelp();
    return;
  }

  const includeComplete = getArgFlag("--include-complete");

  const appBaseUrl = requireEnv("APP_BASE_URL").replace(/\/+$/, "");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey =
    optionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") || requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const testEmail = requireEnv("TEST_PLAYER_EMAIL");
  const testPassword = requireEnv("TEST_PLAYER_PASSWORD");

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  console.log("1/6 Vybiram jednu publikovanou misi...");
  const selection = await resolveMissionAndLocation(admin, appBaseUrl);
  console.log(
    `   Mise: ${selection.missionTitle} (${selection.city}) | missionId=${selection.missionId} | locationId=${selection.locationId}`
  );

  console.log("2/6 Ukladam snapshot mission_tasks pred runtime testem...");
  const beforeData = await getMissionTaskRows(admin, selection.missionId);
  const beforeSnapshotRows = buildTaskSnapshot(beforeData.tasks);
  const beforeSnapshot = stableStringify(beforeSnapshotRows);
  const firstTask = beforeSnapshotRows[0];
  if (!firstTask?.id) {
    throw new Error("Vybrana mise nema zadny testovatelny task.");
  }

  const accessToken = await loginTestPlayer(supabaseUrl, anonKey, testEmail, testPassword);
  const profile = await loadPlayerProfile(appBaseUrl, accessToken);
  const beforeProgress = await fetchProgressCounts(admin, profile.profile_code, selection.locationId);

  console.log("3/6 Spoustim runtime read path hry...");
  const playResponse = await fetch(`${appBaseUrl}/play/${selection.locationId}`, {
    method: "GET",
    redirect: "follow",
    headers: {
      "Cache-Control": "no-store"
    }
  });
  if (!playResponse.ok) {
    throw new Error(`Načtení /play/${selection.locationId} selhalo: HTTP ${playResponse.status}`);
  }

  await loadRuntimeProgress(appBaseUrl, accessToken, profile.profile_code, selection.locationId);

  console.log("4/6 Odesilam beznou runtime odpoved hrace...");
  await submitRuntimeAnswer(appBaseUrl, accessToken, profile.profile_code, selection.locationId, firstTask.id);

  if (includeComplete) {
    console.log("5/6 Volitelne overuji i runtime dokončení mise...");
    await completeMission(appBaseUrl, accessToken, profile.profile_code, selection.locationId, firstTask.id);
  } else {
    console.log("5/6 Dokonceni mise preskoceno (pridej --include-complete, pokud ho chces overit take).");
  }

  console.log("6/6 Nacitam mission_tasks po runtime krocich a porovnavam snapshot...");
  const afterData = await getMissionTaskRows(admin, selection.missionId);
  const afterSnapshotRows = buildTaskSnapshot(afterData.tasks);
  const afterSnapshot = stableStringify(afterSnapshotRows);
  const afterProgress = await fetchProgressCounts(admin, profile.profile_code, selection.locationId);

  if (beforeSnapshot !== afterSnapshot) {
    const changedIds = diffTaskSnapshots(beforeSnapshotRows, afterSnapshotRows);
    console.error("");
    console.error("FAIL");
    console.error("Runtime zmenil admin obsah v mission_tasks.");
    console.error(`Mission ID: ${selection.missionId}`);
    console.error(`Location ID: ${selection.locationId}`);
    console.error(`Zmenene task ID: ${changedIds.join(", ") || "(neurceno)"}`);
    process.exit(1);
  }

  console.log("");
  console.log("PASS");
  console.log("Runtime hry nezmenil zadny radek v mission_tasks.");
  console.log(`Mission ID: ${selection.missionId}`);
  console.log(`Location ID: ${selection.locationId}`);
  console.log(`Pocet tasku ve snapshotu: ${beforeSnapshotRows.length}`);
  console.log(
    `Progress pred/po: child_task_progress ${beforeProgress.taskProgressCount} -> ${afterProgress.taskProgressCount}, ` +
      `child_location_progress ${beforeProgress.locationProgressCount} -> ${afterProgress.locationProgressCount}`
  );
}

main().catch((error) => {
  console.error("");
  console.error("FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
