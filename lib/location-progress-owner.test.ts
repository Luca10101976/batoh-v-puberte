import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { POINTS_PER_TASK, POINTS_PER_TASK_WITH_HINT } from "./game-rules.ts";
import { pointsForTask, scoreTaskProgress } from "./mission-completion.ts";
import { buildProfileGameSummaries } from "./profile-games-model.ts";

// Rozehraná hra v child_location_progress musí nést UUID hráče. Kaskáda při
// smazání profilu jde jen přes child_profile_id; primární klíč je textový kód
// bez FK. Zápis rozehrání byl starší než sloupec a UUID nezapisoval, takže
// nedokončená hra po smazání profilu osiřela.
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const bezKomentaru = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "");

const ROUTE = () => bezKomentaru(read("app/api/game/submit-task-answer/route.ts"));

/** Vrátí literál objektu, který se posílá do insert()/update() nad danou tabulkou. */
function zapisyDoTabulky(src: string, tabulka: string, operace: "insert" | "update") {
  const vzor = new RegExp(`from\\("${tabulka}"\\)\\s*\\.${operace}\\(\\{`, "g");
  const nalezy: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = vzor.exec(src))) {
    const start = m.index + m[0].length - 1;
    let hloubka = 0;
    for (let i = start; i < src.length; i++) {
      if (src[i] === "{") hloubka++;
      if (src[i] === "}") hloubka--;
      if (hloubka === 0) {
        nalezy.push(src.slice(start, i + 1));
        break;
      }
    }
  }
  return nalezy;
}

test("1 – první odpověď vytvoří rozehraný řádek s child_profile_id = ownProfile.id", () => {
  const src = ROUTE();
  const inserty = zapisyDoTabulky(src, "child_location_progress", "insert");
  assert.ok(inserty.length >= 1, "musí existovat insert rozehraného řádku");
  const hlavni = inserty.find((literal) => /status: "in_progress"/.test(literal));
  assert.ok(hlavni, "hlavní insert nese status in_progress");
  assert.match(hlavni!, /child_profile_id: ownProfile\.id/, "insert musí nést UUID hráče");
  assert.match(hlavni!, /profile_code: ownProfile\.profile_code/, "textový kód zůstává (PK se nemění)");
});

test("2 – další odpověď (update rozehraného řádku) zapisuje správné child_profile_id", () => {
  const src = ROUTE();
  const updaty = zapisyDoTabulky(src, "child_location_progress", "update");
  const hlavni = updaty.find((literal) => /status: "in_progress"/.test(literal));
  assert.ok(hlavni, "hlavní update nese status in_progress");
  assert.match(hlavni!, /child_profile_id: ownProfile\.id/, "update musí nést UUID hráče");
});

test("3 – starší řádek s NULL se při další odpovědi opraví (update běží bez podmínky na NULL)", () => {
  const src = ROUTE();
  const zacatek = src.indexOf('} else if (locationProgressRow.status !== "completed") {');
  assert.ok(zacatek > 0, "update větev existujícího nedokončeného řádku");
  const vetev = src.slice(zacatek, src.indexOf("return NextResponse.json({", zacatek));
  assert.match(vetev, /child_profile_id: ownProfile\.id/);
  // filtruje se jen podle profile_code + location_id, ne podle child_profile_id,
  // takže řádek s NULL se opraví stejně jako řádek s hodnotou
  assert.match(vetev, /\.eq\("profile_code", ownProfile\.profile_code\)\s*\.eq\("location_id", locationId\)/);
  assert.doesNotMatch(vetev, /\.is\("child_profile_id"/, "žádná podmínka na NULL – samoopravný zápis platí vždy");
});

test("3b – ownProfile.id je v route ověřené dřív, než se cokoli zapisuje", () => {
  const src = ROUTE();
  const kontrola = src.indexOf("if (!ownProfile?.id) {");
  const zapis = src.indexOf('from("child_location_progress").insert(');
  assert.ok(kontrola > 0 && zapis > kontrola, "403 pojistka předchází zápisu");
  assert.match(src.slice(kontrola, kontrola + 160), /forbidden_profile/);
});

test("4 – dokončení hry dál zapisuje child_profile_id při insertu i updatu", () => {
  const src = bezKomentaru(read("lib/game-completion.ts"));
  assert.match(src, /child_profile_id: entry\.childProfileId,\s*\n\s*location_id: args\.locationId/, "insert dokončení");
  assert.match(src, /completion_source: args\.source,\s*\n\s*child_profile_id: entry\.childProfileId/, "update dokončení");
});

test("5 – scoring a bodování odpovědí se nezměnily", () => {
  assert.equal(pointsForTask("correct", false), POINTS_PER_TASK);
  assert.equal(pointsForTask("correct", true), POINTS_PER_TASK_WITH_HINT);
  assert.equal(pointsForTask("unknown", false), 0);
  assert.equal(pointsForTask("wrong", false), 0);
  const vysledek = scoreTaskProgress(
    ["a", "b", "c"],
    [
      { task_id: "a", status: "correct" },
      { task_id: "b", status: "unknown" },
      { task_id: "c", status: "wrong" }
    ]
  );
  assert.equal(vysledek.score, POINTS_PER_TASK);
  assert.equal(vysledek.correctTasks, 1);
  // stávající pravidlo: „wrong" není uzavřený úkol, počítá se jako chybějící
  // a spolu s Nevím tvoří unknownTasks (1 Nevím + 1 nevyřešený = 2)
  assert.equal(vysledek.resolvedTasks, 2);
  assert.equal(vysledek.missingTasks, 1);
  assert.equal(vysledek.unknownTasks, 2);
  // odpověď do child_task_progress nese UUID stejně jako dřív
  assert.match(ROUTE(), /child_profile_id: ownProfile\.id,\s*\n\s*profile_code: ownProfile\.profile_code,\s*\n\s*session_id: run\.id/);
});

test("6 – resume se nezměnilo: čte se dál podle profile_code a vede na správný úkol", () => {
  const src = ROUTE();
  assert.match(src, /from\("child_location_progress"\)\s*\.select\("profile_code, location_id, status"\)\s*\.eq\("profile_code", ownProfile\.profile_code\)/);
  const [hra] = buildProfileGameSummaries({
    completedLocationIds: [],
    activeRuns: [
      {
        locationId: "klamovka",
        title: null,
        city: null,
        updatedAt: null,
        position: { episodeIndex: 1, taskIndex: 2, stopName: "Cassel" }
      }
    ],
    playedGames: {},
    locationBestScores: {},
    lastCompletedAt: {}
  });
  assert.equal(hra.href, "/play/klamovka?episode=2&task=3");
});

test("7 – nic jiného v tabulce se nedotklo: PK, čtení podle kódu a legacy větve zůstávají", () => {
  const src = ROUTE();
  assert.match(src, /insertInProgressError\?\.code === "42703"/, "legacy větev bez sloupců zůstává");
  assert.match(src, /updateInProgressError\?\.code === "42703"/);
  // poslední známá migrace je R44 (20260911200000); porovnává se jen časové razítko, ne přípona
  const migrace = fs
    .readdirSync(path.join(ROOT, "supabase/migrations"))
    .map((f) => f.slice(0, 14))
    .filter((razitko) => /^\d{14}$/.test(razitko) && razitko > "20260911200000");
  assert.deepEqual(migrace, [], "oprava nemá žádnou novou migraci");
});
