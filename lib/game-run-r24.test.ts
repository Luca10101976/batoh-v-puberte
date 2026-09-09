import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveResumeTarget, isClosedTaskStatus } from "./play-resume.ts";

// R24: spustit a pokračovat v rozehrané výpravě.
// Pravidla, která sahají na databázi, se ověřují nad zdrojovým kódem (stejný styl
// jako u zámku her v R22 a modelu výprav v R23). Čistá pravidla se testují přímo.

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const episodes = [
  { tasks: [{ id: "a1" }, { id: "a2" }] },
  { tasks: [{ id: "b1" }, { id: "b2" }] },
  { tasks: [{ id: "c1" }] }
];

// ---------------------------------------------------------------------------
// A–D. Zahájení hry: jedna operace, idempotentní
// ---------------------------------------------------------------------------

test("A: zahájení hry zakládá výpravu ještě před první odpovědí", () => {
  const detail = read("components/location-detail-screen.tsx");
  assert.match(detail, /await startRun\(location\.id\)/, "tlačítko musí zahájit hru na serveru");
  assert.ok(
    detail.indexOf("await startRun(location.id)") < detail.indexOf("router.push(`/play/${location.id}?mode=solo", detail.indexOf("await startRun")),
    "výprava musí vzniknout dřív, než se otevře herní obrazovka"
  );
  const route = read("app/api/game/start-run/route.ts");
  assert.match(route, /ensureActiveRun\(admin, \{ childProfileId: ownProfile\.id, locationId \}\)/);
});

