import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isTaskAnswerCorrect } from "./answer-matching.ts";
import { toPublicTask, toPublicEpisode, toPublicLocation, SERVER_ONLY_TASK_FIELDS } from "./gameplay-public.ts";
import { pointsForTask, scoreTaskProgress, isMissionCompleted } from "./mission-completion.ts";
import { POINTS_PER_TASK, POINTS_PER_TASK_WITH_HINT, MAX_TASK_ATTEMPTS, formatRemainingAttempts } from "./game-rules.ts";
import { findPublishBlockers, splitAcceptedAnswers } from "./mission-publish-validation.ts";

// R25: příběh, úkoly, odpovědi, validace, nápovědy a body.
//
// Testy jsou dvojího druhu:
//   - běhové nad čistými pravidly (body, správnost odpovědi, publikační kontrola),
//   - kontrola zdrojového textu tam, kde pravidlo drží endpoint nebo obrazovka
//     (herní endpointy používají aliasy v importech, takže je sem nelze načíst).

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

// ---------------------------------------------------------------------------
// A. SPRÁVNÉ ODPOVĚDI SE NESMÍ DOSTAT DO PROHLÍŽEČE
// ---------------------------------------------------------------------------

test("A1 – veřejná podoba úkolu neobsahuje odpovědi ani text nápovědy", () => {
  const serverTask = {
    id: "t1",
    type: "question" as const,
    title: "Kolik hlav má had",
    content: "",
    correctAnswers: ["16", "sestnact"],
    minCorrectMatches: undefined,
    hasHint: true,
    hintText: "Podívej se nad vchod."
  };

  const publicTask = toPublicTask(serverTask);
  const serialized = JSON.stringify(publicTask);

  for (const field of SERVER_ONLY_TASK_FIELDS) {
    assert.ok(!(field in publicTask), `${field} zůstalo ve veřejném úkolu`);
  }
  assert.ok(!serialized.includes("sestnact"), "odpověď je v serializovaném úkolu");
  assert.ok(!serialized.includes("Podívej se nad vchod"), "nápověda je v serializovaném úkolu");
  // Co hráč vidět má, zůstává.
  assert.equal(publicTask.title, "Kolik hlav má had");
  assert.equal(publicTask.hasHint, true);
});

test("A2 – odpovědi mizí i z celé hry, ne jen z jednoho úkolu", () => {
  const location = {
    id: "klamovka",
    name: "Klamovka",
    episodes: [
      {
        id: "e1",
        name: "Vchod",
        tasks: [
          { id: "t1", title: "A", correctAnswers: ["tajemstvi-jedna"], hintText: "napoveda-jedna" },
          { id: "t2", title: "B", correctAnswers: ["tajemstvi-dve"] }
        ]
      }
    ]
  };

  const serialized = JSON.stringify(toPublicLocation(location));
  assert.ok(!serialized.includes("tajemstvi"), "odpověď prošla do veřejné hry");
  assert.ok(!serialized.includes("napoveda"), "nápověda prošla do veřejné hry");
  assert.ok(serialized.includes("Klamovka"), "veřejná data přišla o obsah pro hráče");

  const publicEpisode = toPublicEpisode(location.episodes[0]);
  assert.equal(publicEpisode.tasks.length, 2);
});

