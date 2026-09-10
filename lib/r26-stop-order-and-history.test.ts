import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  fallbackTransitionText,
  isStopCompleted,
  resolveCurrentTask,
  resolvePendingStopTransition,
  resolveTaskAvailability,
  type OrderedEpisode,
  type OrderedTaskRow
} from "./task-order.ts";
import { isNewBestScore } from "./game-result.ts";
import { pointsForTask, scoreTaskProgress } from "./mission-completion.ts";
import { resolveResumeTarget } from "./play-resume.ts";

// R26: odemykání zastávek, dokončení a historie.

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

const episodes: OrderedEpisode[] = [
  { id: "s1", name: "Chrámek", transitionText: "Autorský text zastávky.", tasks: [{ id: "a1" }, { id: "a2" }] },
  { id: "s2", name: "Cassel", tasks: [{ id: "b1" }, { id: "b2" }] },
  { id: "s3", name: "Altán", tasks: [{ id: "c1" }] }
];
const closed = (ids: string[], status: OrderedTaskRow["status"] = "correct"): OrderedTaskRow[] =>
  ids.map((id) => ({ task_id: id, status }));

// ---------------------------------------------------------------------------
// A. POŘADÍ
// ---------------------------------------------------------------------------

test("A1 – na začátku je na řadě první úkol první zastávky", () => {
  assert.equal(resolveCurrentTask(episodes, [])?.id, "a1");
  assert.deepEqual(resolveTaskAvailability(episodes, [], "a1"), { allowed: true });
});

test("A2 – druhý úkol je před uzavřením prvního odmítnutý", () => {
  const verdict = resolveTaskAvailability(episodes, [], "a2");
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.allowed === false ? verdict.reason : "", "out_of_order");
  assert.equal(verdict.allowed === false && verdict.reason === "out_of_order" ? verdict.currentTaskId : "", "a1");
});

test("A3 – úkol z budoucí zastávky je odmítnutý", () => {
  const verdict = resolveTaskAvailability(episodes, closed(["a1"]), "c1");
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.allowed === false ? verdict.reason : "", "out_of_order");
});

test("A4 – úkol, který ve hře není, je odmítnutý", () => {
  const verdict = resolveTaskAvailability(episodes, [], "neexistuje");
  assert.equal(verdict.allowed === false ? verdict.reason : "", "unknown_task");
});

test("A5 – uzavřený úkol se znovu neotevírá", () => {
  const verdict = resolveTaskAvailability(episodes, closed(["a1"]), "a1");
  assert.equal(verdict.allowed === false ? verdict.reason : "", "already_closed");
});

test("A6 – správná odpověď odemkne další úkol", () => {
  assert.deepEqual(resolveTaskAvailability(episodes, closed(["a1"], "correct"), "a2"), { allowed: true });
});

test("A7 – explicitní i automatické Nevím odemyká stejně jako správná odpověď", () => {
  assert.deepEqual(resolveTaskAvailability(episodes, closed(["a1"], "unknown"), "a2"), { allowed: true });
  // Automatické Nevím po třetí chybě je uložené jako unknown – tedy uzavřené.
  assert.equal(resolveCurrentTask(episodes, closed(["a1"], "unknown"))?.id, "a2");
});

test("A8 – tři chybné pokusy bez uzavření hráče neposunou", () => {
  const stillOpen: OrderedTaskRow[] = [{ task_id: "a1", status: "wrong" }];
  assert.equal(resolveCurrentTask(episodes, stillOpen)?.id, "a1");
  assert.equal(resolveTaskAvailability(episodes, stillOpen, "a2").allowed, false);
});

test("A9 – adresa nesmí přeskočit pořadí", () => {
  const target = resolveResumeTarget({
    episodes,
    taskProgress: closed(["a1"]),
    requestedEpisodeIndex: 2,
    requestedTaskIndex: 0
  });
  assert.deepEqual(target, { episodeIndex: 0, taskIndex: 1, source: "computed" });
});