test("B: opakované zahájení vrátí stejnou výpravu, nikdy nezaloží druhou", () => {
  const lib = read("lib/game-run.ts");
  assert.match(lib, /const existing = await findActiveRunForPlayer\([\s\S]*?if \(existing\) \{\s*\n\s*return \{ run: existing, created: false \};/);
  assert.match(lib, /inserted\.error\?\.code === "23505"[\s\S]*?findOpenRunByLeader\(/, "souběh musí dohledat existující výpravu");
});

test("F: souběžný start nesmí skončit chybou serveru", () => {
  // Poražený požadavek se o vítězi dozví z porušení jedinečnosti. V ten okamžik
  // řádek účastníka ještě nemusí existovat, takže hledání přes účastnictví by
  // vrátilo prázdno a endpoint by odpověděl chybou 500.
  const lib = read("lib/game-run.ts");
  const branch = lib.slice(lib.indexOf('if (inserted.error?.code === "23505")'), lib.indexOf("const runId = inserted.data.id;"));
  assert.match(branch, /findOpenRunByLeader\(admin, args\.leaderChildProfileId, args\.locationId\)/);
  assert.ok(!/findActiveRunForPlayer/.test(branch), "souběh se nesmí spoléhat na řádek účastníka");
  assert.match(branch, /child_game_session_players"\)\.upsert/, "účastnictví se doplní idempotentně");
  assert.match(lib, /async function findOpenRunByLeader[\s\S]*?\.eq\("leader_child_profile_id", leaderChildProfileId\)/);
});

test("C: dokončená hra + Hrát znovu založí novou výpravu", () => {
  const model = read("lib/location-detail-model.ts");
  assert.match(model, /: input\.completed\s*\n\s*\? "replay"/);
  assert.match(model, /replay: "Hrát znovu"/);
  // Hrát znovu volá tutéž operaci zahájení jako Hrát – nová výprava vznikne proto,
  // že po dokončení žádná neběží.
  const detail = read("components/location-detail-screen.tsx");
  assert.equal(detail.split("startRun(location.id)").length - 1, 1, "existuje jediná cesta zahájení");
});

test("D: rozehraná hra nabídne Pokračovat a novou výpravu nezaloží", () => {
  const model = read("lib/location-detail-model.ts");
  assert.match(model, /input\.hasActiveRun\s*\n?\s*\? "continue"/);
  assert.match(model, /continue: "Pokračovat"/);
});

test("D: model rozliší všechny čtyři stavy hráče", async () => {
  const { buildLocationDetailModel } = await import("./location-detail-model.ts");
  const base = {
    name: "Klamovka",
    image: "/x.png",
    episodes: [{ name: "První" }],
    unlocked: true,
    registered: true
  };
  assert.equal(buildLocationDetailModel({ ...base }).primaryLabel, "Hrát");
  assert.equal(buildLocationDetailModel({ ...base, hasActiveRun: true }).primaryLabel, "Pokračovat");
  assert.equal(buildLocationDetailModel({ ...base, completed: true }).primaryLabel, "Hrát znovu");
  assert.equal(
    buildLocationDetailModel({ ...base, completed: true, hasActiveRun: true }).primaryLabel,
    "Pokračovat",
    "běžící výprava má přednost před dokončením"
  );
  assert.equal(buildLocationDetailModel({ ...base, unlocked: false }).primaryAction, "locked");
  assert.equal(buildLocationDetailModel({ ...base, registered: false }).primaryLabel, "Přihlásit a hrát");
});

// ---------------------------------------------------------------------------
// E–F. Více rozehraných her
// ---------------------------------------------------------------------------

test("E: hráč může mít rozehraných více různých her", () => {
  const lib = read("lib/game-run.ts");
  assert.match(lib, /export async function listActiveRunsForPlayer/);
  assert.match(lib, /byLocation\.set\(run\.locationId, run\)/, "jedna výprava na hru, ale her víc");
  const sql = read("supabase/migrations/20260909065624_r23_game_runs.sql");
  assert.match(sql, /leader_child_profile_id, location_id\)/, "omezení je na dvojici hráč a hra, ne na hráče");
});

test("F: seznam rozehraných her vrací všechny běžící výpravy", () => {
  const route = read("app/api/game/active-runs/route.ts");
  assert.match(route, /listActiveRunsForPlayer\(admin, ownProfile\.id\)/);
  assert.match(route, /taskProgress: rows\.map/, "součástí je i postup, aby šla dopočítat pozice");
  const afterList = route.slice(route.indexOf("listActiveRunsForPlayer(admin"));
  assert.ok(!/limit\(1\)/.test(afterList), "výpis se nesmí ořezávat na jednu hru");
});

// ---------------------------------------------------------------------------
// G–J. Rekonstrukce pozice
// ---------------------------------------------------------------------------

test("G: hra bez odpovědí se otevře na prvním úkolu", () => {
  const target = resolveResumeTarget({ episodes, taskProgress: [], requestedEpisodeIndex: null, requestedTaskIndex: null });
  assert.deepEqual(target, { episodeIndex: 0, taskIndex: 0, source: "computed" });
});

test("H: rozehraná hra se otevře na prvním neuzavřeném úkolu", () => {
  const target = resolveResumeTarget({
    episodes,
    taskProgress: [
      { task_id: "a1", status: "correct" },
      { task_id: "a2", status: "unknown" }
    ],
    requestedEpisodeIndex: null,
    requestedTaskIndex: null
  });
  assert.deepEqual(target, { episodeIndex: 1, taskIndex: 0, source: "computed" });
});

test("H: hotová celá zastávka posune na první úkol další zastávky", () => {
  const target = resolveResumeTarget({
    episodes,
    taskProgress: [
      { task_id: "a1", status: "correct" },
      { task_id: "a2", status: "correct" },
      { task_id: "b1", status: "unknown" }
    ],
    requestedEpisodeIndex: null,
    requestedTaskIndex: null
  });
  assert.deepEqual(target, { episodeIndex: 1, taskIndex: 1, source: "computed" });
});

test("I: úkol s jedním nebo dvěma chybnými pokusy zůstává otevřený", () => {
  assert.equal(isClosedTaskStatus("wrong"), false);
  const target = resolveResumeTarget({
    episodes,
    taskProgress: [
      { task_id: "a1", status: "correct" },
      { task_id: "a2", status: "wrong" }
    ],
    requestedEpisodeIndex: null,
    requestedTaskIndex: null
  });
  assert.deepEqual(target, { episodeIndex: 0, taskIndex: 1, source: "computed" });
});

test("J: zastaralá adresa nevrátí hráče na už uzavřený úkol", () => {
  const target = resolveResumeTarget({
    episodes,
    taskProgress: [
      { task_id: "a1", status: "correct" },
      { task_id: "a2", status: "correct" }
    ],
    // odkaz z dřívějška ukazuje na první úkol, ten je ale hotový
    requestedEpisodeIndex: 0,
    requestedTaskIndex: 0
  });
  assert.deepEqual(target, { episodeIndex: 1, taskIndex: 0, source: "computed" });
});

test("J: adresa na neuzavřený úkol se respektuje", () => {
  const target = resolveResumeTarget({
    episodes,
    taskProgress: [{ task_id: "a1", status: "correct" }],
    requestedEpisodeIndex: 2,
    requestedTaskIndex: 0
  });
  assert.deepEqual(target, { episodeIndex: 2, taskIndex: 0, source: "requested" });
});

test("vše uzavřené vede na poslední krok, ne na začátek", () => {
  const target = resolveResumeTarget({
    episodes,
    taskProgress: episodes.flatMap((e) => e.tasks).map((t) => ({ task_id: t.id, status: "unknown" as const })),
    requestedEpisodeIndex: null,
    requestedTaskIndex: null
  });
  assert.deepEqual(target, { episodeIndex: 2, taskIndex: 0, source: "completed" });
});

test("herní obrazovka používá stejný výpočet a neukládá pozici", () => {
  const play = read("components/play-screen.tsx");
  assert.match(play, /resolveResumeTarget\(\{/);
  assert.ok(!/current_step|episode_index|task_index/.test(play), "žádný uložený index obrazovky");
  assert.ok(
    !/if \(requestedEpisodeIndex !== null\) \{\s*\n\s*setEpisodeIndex\(requestedEpisodeIndex\);\s*\n\s*setTaskIndex\(requestedTaskIndex \?\? 0\);\s*\n\s*setResuming\(false\);/.test(play),
    "adresa už nesmí přebít serverový stav"
  );
});

// ---------------------------------------------------------------------------
// K–M. Dvě zařízení
// ---------------------------------------------------------------------------

test("K: druhé zařízení nedohledá vlastní výpravu, ale tutéž podle hráče a hry", () => {
  const start = read("app/api/game/start-run/route.ts");
  assert.ok(!/body\.\s*runId|body\.sessionId/.test(start), "klient neposílá vlastní identitu výpravy");
  assert.match(start, /ensureActiveRun/);
  const play = read("components/play-screen.tsx");
  assert.ok(!/sessionId|runId/.test(play), "herní obrazovka žádnou výpravu neposílá");
});

test("L: souběžný první zápis stejného úkolu nekončí chybou serveru", () => {
  const submit = read("app/api/game/submit-task-answer/route.ts");
  assert.match(submit, /if \(error\?\.code === "23505"\)/, "kolize jedinečnosti se musí ošetřit");
  assert.match(submit, /const \{ data: storedRow \} = await taskProgressQuery\(\)/, "druhý zápis dostane uložený stav");
  assert.ok(
    submit.indexOf('if (error?.code === "23505")') < submit.indexOf("saveError = error;", submit.indexOf('if (error?.code === "23505")')),
    "ošetření kolize musí předcházet návratu chyby"
  );
});

test("M: první uzavřený výsledek úkolu nelze přepsat", () => {
  const submit = read("app/api/game/submit-task-answer/route.ts");
  assert.match(
    submit,
    /if \(existingRow && \(existingRow\.status === "correct" \|\| existingRow\.status === "unknown"\)\) \{\s*\n\s*return NextResponse\.json\(\{/,
    "uzavřený úkol vrací uložený stav a nepřepisuje se"
  );
  assert.match(submit, /locked: true/);
});

// ---------------------------------------------------------------------------
// N–O. Idempotentní dokončení
// ---------------------------------------------------------------------------

test("N: druhé dokončení už dokončené hry nevrací nepravdivou hlášku", () => {
  const complete = read("app/api/game/complete-location/route.ts");
  assert.match(complete, /alreadyCompleted: true/);
  assert.match(complete, /existingProgress\?\.status === "completed" \|\| existingProgress\?\.first_completed_at/);
  assert.ok(
    complete.indexOf("alreadyCompleted: true") < complete.indexOf("mission_not_finished"),
    "idempotentní větev musí předcházet hlášce o nedokončené hře"
  );
});

test("O: druhé dokončení nemění first_completed_at ani nejlepší skóre", () => {
  const complete = read("app/api/game/complete-location/route.ts");
  const branch = complete.slice(complete.indexOf("if (!run) {"), complete.indexOf("let participantIds"));
  assert.ok(!/\.insert\(|\.update\(|\.upsert\(/.test(branch), "idempotentní větev nesmí nic zapisovat");
  assert.match(branch, /\.select\("status, first_completed_at, best_score"\)/);
});

// ---------------------------------------------------------------------------
// P–R. Zdroj rozehranosti, zámek her, skupinová větev
// ---------------------------------------------------------------------------

test("P: rozehranost nevychází z tabulky nejlepších výsledků", () => {
  const provider = read("components/app-state-provider.tsx");
  assert.match(provider, /activeRuns/, "stav aplikace drží běžící výpravy");
  const home = read("components/home-screen.tsx");
  assert.match(home, /activeRuns/);
  assert.ok(!/pickLatestActiveMission/.test(home), "hlavní obrazovka už nevybírá podle postupu hry");
  const profile = read("components/profile-screen.tsx");
  assert.match(profile, /activeRuns\.map\(\(run\) => \[run\.locationId, run\]\)/);
  assert.ok(!/state\.activeMission\?\.locationId/.test(profile), "profil už nevychází z activeMission");
  const runs = read("app/api/game/active-runs/route.ts");
  assert.ok(!/from\("child_location_progress"\)/.test(runs), "výpis rozehraných her se neptá tabulky nejlepších výsledků");
});

test("Q: zámek her z R22 platí i pro zahájení hry", () => {
  const start = read("app/api/game/start-run/route.ts");
  assert.match(start, /resolveServerGameAccess\(admin, ownProfile\.profile_code, locationId, \{\s*\n\s*childProfileId: ownProfile\.id\s*\n\s*\}\)/);
  assert.match(start, /if \(!access\.allowed\)/);
  assert.ok(
    start.indexOf("resolveServerGameAccess(") < start.indexOf("ensureActiveRun("),
    "zámek se kontroluje dřív, než výprava vznikne"
  );
});

test("R: skupinová serverová větev zůstala nedotčená", () => {
  for (const file of [
    "app/api/expeditions/create/route.ts",
    "app/api/expeditions/invite/route.ts",
    "app/api/expeditions/invites/list/route.ts",
    "app/api/expeditions/invites/respond/route.ts",
    "app/api/expeditions/active/route.ts",
    "app/api/expeditions/cancel/route.ts",
    "app/api/expeditions/start/route.ts",
    "app/api/expeditions/finish/route.ts"
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} nesmí zmizet`);
  }
  const finish = read("app/api/expeditions/finish/route.ts");
  assert.match(finish, /completeRunForParticipants\(/, "skupinové dokončení dál používá sdílenou vrstvu");
  assert.match(finish, /leader_only/);
  const shared = read("lib/game-completion.ts");
  assert.match(shared, /participantChildProfileIds/, "sdílená vrstva pro skupinu zůstává");
  // R24 nepřidává žádné skupinové ovládání
  const profile = read("components/profile-screen.tsx");
  assert.ok(!/expeditions\/(start|finish|cancel|invites)/.test(profile), "R24 nepřidává skupinové UI");
});