test("A3 – hru pro hráče vydává jen veřejný getter, verze s odpověďmi je jen pro export za heslem", () => {
  const server = read("lib/gameplay-server.ts");
  assert.match(server, /export async function getGameplayLocation\(/);
  assert.match(server, /episodes: location\.episodes\.map\(\(episode\) => \(\{[\s\S]*?tasks: episode\.tasks\.map\(toPublicTask\)/);

  for (const file of ["app/page.tsx", "app/locations/[id]/page.tsx", "app/play/[id]/page.tsx"]) {
    const src = read(file);
    assert.match(src, /getGameplayLocation\b/, `${file} nepoužívá veřejný getter`);
    assert.ok(!/getGameplayLocationForExport/.test(src), `${file} sahá na verzi s odpověďmi`);
  }

  const exportRoute = read("app/api/export/game-content/route.ts");
  assert.match(exportRoute, /getGameplayLocationForExport/, "export nemá odkud brát odpovědi");
  assert.match(exportRoute, /authorization|Authorization|Basic/, "export s odpověďmi musí být za heslem");
});

test("A4 – herní obrazovka dostává typ bez odpovědí, takže by je nešlo vykreslit ani omylem", () => {
  const types = read("lib/gameplay-types.ts");
  assert.match(types, /export type PublicGameplayTask = Omit<GameplayTask, "correctAnswers" \| "hintText">/);
  const playScreen = read("components/play-screen.tsx");
  assert.match(playScreen, /PublicGameplay/, "play-screen nemá veřejný typ hry");
  assert.ok(!/correctAnswers/.test(playScreen), "play-screen sahá na správné odpovědi");
});

test("A5 – o správnosti rozhoduje server, klient nikdy neposílá výsledek", () => {
  const route = read("app/api/game/submit-task-answer/route.ts");
  assert.match(route, /isTaskAnswerCorrect\(task, answer\)/, "server nevyhodnocuje odpověď sám");
  const playScreen = read("components/play-screen.tsx");
  assert.ok(
    !/isTaskAnswerCorrect|isAnswerCorrect/.test(playScreen),
    "obrazovka si vyhodnocuje správnost sama"
  );
});

test("A6 – obsah v kódu už nedodává odpovědi; autoritou je databáze", () => {
  const server = read("lib/gameplay-server.ts");
  assert.ok(!/taskAnswers/.test(server), "gameplay-server pořád čerpá odpovědi z kódu");
  assert.match(server, /const rawAnswers: string\[\] = \[\]/);
});

// ---------------------------------------------------------------------------
// B. BODY: 10 bez nápovědy, 5 s nápovědou, 0 za Nevím
// ---------------------------------------------------------------------------

test("B1 – správně bez nápovědy je 10 bodů", () => {
  assert.equal(POINTS_PER_TASK, 10);
  assert.equal(pointsForTask("correct", false), 10);
});

test("B2 – správně po otevřené nápovědě je 5 bodů", () => {
  assert.equal(POINTS_PER_TASK_WITH_HINT, 5);
  assert.equal(pointsForTask("correct", true), 5);
});

test("B3 – Nevím je 0 bodů, ať s nápovědou nebo bez ní", () => {
  assert.equal(pointsForTask("unknown", false), 0);
  assert.equal(pointsForTask("unknown", true), 0);
  assert.equal(pointsForTask("wrong", true), 0);
  assert.equal(pointsForTask(undefined, true), 0);
});

test("B4 – skóre hry sečte úkoly podle toho, kde padla nápověda", () => {
  const taskIds = ["t1", "t2", "t3", "t4"];
  const result = scoreTaskProgress(taskIds, [
    { task_id: "t1", status: "correct" },
    { task_id: "t2", status: "correct", hintUsed: true },
    { task_id: "t3", status: "unknown", hintUsed: true },
    { task_id: "t4", status: "correct", hintUsed: false }
  ]);

  assert.equal(result.score, 10 + 5 + 0 + 10);
  assert.equal(result.maxScore, 40);
  assert.equal(result.missingPoints, 15);
  assert.equal(result.correctTasks, 3);
  assert.ok(isMissionCompleted(result), "všechny úkoly jsou uzavřené, hra je dokončená");
});

test("B5 – nápověda u jednoho úkolu nesnižuje hodnotu ostatních", () => {
  const withHintOnFirst = scoreTaskProgress(["t1", "t2"], [
    { task_id: "t1", status: "correct", hintUsed: true },
    { task_id: "t2", status: "correct" }
  ]);
  assert.equal(withHintOnFirst.score, 15);
});

test("B6 – špatné pokusy samy o sobě hodnotu úkolu nesnižují", () => {
  // Tři pokusy, poslední správný a bez nápovědy: pořád plných deset.
  assert.equal(pointsForTask("correct", false), POINTS_PER_TASK);
  const route = read("app/api/game/submit-task-answer/route.ts");
  assert.match(route, /pointsForTask\(nextStatus, hintUsed\)/);
  assert.ok(
    !/attempts\s*[*]\s*|penalty_points:\s*attempts/.test(route),
    "body se nesmí odvozovat od počtu pokusů"
  );
});

test("B7 – nula bodů je platné dokončení hry", () => {
  const result = scoreTaskProgress(["t1", "t2"], [
    { task_id: "t1", status: "unknown" },
    { task_id: "t2", status: "unknown" }
  ]);
  assert.equal(result.score, 0);
  assert.ok(isMissionCompleted(result), "hra dohraná na nulu je pořád dohraná");
});

// ---------------------------------------------------------------------------
// C. NÁPOVĚDA: serverový zápis, idempotence, nevratnost
// ---------------------------------------------------------------------------

test("C1 – text nápovědy vydává jen samostatný endpoint, ne data stránky", () => {
  const route = read("app/api/game/reveal-hint/route.ts");
  assert.match(route, /getGameplayTask\(locationId, taskId\)/);
  assert.match(route, /hintText/);
  assert.match(route, /task_has_no_hint/, "úkol bez nápovědy musí být odmítnut");
});

test("C2 – otevření nápovědy se zapisuje serverově k odpovědi v konkrétní výpravě", () => {
  const route = read("app/api/game/reveal-hint/route.ts");
  assert.match(route, /session_id: run\.id/, "zápis nepatří ke konkrétní výpravě");
  assert.match(route, /hint_used_at: nowIso/);
  const migration = read("supabase/migrations/20260909115520_r25_hints_endings_and_answer_rules.sql");
  assert.match(migration, /child_task_progress add column if not exists hint_used_at timestamptz/);
});

test("C3 – opakované otevření nápovědy nic nemění a nejde vzít zpět", () => {
  const route = read("app/api/game/reveal-hint/route.ts");
  assert.match(route, /\.is\("hint_used_at", null\)/, "zápis se nesmí provést nad už otevřenou nápovědou");
  assert.ok(
    !/hint_used_at:\s*null/.test(route),
    "endpoint nesmí umět nápovědu odznačit"
  );
  assert.match(route, /if \(!existingRow\.hint_used_at\)/, "existující čas se nepřepisuje");
});

test("C4 – odpověď nikdy nepřepíše záznam o nápovědě", () => {
  const route = read("app/api/game/submit-task-answer/route.ts");
  // Nikde se hint_used_at nepřiřazuje: ani v update, ani v payloadu pro insert.
  assert.ok(!/hint_used_at\s*:/.test(route), "uložení odpovědi zapisuje hint_used_at");
  assert.match(route, /\.update\(\{/, "endpoint nic neaktualizuje?");
  assert.match(route, /const hintUsed = Boolean\(existingRow\?\.hint_used_at\)/);
});

test("C5 – stav nápovědy se načítá z databáze, takže přežije reload i druhé zařízení", () => {
  assert.match(read("app/api/game/location-progress/route.ts"), /hintUsed: Boolean\(row\.hint_used_at\)/);
  assert.match(read("lib/game-run.ts"), /hintUsed: Boolean\(row\.hint_used_at\)/);
  const playScreen = read("components/play-screen.tsx");
  assert.match(playScreen, /setHintUsedByTask/, "obrazovka si stav nápovědy z serveru neukládá");
  assert.match(playScreen, /row\.hintUsed/, "obrazovka nečte stav nápovědy z odpovědi serveru");
});

test("C6 – nápověda za zamčenou hru se nevydá a je omezená proti zneužití", () => {
  const route = read("app/api/game/reveal-hint/route.ts");
  assert.match(route, /resolveServerGameAccess\(/);
  assert.match(route, /if \(!access\.allowed\)/);
  assert.match(route, /checkRateLimitSafe\(/);
  assert.match(route, /forbidden_profile/, "endpoint musí ověřit, že profil patří přihlášenému");
  const guard = route.indexOf("resolveServerGameAccess(");
  for (const write of [".insert(", ".update("]) {
    const at = route.indexOf(write);
    if (at >= 0) {
      assert.ok(guard < at, `${write} je před ověřením přístupu`);
    }
  }
});

test("C7 – úkol bez nápovědy nemá mít tlačítko", () => {
  const server = read("lib/gameplay-server.ts");
  assert.match(server, /hasHint: Boolean\(\(task\.hint_text \?\? ""\)\.trim\(\)\)/);
  const playScreen = read("components/play-screen.tsx");
  assert.match(playScreen, /activeTask\.hasHint \?/, "tlačítko nápovědy není podmíněné");
});

test("C7b – otevřená nápověda přežije reload i druhé zařízení také na obrazovce", () => {
  // Regrese z produkčního ověření R25: server si otevření nápovědy pamatoval,
  // ale obrazovka po načtení znovu nabízela „ukázat za 5 bodů" za něco, co už
  // hráč zaplatil. Text nápovědy žije jen v paměti prohlížeče, stav v databázi.
  const playScreen = read("components/play-screen.tsx");
  assert.match(
    playScreen,
    /\) : hintUsedHere \? \(/,
    "obrazovka nerozlišuje už otevřenou nápovědu od neotevřené"
  );
  assert.match(playScreen, /Nápovědu k tomuhle úkolu už máš otevřenou/, "hráč se nedozví, že nápovědu už otevřel");
  assert.match(
    playScreen,
    /hintRefetchedRef[\s\S]*?handleRevealHint\(\{ silent: true \}\)/,
    "text už otevřené nápovědy se po načtení nedotahuje"
  );
  assert.match(playScreen, /if \(hintRefetchedRef\.current\[taskId\]\)/, "dotažení textu se může opakovat donekonečna");
});

test("C8 – hráč se před otevřením dozví cenu", () => {
  const playScreen = read("components/play-screen.tsx");
  assert.match(playScreen, /Ukázat nápovědu za \$\{POINTS_PER_TASK_WITH_HINT\} bodů/);
});

// ---------------------------------------------------------------------------
// D. POKUSY A UZAVŘENÝ VÝSLEDEK
// ---------------------------------------------------------------------------

test("D1 – tři špatné pokusy uzavřou úkol jako Nevím za nula bodů", () => {
  assert.equal(MAX_TASK_ATTEMPTS, 3);
  const route = read("app/api/game/submit-task-answer/route.ts");
  assert.match(route, /MAX_TASK_ATTEMPTS/);
  assert.match(route, /"unknown"/);
  assert.equal(pointsForTask("unknown", false), 0);
});

test("D2 – jednou uzavřený výsledek se už nemění", () => {
  const route = read("app/api/game/submit-task-answer/route.ts");
  assert.match(route, /awardedPointsForTask: pointsForTask\(existingRow\.status, hintUsed\)/);
  assert.match(route, /awardedPointsForTask: pointsForTask\(storedRow\.status, Boolean\(storedRow\.hint_used_at\)\)/);
});

test("D3 – zbývající pokusy se hráči píší česky", () => {
  assert.equal(formatRemainingAttempts(2), "Zbývají 2 pokusy.");
  assert.equal(formatRemainingAttempts(1), "Zbývá 1 pokus.");
  assert.equal(formatRemainingAttempts(0), "Další pokus už nemáš.");
  assert.equal(formatRemainingAttempts(5), "Zbývá 5 pokusů.");
  assert.ok(!/Zbývá \$\{attemptsLeft\} pokus\./.test(read("components/play-screen.tsx")));
});

// ---------------------------------------------------------------------------
// E. PRAVIDLO SPRÁVNOSTI: STRUKTUROVANÉ, NE HÁDANÉ Z TEXTU
// ---------------------------------------------------------------------------

const openTask = (correctAnswers: string[], minCorrectMatches?: number) => ({
  type: "question",
  correctAnswers,
  minCorrectMatches
});

test("E1 – bez minimálního počtu shod musí sedět celá odpověď", () => {
  const task = openTask(["16", "sestnact"]);
  assert.equal(isTaskAnswerCorrect(task, "16"), true);
  assert.equal(isTaskAnswerCorrect(task, "sestnact"), true);
  assert.equal(isTaskAnswerCorrect(task, "šestnáct"), true, "diakritika se ignoruje, tvar odpovídá");
  assert.equal(isTaskAnswerCorrect(task, "16 sestnact"), false, "bez pravidla musí sedět celá odpověď");
  assert.equal(isTaskAnswerCorrect(task, "17"), false);
  assert.equal(isTaskAnswerCorrect(task, ""), false);
});

test("E2 – diakritika a velikost písmen nerozhodují", () => {
  const task = openTask(["čtyři"]);
  assert.equal(isTaskAnswerCorrect(task, "Čtyři"), true);
  assert.equal(isTaskAnswerCorrect(task, "ctyri"), true);
  assert.equal(isTaskAnswerCorrect(task, "  ČTYŘI "), true);
});

test("E3 – „pro splnění stačí X“ bere počet uznávaných slov", () => {
  const task = openTask(["Rakousko", "Polsko", "Indonésie", "Monako", "Lotyšsko"], 3);
  assert.equal(isTaskAnswerCorrect(task, "Rakousko Polsko Monako"), true);
  assert.equal(isTaskAnswerCorrect(task, "rakousko, polsko"), false, "dvě z požadovaných tří nestačí");
  assert.equal(isTaskAnswerCorrect(task, "Rakousko Rakousko Rakousko"), false, "opakování se nepočítá třikrát");
  assert.equal(isTaskAnswerCorrect(task, "Rakousko Polsko Německo Monako"), true, "špatná navíc nevadí");
});

test("E4 – bez uznávaných odpovědí nelze uspět nikdy", () => {
  assert.equal(isTaskAnswerCorrect(openTask([], 2), "cokoli"), false);
  assert.equal(isTaskAnswerCorrect(openTask([]), "cokoli"), false);
  assert.equal(isTaskAnswerCorrect(null, "cokoli"), false);
});

test("E5 – odvozování z formulace zadání je pryč", () => {
  const server = read("lib/gameplay-server.ts");
  assert.ok(!/alespon/i.test(server), "v kódu zůstalo hledání alespoň N");
  assert.ok(!/MIN\\s\*\(\\d\+\)\\s\*:/i.test(server) && !/explicitMatch/.test(server), "v kódu zůstal prefix MIN n:");
  assert.ok(!/extractMinimumMatchCount/.test(server), "v kódu zůstalo odvozování z otázky");
  const validation = read("lib/task-validation.ts");
  assert.ok(!/MULTI_WORD_RULES|klamovka-cassel/.test(validation), "v kódu zůstala výjimka natvrdo");
  assert.match(
    read("lib/gameplay-server.ts"),
    /parseTaskCorrectnessRule\(rawCorrectAnswer[\s\S]*?min_correct_matches|min_correct_matches/,
    "pravidlo se nebere z databáze"
  );
});

test("E6 – text zadání „alespoň 3“ sám o sobě pravidlo nemění", () => {
  // Dřív by tahle formulace tiše zapnula režim „stačí 3 slova“. Teď rozhoduje jen sloupec.
  const task = openTask(["Rakousko", "Polsko", "Monako"]);
  assert.equal(isTaskAnswerCorrect(task, "Rakousko Polsko Monako"), false);
  assert.equal(isTaskAnswerCorrect(task, "Rakousko"), true);
});

test("E7 – Klamovka: stejné vstupy jako dnes projdou i po převodu obsahu", () => {
  // Úkoly psané dřív do jednoho řádku („16 sestnact“) migrace rozepisuje na řádky.
  assert.equal(isTaskAnswerCorrect(openTask(["16", "sestnact"]), "16"), true);
  assert.equal(isTaskAnswerCorrect(openTask(["12", "dvanáct"]), "dvanáct"), true);
  assert.equal(isTaskAnswerCorrect(openTask(["4", "ctyri", "čtyři"]), "čtyři"), true);

  // „Slovní hra“: dvě dlouhé řádky uznávaných slov, stačí dvě slova (dřív z „aspoň 2“ v textu).
  const slovniHra = openTask(
    [
      "les sál sála cela class seal sale scale case lace less sea ace ass ale lea sac",
      "les ale cela case čase sale sále sál sal sel šel sec seč lasce lásce cas čas"
    ],
    2
  );
  assert.equal(isTaskAnswerCorrect(slovniHra, "les sál"), true);
  assert.equal(isTaskAnswerCorrect(slovniHra, "les"), false);

  // „Vlajky“: osmnáct států, stačí tři (dřív z „alespoň 3“ v otázce).
  const vlajky = openTask(
    ["Rakousko", "Polsko", "Indonésie", "Monako", "Lotyšsko", "Japonsko", "Švýcarsko", "Dánsko", "Turecko"],
    3
  );
  assert.equal(isTaskAnswerCorrect(vlajky, "Polsko, Monako, Japonsko"), true);
  assert.equal(isTaskAnswerCorrect(vlajky, "Polsko a Monako"), false);
});

test("E8 – hráč se o pravidle dozví ze zadání, ne odhadem", () => {
  const playScreen = read("components/play-screen.tsx");
  assert.match(playScreen, /activeTask\.minCorrectMatches \?/);
  assert.ok(!/klamovka-cassel-5/.test(playScreen), "v obrazovce zůstala výjimka pro jeden úkol");
});

// ---------------------------------------------------------------------------
// F. PUBLIKAČNÍ KONTROLA
// ---------------------------------------------------------------------------

const stop = (title: string, order: number, tasks: Array<Partial<{ id: string; taskOrder: number; type: string; question: string; correctAnswer: string; options: unknown; minCorrectMatches: number | null }>>) => ({
  id: `stop-${order}`,
  title,
  order,
  tasks: tasks.map((task, index) => ({
    id: task.id ?? `task-${order}-${index + 1}`,
    stopTitle: title,
    taskOrder: task.taskOrder ?? index + 1,
    type: task.type ?? "otevrena",
    question: task.question ?? "Otázka",
    correctAnswer: task.correctAnswer ?? "odpoveď",
    options: task.options ?? null,
    minCorrectMatches: task.minCorrectMatches ?? null
  }))
});

test("F1 – hratelná hra publikaci projde", () => {
  const issues = findPublishBlockers([
    stop("Vchod", 1, [{ question: "Kolik hlav?", correctAnswer: "16\nsestnact" }]),
    stop("Kašna", 2, [{ type: "vyber", question: "Která?", correctAnswer: "vlevo", options: ["vlevo", "vpravo"] }])
  ]);
  assert.deepEqual(issues, []);
});

test("F2 – hra bez zastávek a bez úkolů se publikovat nedá", () => {
  assert.equal(findPublishBlockers([])[0].code, "no_stops");
  // Hra úplně bez úkolů je jeden srozumitelný problém, ne výčet prázdných zastávek.
  assert.equal(findPublishBlockers([stop("Vchod", 1, [])])[0].code, "no_tasks");
  assert.equal(findPublishBlockers([stop("A", 1, []), stop("B", 2, [])])[0].code, "no_tasks");
  // Prázdná zastávka uvnitř jinak hratelné hry se vypíše konkrétně.
  const oneEmptyStop = findPublishBlockers([
    stop("Vchod", 1, [{ question: "Kolik?", correctAnswer: "16" }]),
    stop("Kašna", 2, [])
  ]);
  assert.equal(oneEmptyStop.length, 1);
  assert.equal(oneEmptyStop[0].code, "stop_without_tasks");
  assert.match(oneEmptyStop[0].message, /Kašna/);
});

test("F3 – úkol bez správné odpovědi hru zablokuje a řekne kde", () => {
  const issues = findPublishBlockers([
    stop("Orloj", 1, [
      { question: "Rok na dveřích", correctAnswer: "" },
      { question: "Počet schodů", correctAnswer: "   " }
    ])
  ]);
  assert.equal(issues.length, 2);
  assert.ok(issues.every((issue) => issue.code === "missing_answer"));
  assert.match(issues[0].message, /Orloj/, "autor se nedozví, které zastávky se to týká");
  assert.match(issues[0].message, /úkol 1/, "autor se nedozví, kterého úkolu se to týká");
  assert.equal(issues[1].taskOrder, 2);
});

test("F4 – Budějovice v dnešním stavu publikaci neprojdou", () => {
  // Třináct úkolů bez správné odpovědi. Obsah se tímhle nijak nemění ani neopravuje.
  const budejovice = [
    stop("Radnice", 1, Array.from({ length: 5 }, () => ({ correctAnswer: "" }))),
    stop("Náměstí", 2, Array.from({ length: 8 }, () => ({ correctAnswer: "" })))
  ];
  const issues = findPublishBlockers(budejovice);
  assert.equal(issues.filter((issue) => issue.code === "missing_answer").length, 13);
  assert.ok(issues.length > 0, "nehratelná hra by šla publikovat");
});

test("F5 – výběr z možností musí mít možnosti a odpověď mezi nimi", () => {
  const missingOptions = findPublishBlockers([
    stop("Vchod", 1, [{ type: "vyber", question: "Která?", correctAnswer: "vlevo", options: [] }])
  ]);
  assert.ok(missingOptions.some((issue) => issue.code === "choice_without_options"));

  const answerOutside = findPublishBlockers([
    stop("Vchod", 1, [{ type: "vyber", question: "Která?", correctAnswer: "nahoře", options: ["vlevo", "vpravo"] }])
  ]);
  assert.ok(answerOutside.some((issue) => issue.code === "choice_answer_not_in_options"));

  const withDiacritics = findPublishBlockers([
    stop("Vchod", 1, [{ type: "vyber", question: "Která?", correctAnswer: "vlevo", options: ["Vlevo", "Vpravo"] }])
  ]);
  assert.deepEqual(withDiacritics, [], "velikost písmen nesmí blokovat publikaci");
});

test("F6 – nesmyslné „pro splnění stačí X“ hru zablokuje", () => {
  const tooMany = findPublishBlockers([
    stop("Hřiště", 1, [{ question: "Vlajky", correctAnswer: "Polsko\nMonako", minCorrectMatches: 3 }])
  ]);
  assert.ok(tooMany.some((issue) => issue.code === "invalid_min_matches"));

  const ok = findPublishBlockers([
    stop("Hřiště", 1, [{ question: "Vlajky", correctAnswer: "Polsko\nMonako\nPeru", minCorrectMatches: 3 }])
  ]);
  assert.deepEqual(ok, []);
});

test("F7 – chybějící zadání je taky důvod k zablokování", () => {
  const issues = findPublishBlockers([stop("Vchod", 1, [{ question: "  ", correctAnswer: "16" }])]);
  assert.ok(issues.some((issue) => issue.code === "missing_question"));
});

test("F8 – uznávané odpovědi se dělí stejně jako v herní vrstvě", () => {
  assert.deepEqual(splitAcceptedAnswers("16\nsestnact"), ["16", "sestnact"]);
  assert.deepEqual(splitAcceptedAnswers("a, b; c"), ["a", "b", "c"]);
  assert.deepEqual(splitAcceptedAnswers(""), []);
  assert.deepEqual(splitAcceptedAnswers(null), []);
});

test("F9 – kontrola běží na serveru před zápisem a autor dostane konkrétní seznam", () => {
  const actions = read("app/admin/missions/actions.ts");
  assert.match(actions, /"use server"/);
  assert.match(actions, /collectPublishBlockers\(/);
  const toggle = actions.slice(actions.indexOf("export async function toggleMissionPublishAction"));
  const check = toggle.indexOf("collectPublishBlockers(");
  const update = toggle.indexOf("update({ is_published");
  assert.ok(check > 0 && update > 0, "akce nekontroluje nebo nepublikuje");
  assert.ok(check < update, "publikace se zapisuje dřív, než se zkontroluje");
  assert.match(toggle, /if \(blockers\.length === 0\)/, "zápis není podmíněný výsledkem kontroly");
  assert.match(actions, /status=publish_blocked&issues=/);

  const page = read("app/admin/missions/[id]/page.tsx");
  assert.match(page, /publish_blocked/);
  assert.match(page, /publishIssues\.map/, "seznam problémů se autorovi nezobrazí");
});

test("F10 – stažení z publikace se nikdy neblokuje", () => {
  const actions = read("app/admin/missions/actions.ts");
  const toggle = actions.slice(actions.indexOf("export async function toggleMissionPublishAction"));
  assert.match(
    toggle,
    /if \(nextPublished\) \{\s*blockers = await collectPublishBlockers\(/,
    "kontrola musí platit jen pro zapnutí publikace"
  );
});

// ---------------------------------------------------------------------------
// G. ÚVODNÍ PŘÍBĚH A AUTORSKÝ ZÁVĚR
// ---------------------------------------------------------------------------

test("G1 – úvodní obrazovka se ukazuje jen při skutečném začátku výpravy", () => {
  const detail = read("components/location-detail-screen.tsx");
  assert.match(detail, /started\.created \? "&intro=1" : ""/, "intro se zapíná i při pokračování");
  const provider = read("components/app-state-provider.tsx");
  assert.match(provider, /created: boolean|created:\s*Boolean/, "start výpravy neříká, jestli opravdu vznikla");
});

test("G2 – úvodní obrazovka nese jméno hry, obrázek, autorský text a tlačítko", () => {
  const playScreen = read("components/play-screen.tsx");
  const intro = playScreen.slice(playScreen.indexOf("if (introOpen)"), playScreen.indexOf("if (introOpen)") + 2000);
  assert.match(intro, /location\.name/, "chybí jméno hry");
  assert.match(intro, /location\.image|heroImage|<img/, "chybí vizuál");
  assert.match(intro, /location\.introStory/, "chybí autorský úvodní text");
  assert.match(intro, /Vyrážíme/, "chybí tlačítko do hry");
});

test("G3 – rozehraná výprava úvod nezopakuje", () => {
  const playScreen = read("components/play-screen.tsx");
  assert.match(playScreen, /setIntroOpen\(false\)/, "intro se nikdy nezavírá podle stavu výpravy");
  assert.match(playScreen, /searchParams\.get\("intro"\) === "1"/);
});

test("G4 – závěr hry vydává databáze, konstanta je jen náhrada", () => {
  const server = read("lib/gameplay-server.ts");
  assert.match(server, /endingTitle: \(mission\.ending_title \?\? ""\)\.trim\(\) \|\| "Mise dokončena"/);
  assert.match(server, /endingTitle: \(mission\?\.ending_title \?\? ""\)\.trim\(\) \|\| location\.endingTitle/);
  assert.match(server, /ending_player_message/);
});

test("G5 – závěr Klamovky se přesouvá z kódu do databáze doslova", () => {
  const migration = read("supabase/migrations/20260909115520_r25_hints_endings_and_answer_rules.sql");
  const mock = read("lib/mock-data.ts");
  assert.match(migration, /ending_title = 'Klamovka zase vypráví'/);
  assert.match(mock, /endingTitle: "Klamovka zase vypráví"/, "původní text v kódu je pryč, nelze porovnat");
  assert.match(migration, /rýžový špaček/, "osobní vzkaz hráči se do databáze nepřenáší");
});

test("G6 – závěr se dá napsat v Mozku", () => {
  const form = read("components/admin/mission-form.tsx");
  assert.match(form, /ending_title/);
  assert.match(form, /ending_text/);
  assert.match(form, /ending_player_message/);
  const actions = read("app/admin/missions/actions.ts");
  assert.match(actions, /ending_player_message/);
});

test("G7 – nápověda a „pro splnění stačí X“ se dají napsat v Mozku", () => {
  const form = read("components/admin/task-form.tsx");
  assert.match(form, /hint_text/);
  assert.match(form, /min_correct_matches/);
  const actions = read("app/admin/stops/actions.ts");
  assert.match(actions, /hint_text/);
  assert.match(actions, /min_correct_matches/);
});

// ---------------------------------------------------------------------------
// H. MIGRACE
// ---------------------------------------------------------------------------

test("H1 – migrace nic nemaže a dá se pustit opakovaně", () => {
  const migration = read("supabase/migrations/20260909115520_r25_hints_endings_and_answer_rules.sql");
  // Komentáře se do posouzení nepočítají, hodnotí se jen příkazy.
  const statements = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.ok(!/drop\s+table|truncate|delete\s+from/i.test(statements), "migrace maže data");
  const addColumns = migration.match(/add column/gi) ?? [];
  const idempotent = migration.match(/add column if not exists/gi) ?? [];
  assert.equal(addColumns.length, idempotent.length, "některý sloupec se přidává bez if not exists");
});

test("H2 – migrace uzavírá rozjezd mezi produkcí a migracemi", () => {
  const migration = read("supabase/migrations/20260909115520_r25_hints_endings_and_answer_rules.sql");
  assert.match(migration, /mission_tasks add column if not exists hint_text/);
  assert.match(migration, /mission_tasks add column if not exists answer_mode/);
});

test("H3 – obsahová část migrace míří jen na Klamovku a jen na dnešní hodnoty", () => {
  const migration = read("supabase/migrations/20260909115520_r25_hints_endings_and_answer_rules.sql");
  const updates = migration.split("\n").filter((line) => line.startsWith("update "));
  assert.ok(updates.length > 0, "migrace nepřevádí žádný obsah");
  for (const block of migration.split("update ").slice(1)) {
    assert.match(block, /where[\s\S]*?id = '/, "update bez podmínky na konkrétní řádek");
  }
  assert.ok(
    !/c81ee324-c315-41db-9777-b43c96759dee/.test(migration),
    "migrace sahá na Budějovice"
  );
  assert.match(migration, /and correct_answer = '16 sestnact'/, "převod nechrání proti opakovanému spuštění");
});