test("A10 – server kontroluje pořadí na každé zapisující herní cestě", () => {
  for (const file of ["app/api/game/submit-task-answer/route.ts", "app/api/game/reveal-hint/route.ts"]) {
    const src = read(file);
    assert.match(src, /resolveServerTaskAvailability\(/, `${file} nekontroluje pořadí`);
    assert.match(src, /taskAvailabilityResponse\(/, `${file} nevyhodnocuje výsledek kontroly`);
    // Kontrola musí předcházet každému zápisu.
    const guard = src.indexOf("resolveServerTaskAvailability(");
    for (const write of [".insert(", ".update(", ".upsert("]) {
      const at = src.indexOf(write);
      if (at >= 0) {
        assert.ok(guard < at, `${file}: ${write} je před kontrolou pořadí`);
      }
    }
  }
});

test("A11 – nápověda k budoucímu ani uzavřenému úkolu se nevydá", () => {
  const src = read("app/api/game/reveal-hint/route.ts");
  // Bez allowClosed, takže uzavřený úkol nápovědu nedostane.
  assert.ok(!/taskAvailabilityResponse\(availability, \{ allowClosed: true \}\)/.test(src));
  const submit = read("app/api/game/submit-task-answer/route.ts");
  // Uložení odpovědi naopak uzavřený úkol pustí dál – to je souběh z R24.
  assert.match(submit, /allowClosed: true/);
});

test("A12 – herní obrazovka počítá pozici stejným pravidlem jako server", () => {
  const play = read("components/play-screen.tsx");
  assert.match(play, /resolveCurrentTask\(location\.episodes/);
  assert.ok(!/setEpisodeIndex\(requestedEpisodeIndex\)/.test(play), "adresa už nesmí posouvat obrazovku");
  assert.match(play, /task_out_of_order/, "obrazovka neumí zpracovat odmítnutí serverem");
});

// ---------------------------------------------------------------------------
// B. ZASTÁVKA A PŘECHOD
// ---------------------------------------------------------------------------

test("B1 – zastávka není hotová, dokud má otevřený úkol", () => {
  assert.equal(isStopCompleted(episodes[0], closed(["a1"])), false);
});

test("B2 – zastávka je hotová, když jsou uzavřené všechny její úkoly", () => {
  assert.equal(isStopCompleted(episodes[0], closed(["a1", "a2"])), true);
});

test("B3 – na bodech nezáleží: samé Nevím zastávku uzavře taky", () => {
  assert.equal(isStopCompleted(episodes[0], closed(["a1", "a2"], "unknown")), true);
});

test("B4 – po dokončení zastávky vznikne přechod se správným číslem", () => {
  const transition = resolvePendingStopTransition({
    episodes,
    taskProgress: closed(["a1", "a2"]),
    confirmedStopIds: []
  });
  assert.ok(transition);
  assert.equal(transition.fromStopId, "s1");
  assert.equal(transition.fromStopName, "Chrámek");
  assert.equal(transition.fromStopNumber, 1, "číslo dokončené zastávky, ne index následující");
  assert.equal(transition.toStopName, "Cassel");
  assert.equal(transition.toStopNumber, 2);
  assert.equal(transition.stopCount, 3);
  assert.equal(transition.transitionText, "Autorský text zastávky.");
});

test("B5 – přechod přežije reload i druhé zařízení, protože se odvozuje ze serverových dat", () => {
  // Stejný vstup (uzavřené úkoly + potvrzené přechody) dá vždy stejný výsledek.
  const args = { episodes, taskProgress: closed(["a1", "a2"]), confirmedStopIds: [] };
  assert.deepEqual(resolvePendingStopTransition(args), resolvePendingStopTransition({ ...args }));
  const play = read("components/play-screen.tsx");
  assert.match(play, /resolvePendingStopTransition\(/, "obrazovka si přechod nesmí držet jen v paměti");
  assert.ok(!/setPendingEpisodeTransition/.test(play), "starý stav v paměti zůstal");
});

test("B6 – potvrzený přechod se už neukazuje a potvrzení je idempotentní", () => {
  const after = resolvePendingStopTransition({
    episodes,
    taskProgress: closed(["a1", "a2"]),
    confirmedStopIds: ["s1"]
  });
  assert.equal(after, null);
  // Dvakrát potvrzený seznam se nezdvojuje – hlídá to serverový helper.
  const helper = read("lib/stop-transition-server.ts");
  assert.match(helper, /if \(current\.includes\(args\.stopId\)\) \{/);
});

test("B7 – potvrzení přechodu není druhý zdroj pravdy o dokončení zastávky", () => {
  // I když hráč přechod potvrdí, zastávka je dokončená jen podle uzavřených úkolů.
  assert.equal(isStopCompleted(episodes[0], closed(["a1"])), false);
  const migration = read("supabase/migrations/20260910082646_r26_stop_transitions_and_write_lock.sql");
  assert.match(migration, /confirmed_stop_transitions/);
  assert.ok(!/stop_completed|completed_stops/.test(migration), "vznikl uložený stav dokončení zastávky");
});

test("B8 – přechod se nenabízí uprostřed zastávky ani na konci hry", () => {
  assert.equal(
    resolvePendingStopTransition({ episodes, taskProgress: closed(["a1"]), confirmedStopIds: [] }),
    null
  );
  assert.equal(
    resolvePendingStopTransition({
      episodes,
      taskProgress: closed(["a1", "a2", "b1", "b2", "c1"]),
      confirmedStopIds: []
    }),
    null,
    "po posledním úkolu se hra dokončuje, nepřechází"
  );
});

test("B9 – zastávka bez autorského textu dostane obecný", () => {
  const transition = resolvePendingStopTransition({
    episodes,
    taskProgress: closed(["a1", "a2", "b1", "b2"]),
    confirmedStopIds: ["s1"]
  });
  assert.ok(transition);
  assert.equal(transition.transitionText, "", "Cassel autorský text nemá");
  assert.equal(fallbackTransitionText("Cassel", "Altán"), "Zastávku „Cassel“ máš hotovou. Teď se přesuň na Altán.");
  const play = read("components/play-screen.tsx");
  assert.match(play, /fallbackTransitionText\(/);
});

test("B10 – potvrdit jde jen přechod ze skutečně dokončené zastávky", () => {
  const route = read("app/api/game/confirm-stop-transition/route.ts");
  assert.match(route, /isStopCompleted\(/);
  assert.match(route, /stop_not_completed/);
  assert.match(route, /resolveServerGameAccess\(/, "R22 musí platit i tady");
});

// ---------------------------------------------------------------------------
// C. ZÁVĚR A BODY
// ---------------------------------------------------------------------------

test("C1 – hodnoty úkolů: 10 bez nápovědy, 5 s nápovědou, 0 za Nevím", () => {
  assert.equal(pointsForTask("correct", false), 10);
  assert.equal(pointsForTask("correct", true), 5);
  assert.equal(pointsForTask("unknown", false), 0);
});

test("C2 – kombinovaný výsledek odpovídá součtu skutečných hodnot", () => {
  const result = scoreTaskProgress(["a1", "a2", "b1", "b2", "c1"], [
    { task_id: "a1", status: "correct" },
    { task_id: "a2", status: "correct", hintUsed: true },
    { task_id: "b1", status: "unknown" },
    { task_id: "b2", status: "correct" },
    { task_id: "c1", status: "correct", hintUsed: true }
  ]);
  assert.equal(result.score, 10 + 5 + 0 + 10 + 5);
  assert.equal(result.maxScore, 50);
});

test("C3 – klient si skóre nepřepočítává", () => {
  const play = read("components/play-screen.tsx");
  assert.ok(!/knownCount \* POINTS_PER_TASK/.test(play), "zůstal výpočet correct × 10");
  assert.match(play, /finishSummary\.result\.score/, "obrazovka nebere skóre ze serveru");
  assert.match(play, /payload\.result/, "dokončení nečte serverový výsledek");
});

test("C4 – server posílá skóre, rekord, závěr i odemčenou hru", () => {
  const route = read("app/api/game/complete-location/route.ts");
  assert.match(route, /result: mine/);
  assert.match(route, /bestScore: mine\?\.bestScore/);
  assert.match(route, /isNewBest: mine\?\.isNewBest/);
  assert.match(route, /ending,/);
  assert.match(route, /unlockedGame/);
});

test("C5 – první dokončení je vždy rekord, stejný výsledek podruhé ne", () => {
  assert.equal(isNewBestScore(null, 0), true, "i nula bodů je první rekord");
  assert.equal(isNewBestScore(undefined, 40), true);
  assert.equal(isNewBestScore(40, 50), true);
  assert.equal(isNewBestScore(40, 40), false);
  assert.equal(isNewBestScore(40, 10), false);
});

test("C6 – nejlepší výsledek se horším průchodem nezhorší", () => {
  const completion = read("lib/game-completion.ts");
  assert.match(completion, /entry\.bestScore = Math\.max\(previousBest \?\? 0, entry\.result\.score\)/);
  assert.match(completion, /const previousBest = typeof existing\?\.best_score === "number"/);
});

test("C7 – nula bodů je platné dokončení a odemyká další hru", () => {
  const result = scoreTaskProgress(["a1", "a2"], [
    { task_id: "a1", status: "unknown" },
    { task_id: "a2", status: "unknown" }
  ]);
  assert.equal(result.score, 0);
  assert.equal(result.missingTasks, 0);
});

test("C8 – maximum bodů pochází z počtu úkolů hry, ne z obsahu v kódu", () => {
  const complete = read("app/api/game/complete-location/route.ts");
  assert.match(complete, /getLocationMaxScore\(mine\.result\.totalTasks\)/);
  const progress = read("app/api/game/location-progress/route.ts");
  assert.match(progress, /knownLocation\.episodes\.reduce/);
  assert.ok(!/from "@\/lib\/scoring"/.test(complete), "závěr nesmí brát maximum z mock-data");
});

// ---------------------------------------------------------------------------
// D. RELOAD A OPAKOVANÉ HRANÍ
// ---------------------------------------------------------------------------

test("D1 – dokončená hra se reloadem sama nespustí", () => {
  const play = read("components/play-screen.tsx");
  const hydrate = play.slice(play.indexOf("async function hydrateInProgressMission"));
  const completedBranch = hydrate.indexOf("if (payload?.completed)");
  const autoStart = hydrate.indexOf("await startRun(location.id)");
  assert.ok(completedBranch > 0, "chybí větev pro dokončenou hru");
  assert.ok(completedBranch < autoStart, "dokončená hra se musí vyřídit dřív než automatické zahájení");
  assert.match(hydrate.slice(completedBranch, completedBranch + 300), /setCompletedSummary\(payload\.completed\)/);
});

test("D2 – server rozliší běžící výpravu, dokončenou hru a hru nikdy nezačatou", () => {
  const route = read("app/api/game/location-progress/route.ts");
  assert.match(route, /const completedSummary = finishedWithoutRun/);
  assert.match(route, /run: run \? \{ id: run\.id/);
});

test("D3 – novou výpravu založí jen vědomá akce hráče", () => {
  const play = read("components/play-screen.tsx");
  assert.match(play, /async function handlePlayAgain\(\)/);
  assert.match(play, /Hrát znovu/);
  assert.match(play, /started\.created \? "&intro=1" : ""/, "u nového průchodu se má ukázat úvod");
  const detail = read("components/location-detail-screen.tsx");
  assert.match(detail, /started\.created \? "&intro=1" : ""/);
});

test("D4 – Pokračovat nikdy nevytvoří opakované hraní", () => {
  const lib = read("lib/game-run.ts");
  assert.match(lib, /const existing = await findActiveRunForPlayer/);
  assert.match(lib, /return \{ run: existing, created: false \}/);
});

// ---------------------------------------------------------------------------
// E. SPOILER ZÁVĚRU
// ---------------------------------------------------------------------------

test("E1 – veřejná podoba hry závěr neobsahuje", () => {
  const server = read("lib/gameplay-server.ts");
  const publicGetter = server.slice(
    server.indexOf("export async function getGameplayLocation("),
    server.indexOf("export async function getGameplayEnding(")
  );
  assert.match(publicGetter, /endingTitle: _endingTitle/);
  assert.match(publicGetter, /endingStory: _endingStory/);
  assert.match(publicGetter, /playerMessage: _playerMessage/);
});

test("E2 – stránky pro hráče závěr nedostávají ani typem", () => {
  for (const file of ["components/home-screen.tsx", "components/location-detail-screen.tsx", "components/play-screen.tsx"]) {
    const src = read(file);
    assert.match(
      src,
      /Omit<MapLocation, "episodes" \| "endingTitle" \| "endingStory" \| "playerMessage">/,
      `${file}: typ hry pořád obsahuje závěr`
    );
  }
});

test("E3 – veřejná tisková verze závěr netiskne", () => {
  const route = read("app/api/export/game-content/route.ts");
  const printable = route.slice(route.indexOf("type PrintableLocation"), route.indexOf("async function buildPrintableHtml"));
  assert.ok(!/endingTitle|endingStory|playerMessage/.test(printable), "tisková verze pořád nese závěr");
});

test("E4 – závěr vydává server až po dokončení, nebo dokončivšímu hráči", () => {
  const server = read("lib/gameplay-server.ts");
  assert.match(server, /export async function getGameplayEnding/);
  const complete = read("app/api/game/complete-location/route.ts");
  assert.match(complete, /getGameplayEnding\(locationId\)/);
  const progress = read("app/api/game/location-progress/route.ts");
  // Jen ve větvi dokončené hry, ne v běžné odpovědi rozehrané výpravy.
  const summary = progress.slice(
    progress.indexOf("const completedSummary"),
    progress.lastIndexOf("return NextResponse.json")
  );
  assert.match(summary, /ending: await getGameplayEnding\(locationId\)/);
  assert.equal((progress.match(/getGameplayEnding\(/g) ?? []).length, 1, "závěr se nesmí vydávat jinde");
});

// ---------------------------------------------------------------------------
// F. ZÁPIS DO HERNÍHO STAVU JEN SERVEREM
// ---------------------------------------------------------------------------

test("F1 – migrace ruší klientský zápis do autoritativních herních tabulek", () => {
  const migration = read("supabase/migrations/20260910082646_r26_stop_transitions_and_write_lock.sql");
  for (const policy of [
    'drop policy if exists "parents insert own child task progress"',
    'drop policy if exists "parents update own child task progress"',
    'drop policy if exists "parents delete own child task progress"',
    'drop policy if exists "parents insert own child location progress"',
    'drop policy if exists "parents update own child location progress"',
    'drop policy if exists "parents delete own child location progress"'
  ]) {
    assert.ok(migration.includes(policy), `chybí: ${policy}`);
  }
  assert.match(migration, /cmd in \('INSERT', 'UPDATE', 'DELETE', 'ALL'\)/, "chybí pojistka na politiky s jiným názvem");
  assert.match(migration, /alter table public\.child_task_progress enable row level security/);
  assert.match(migration, /alter table public\.child_location_progress enable row level security/);
});

test("F2 – čtecí politiky zůstávají, aby se nic legitimního nerozbilo", () => {
  const migration = read("supabase/migrations/20260910082646_r26_stop_transitions_and_write_lock.sql");
  assert.ok(!/drop policy if exists "parents read own child task progress"/.test(migration));
  assert.ok(!/drop policy if exists "parents read own child location progress"/.test(migration));
});

test("F3 – aplikace tyhle tabulky z prohlížeče nikdy nezapisuje", () => {
  const root = ROOT;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".tsx")) {
        files.push(full);
      }
    }
  };
  walk(path.join(root, "components"));
  assert.ok(files.length > 5);
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    assert.ok(
      !/\.from\("child_(task_progress|location_progress|game_sessions|game_session_players)"\)/.test(src),
      `${path.relative(root, file)}: klient sahá přímo na herní tabulku`
    );
  }
});

test("F4 – všechny herní zápisy jdou přes službu se service-role klíčem", () => {
  for (const file of [
    "app/api/game/submit-task-answer/route.ts",
    "app/api/game/complete-location/route.ts",
    "app/api/game/confirm-stop-transition/route.ts",
    "app/api/game/reveal-hint/route.ts",
    "app/api/game/start-run/route.ts"
  ]) {
    const src = read(file);
    assert.match(src, /SUPABASE_SERVICE_ROLE_KEY/, `${file} nepoužívá serverový klíč`);
    assert.match(src, /auth\.getUser\(accessToken\)|getAuthenticatedUser/, `${file} neověřuje přihlášení`);
  }
});

// ---------------------------------------------------------------------------
// G. MIGRACE
// ---------------------------------------------------------------------------

test("G1 – migrace R26 nic nemaže a dá se pustit opakovaně", () => {
  const migration = read("supabase/migrations/20260910082646_r26_stop_transitions_and_write_lock.sql");
  const statements = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.ok(!/drop table|truncate|delete\s+from/i.test(statements), "migrace maže data");
  const adds = statements.match(/add column/gi) ?? [];
  const idempotent = statements.match(/add column if not exists/gi) ?? [];
  assert.equal(adds.length, idempotent.length);
  assert.ok(!/update public\./i.test(statements), "migrace nemá přepisovat obsah ani výsledky");
});

test("G2 – autorský text přechodu se dá napsat v Mozku a načte se zpět", () => {
  const form = read("components/admin/stop-form.tsx");
  assert.match(form, /name="transition_text"/);
  assert.match(form, /defaultValue=\{stop\.transition_text \?\? ""\}/);
  const actions = read("app/admin/stops/actions.ts");
  assert.match(actions, /transition_text: transitionText/);
  const page = read("app/admin/stops/[id]/page.tsx");
  assert.match(page, /transition_text/);
});
