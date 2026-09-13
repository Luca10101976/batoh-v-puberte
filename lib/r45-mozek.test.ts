import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { slugifyCityName, validateCity } from "./cities.ts";
import { findMissionPublishBlockers, findPublishBlockers, splitAcceptedAnswers } from "./mission-publish-validation.ts";
import { getCanonicalCorrectAnswer } from "./mission-task-normalization.ts";
import { isTaskAnswerCorrect } from "./answer-matching.ts";

// R45: UX Mozku. Bezpečné mazání, poctivé stavy, kontrola bez publikace,
// pořadí šipkami, neuložené změny a automatický identifikátor města.
// Pravidla publikace se nemění – kontrola pouští tentýž modul.
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const bezKomentaru = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "");

const PREHLED = () => bezKomentaru(read("app/admin/missions/page.tsx"));
const HRA = () => bezKomentaru(read("app/admin/missions/[id]/page.tsx"));
const ZASTAVKA = () => bezKomentaru(read("app/admin/stops/[id]/page.tsx"));
const MISSION_ACTIONS = () => bezKomentaru(read("app/admin/missions/actions.ts"));
const STOP_ACTIONS = () => bezKomentaru(read("app/admin/stops/actions.ts"));
const CITY_ACTIONS = () => bezKomentaru(read("app/admin/cities/actions.ts"));
const CITY_FORM = () => bezKomentaru(read("components/admin/city-form.tsx"));
const TASK_FORM = () => bezKomentaru(read("components/admin/task-form.tsx"));
const STOP_FORM = () => bezKomentaru(read("components/admin/stop-form.tsx"));
const NAHLED = () => bezKomentaru(read("app/admin/missions/[id]/preview/page.tsx"));
const GUARD = () => bezKomentaru(read("components/admin/unsaved-changes.tsx"));

// ═══════════ A. Mazání zastavení ═══════════

test("A1 – první kliknutí na Smazat u zastavení nemaže, jen otevře potvrzení", () => {
  const src = HRA();
  const seznam = src.slice(src.indexOf("orderedStops.map("), src.indexOf("Smazat hru"));
  assert.match(seznam, /href=\{`\/mozek\/missions\/\$\{mission\.id\}\?confirmStop=\$\{stop\.id\}`\}/);
  // v řádku zastavení už není přímý odesílací formulář mazání
  const radek = seznam.slice(0, seznam.indexOf("confirmingStopId === stop.id"));
  assert.doesNotMatch(radek, /action=\{deleteStopAction\}/, "mazání se neodesílá z řádku");
});

test("A2 – potvrzení pojmenuje zastavení a varuje před smazáním jeho úkolů", () => {
  const src = HRA();
  const blok = src.slice(src.indexOf("confirmingStopId === stop.id"), src.indexOf("</article>"));
  assert.match(blok, /Smazat zastavení „\{stop\.title\}“\?/);
  assert.match(blok, /Smazáním zastavení se smažou i všechny jeho úkoly/);
  assert.match(blok, /Ano, smazat „\{stop\.title\}“/);
  assert.match(blok, /Nechat být/);
});

test("A3 – smazat jde až potvrzovacím formulářem se serverovým confirm", () => {
  const src = HRA();
  const blok = src.slice(src.indexOf("confirmingStopId === stop.id"), src.indexOf("</article>"));
  assert.match(blok, /action=\{deleteStopAction\}/);
  assert.match(blok, /name="confirm" value="smazat"/);
  assert.match(MISSION_ACTIONS(), /const confirmed = normalizeText\(formData\.get\("confirm"\)\) === "smazat";/);
});

test("A4 – serverové blokování odehrané hry zůstává beze změny", () => {
  const akce = MISSION_ACTIONS();
  const zacatek = akce.indexOf("export async function deleteStopAction");
  assert.ok(zacatek > 0, "deleteStopAction existuje");
  const fn = akce.slice(zacatek);
  assert.match(fn, /guardContentDelete\(usage, "stop"\)/);
  assert.match(fn, /status=delete_blocked&issues=/);
  assert.match(HRA(), /\{isUsed \? null : \(/, "u odehrané hry se mazání vůbec nenabízí");
});

// ═══════════ B. Mazání úkolu ═══════════

test("B1 – Smazat úkol nejdřív otevře potvrzení", () => {
  const src = ZASTAVKA();
  assert.match(src, /href=\{`\/mozek\/stops\/\$\{stop\.id\}\?confirmTask=\$\{task\.id\}`\}/);
  const hlavicka = src.slice(src.indexOf("tasks.map((task, index)"), src.indexOf("confirmingTaskId === task.id"));
  assert.doesNotMatch(hlavicka, /action=\{deleteTaskAction\}/, "mazání se neodesílá z hlavičky úkolu");
});

test("B2 – potvrzení říká, který úkol se maže, a teprve pak maže", () => {
  const src = ZASTAVKA();
  const blok = src.slice(src.indexOf("confirmingTaskId === task.id"), src.indexOf("<TaskForm stopId={stop.id} missionId={stop.mission_id} task={task}"));
  assert.match(blok, /Smazat úkol \{index \+ 1\}\?/);
  assert.match(blok, /task\.question/, "ukazuje zadání úkolu");
  assert.match(blok, /Ano, smazat úkol \{index \+ 1\}/);
  assert.match(blok, /action=\{deleteTaskAction\}/);
  assert.match(blok, /name="confirm" value="smazat"/);
  assert.match(blok, /Nechat být/);
});

test("B3 – serverová ochrana úkolu zůstává", () => {
  const akce = STOP_ACTIONS();
  const fn = akce.slice(akce.indexOf("export async function deleteTaskAction"), akce.indexOf("export async function moveTaskAction"));
  assert.match(fn, /guardContentDelete\(usage, "task"\)/);
  assert.match(fn, /status=delete_blocked&issues=/);
  assert.match(fn, /status=delete_not_confirmed/);
});

// ═══════════ C. Poctivé stavy ═══════════

test("C1 – editor zastávky zná všechny stavy, které server posílá", () => {
  const src = ZASTAVKA();
  const stavy = src.slice(src.indexOf("function statusText"), src.indexOf("export default async function StopEditPage"));
  for (const stav of ["delete_blocked", "delete_not_confirmed", "reorder_blocked", "reorder_edge", "reordered", "error"]) {
    assert.match(stavy, new RegExp(`case "${stav}":`), `chybí stav ${stav}`);
  }
});

test("C2 – žádný stav posílaný serverem nezůstane bez hlášky", () => {
  const akce = STOP_ACTIONS();
  const posilane = new Set(
    [...akce.matchAll(/\/mozek\/stops\/\$\{stopId\}\?status=([a-z_]+)/g)].map((m) => m[1])
  );
  assert.ok(posilane.size >= 6, "server posílá víc stavů");
  const stavy = ZASTAVKA();
  for (const stav of posilane) {
    assert.match(stavy, new RegExp(`case "${stav}":`), `server posílá ${stav}, obrazovka ho neumí`);
  }
});

test("C3 – důvod od serveru se vypíše, ne zahodí", () => {
  const src = ZASTAVKA();
  assert.match(src, /const issues = \(resolvedSearchParams\?\.issues \?\? ""\)/);
  assert.match(src, /issues\.map\(\(issue\) =>/);
});

// ═══════════ D. Hlavní přehled ═══════════

test("D1 – přehled ukazuje hry a nechává publikaci dostupnou", () => {
  const src = PREHLED();
  assert.match(src, /missions\.map\(\(mission\)/);
  assert.match(src, /action=\{toggleMissionPublishAction\}/, "publikace zůstává zkratkou v seznamu");
  assert.match(src, /\{mission\.is_published \? "Vypnout publikaci" : "Publikovat"\}/);
  assert.match(src, /href=\{`\/mozek\/missions\/\$\{mission\.id\}`\}/, "editace hry je dostupná");
});

test("D2 – výpis obsahu zastavení a URL obrázků je z přehledu pryč", () => {
  const src = PREHLED();
  assert.doesNotMatch(src, /image_url/, "žádné URL obrázků");
  assert.doesNotMatch(src, /Obrázek:/);
  assert.doesNotMatch(src, /stop\.description/, "popisy zastávek patří do detailu hry");
  assert.doesNotMatch(src, /missionStops\.map\(/, "zastávky se v přehledu nevypisují");
  assert.match(src, /zastavení · otevři hru a uprav je/, "zůstává jen počet");
});

test("D3 – publikace už nepřebíjí otevření hry", () => {
  const src = PREHLED();
  const otevrit = src.indexOf("Otevřít hru");
  const publikace = src.indexOf("action={toggleMissionPublishAction}");
  assert.ok(otevrit > 0 && publikace > otevrit, "hlavní akce je nad publikací");
  const blokPublikace = src.slice(publikace, publikace + 700);
  assert.doesNotMatch(blokPublikace, /bg-lime[^/]/, "publikace není zvýrazněná plnou barvou");
});

// ═══════════ E. Zkontrolovat hru ═══════════

test("E1 – akce Zkontrolovat hru existuje a je v detailu hry", () => {
  assert.match(MISSION_ACTIONS(), /export async function checkMissionAction\(formData: FormData\)/);
  const src = HRA();
  assert.match(src, /action=\{checkMissionAction\}/);
  assert.match(src, />\s*Zkontrolovat hru\s*</);
});

test("E2 – kontrola používá tatáž pravidla jako publikace", () => {
  const akce = MISSION_ACTIONS();
  const check = akce.slice(akce.indexOf("export async function checkMissionAction"), akce.indexOf("export async function deleteMissionAction"));
  assert.match(check, /collectPublishBlockers\(/, "stejná autoritativní pravidla");
  // publikace používá tutéž funkci – pravidla nejsou zdvojená
  const publish = akce.slice(akce.indexOf("export async function toggleMissionPublishAction"));
  assert.match(publish, /collectPublishBlockers\(/);
  assert.equal((akce.match(/async function collectPublishBlockers/g) ?? []).length, 1, "jediná definice pravidel");
});

test("E3 – kontrola nesahá na publikaci ani na hráčská data", () => {
  const akce = MISSION_ACTIONS();
  const check = akce.slice(akce.indexOf("export async function checkMissionAction"), akce.indexOf("export async function deleteMissionAction"));
  assert.doesNotMatch(check, /is_published/, "nemění stav publikace");
  assert.doesNotMatch(check, /first_published_at/);
  assert.doesNotMatch(check, /\.update\(|\.insert\(|\.delete\(/, "nic nezapisuje");
});

test("E4 – výsledek kontroly má vlastní hlášky", () => {
  const src = HRA();
  assert.match(src, /case "check_ok":/);
  assert.match(src, /case "check_failed":/);
  assert.match(src, /Hra prošla kontrolou/);
  assert.match(src, /Než půjde publikovat, oprav tohle:/);
  assert.match(MISSION_ACTIONS(), /status=check_failed&issues=\$\{encodePublishIssues\(blockers\)\}/);
});

test("E5 – pravidla kontroly opravdu najdou nedohratelnou hru a pustí hotovou", () => {
  const mission = {
    id: "m1",
    title: "Zkušební hra",
    heroImageUrl: "https://example.test/a.png",
    endingTitle: "Konec",
    endingText: "Text",
    city: "Praha",
    unlockAfterMissionId: null
  };
  const spatna = findMissionPublishBlockers({
    mission,
    stops: [{ id: "s1", title: "Cassel", order: 1, tasks: [{ id: "t1", stopTitle: "Cassel", taskOrder: 1, type: "otevrena", question: "Otázka?", correctAnswer: "", options: null }] }]
  });
  assert.ok(spatna.some((issue) => issue.code === "missing_answer"), "chybějící odpověď se pozná");
  const dobra = findMissionPublishBlockers({
    mission,
    stops: [{ id: "s1", title: "Cassel", order: 1, tasks: [{ id: "t1", stopTitle: "Cassel", taskOrder: 1, type: "otevrena", question: "Otázka?", correctAnswer: "16", options: null }] }]
  });
  assert.deepEqual(dobra, [], "hotová hra projde");
});

// ═══════════ F. Publikovaná hra ═══════════

test("F1 – publikovaná hra upozorní, že změny jdou hráčům hned", () => {
  const src = HRA();
  assert.match(src, /\{mission\.is_published \? \([\s\S]{0,400}Hra je publikovaná\. Uložené změny hráči uvidí okamžitě\./);
});

test("F2 – u konceptu se upozornění neukáže a ukládání zůstává bez potvrzení", () => {
  const src = HRA();
  const zacatek = src.indexOf("Hra je publikovaná. Uložené změny");
  const podminka = src.slice(Math.max(0, zacatek - 300), zacatek);
  assert.match(podminka, /mission\.is_published \? \(/, "hláška visí na publikovaném stavu");
  assert.doesNotMatch(src, /confirm=save|potvrď uložení/i, "uložení nedostalo potvrzovací krok");
});

// ═══════════ G. Pořadí ═══════════

test("G1 – zastávky i úkoly se řadí šipkami", () => {
  assert.match(HRA(), /action=\{moveStopAction\}/);
  assert.match(HRA(), /aria-label="Posunout nahoru"/);
  assert.match(ZASTAVKA(), /action=\{moveTaskAction\}/);
  assert.match(ZASTAVKA(), /aria-label="Posunout úkol nahoru"/);
  assert.match(ZASTAVKA(), /aria-label="Posunout úkol dolů"/);
});

test("G2 – krajní šipky jsou vypnuté", () => {
  assert.match(HRA(), /disabled=\{index === 0\}/);
  assert.match(HRA(), /disabled=\{index === orderedStops\.length - 1\}/);
  assert.match(ZASTAVKA(), /disabled=\{index === 0\}/);
  assert.match(ZASTAVKA(), /disabled=\{index === tasks\.length - 1\}/);
});

test("G3 – ruční číslo pořadí zmizelo z běžné editace", () => {
  assert.doesNotMatch(STOP_FORM(), /name="order"/, "zastávka nemá pole Pořadí");
  assert.doesNotMatch(TASK_FORM(), /name="order"/, "úkol nemá pole Pořadí");
  assert.doesNotMatch(bezKomentaru(read("components/admin/stop-new-form.tsx")), /name="order"/);
});

test("G4 – bez zadaného čísla si pořadí dopočítá server: úprava nechá, nový obsah přidá na konec", () => {
  const akce = STOP_ACTIONS();
  assert.match(akce, /const order = orderRaw \? parseNonNegativeInt\(orderRaw\) : "auto";/);
  assert.match(akce, /async function nextOrderFor\(/);
  assert.match(akce, /async function currentOrderOf\(/);
  assert.match(akce, /order === "auto" \? await nextOrderFor\(supabase, "mission_stops", "mission_id", missionId\)/);
  assert.match(akce, /order === "auto" \? await currentOrderOf\(supabase, "mission_stops", stopId\)/);
  assert.match(akce, /order === "auto" \? await nextOrderFor\(supabase, "mission_tasks", "stop_id", stopId\)/);
  assert.match(akce, /order === "auto" \? await currentOrderOf\(supabase, "mission_tasks", taskId\)/);
  assert.equal((akce.match(/order: resolvedOrder/g) ?? []).length, 4, "všechny čtyři zápisy používají dopočtené pořadí");
});

test("G5 – běžné ovládání nemůže vyrobit dvě stejná čísla", () => {
  const akce = STOP_ACTIONS();
  // úprava pořadí nemění, nový obsah dostane max+1
  assert.match(akce, /\.order\("order", \{ ascending: false \}\)\s*\.limit\(1\)/);
  assert.match(akce, /return \(data\?\.order \?\? 0\) \+ 1;/);
  // duplicitní pořadí je navíc blokerem publikace
  const blokery = read("lib/mission-publish-validation.ts");
  assert.match(blokery, /duplicate_stop_order/);
  assert.match(blokery, /duplicate_task_order/);
});

test("G6 – serverová blokace přeskládání zůstává", () => {
  assert.match(MISSION_ACTIONS(), /guardReorder\(/);
  assert.match(STOP_ACTIONS(), /guardReorder\(/);
  assert.match(STOP_ACTIONS(), /status=reorder_blocked/);
});

// ═══════════ H. Neuložené změny ═══════════

test("H1 – všechny editační formuláře hlásí neuložené změny", () => {
  for (const soubor of ["mission-form", "stop-form", "task-form", "city-form", "stop-new-form"]) {
    const src = bezKomentaru(read(`components/admin/${soubor}.tsx`));
    assert.match(src, /useUnsavedChanges\(state\.success, state\.error\)/, `${soubor}: chybí hlídání`);
    assert.match(src, /\{\.\.\.formProps\}/, `${soubor}: formulář nehlásí změny`);
    assert.match(src, /<UnsavedChangesBadge dirty=\{dirty\} \/>/, `${soubor}: chybí značka`);
  }
  assert.match(GUARD(), /Neuložené změny/);
});

test("H2 – úspěšné uložení stav vyčistí, neúspěšné ho vrátí", () => {
  const src = GUARD();
  assert.match(src, /if \(savedSignal\) \{\s*setDirty\(false\);/);
  assert.match(src, /if \(errorSignal\) \{\s*setDirty\(true\);/);
});

test("H3 – odeslání formuláře nevyvolá falešné varování", () => {
  const src = GUARD();
  assert.match(src, /onSubmit: \(\) => setDirty\(false\)/);
  const odkazy = src.slice(src.indexOf("const handleClick"));
  assert.match(odkazy, /closest\?\.\("a\[href\]"\)/, "hlídají se odkazy, ne odesílací tlačítka");
});

test("H4 – odchod z rozepsaného formuláře se zeptá a zrušení ho zachová", () => {
  const src = GUARD();
  assert.match(src, /window\.confirm\("Máš neuložené změny\. Opravdu chceš odejít a přijít o ně\?"\)/);
  assert.match(src, /if \(!leave\) \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
  assert.match(src, /addEventListener\("beforeunload"/, "chrání i zavření karty a refresh");
  assert.match(src, /if \(!dirty\) \{\s*return;\s*\}[\s\S]{0,200}addEventListener\("beforeunload"/, "po uložení se navigace neblokuje");
});

test("H5 – autosave nevznikl", () => {
  for (const soubor of ["mission-form", "stop-form", "task-form", "city-form"]) {
    assert.doesNotMatch(bezKomentaru(read(`components/admin/${soubor}.tsx`)), /setInterval|autosave/i);
  }
});

// ═══════════ I. Náhled ═══════════

test("I1 – náhled už netvrdí, že hráč uvidí obecnou větu", () => {
  const src = NAHLED();
  assert.doesNotMatch(src, /obecnou větu/);
  assert.match(src, /bez vlastního textu – hráč uvidí jen název dalšího místa/);
});

test("I2 – náhled mluví stejně jako formulář zastávky", () => {
  assert.match(STOP_FORM(), /uvidí jen název dalšího místa a nic víc/);
  assert.match(NAHLED(), /jen název dalšího místa/);
});

// ═══════════ J. Identifikátor města ═══════════

test("J1 – nové město dostane identifikátor z názvu, včetně diakritiky", () => {
  assert.equal(slugifyCityName("České Budějovice"), "ceske-budejovice");
  assert.equal(slugifyCityName("Žďár nad Sázavou"), "zdar-nad-sazavou");
  assert.equal(slugifyCityName("Praha"), "praha");
  const vysledek = validateCity({ name: "Ústí nad Labem", slug: "" });
  assert.ok(vysledek.ok);
  assert.equal(vysledek.ok && vysledek.value.slug, "usti-nad-labem");
});

test("J2 – formulář identifikátor nenabízí k ručnímu psaní", () => {
  const src = CITY_FORM();
  assert.doesNotMatch(src, /name="slug"/, "žádné vstupní pole identifikátoru");
  assert.match(src, /Vytvoří se z názvu/, "u nového města se vysvětlí, jak vznikne");
  assert.match(src, /\{city\.slug\}/, "u existujícího se jen ukáže");
  assert.match(src, /Identifikátor zůstává stejný i po přejmenování města/);
});

test("J3 – přejmenování města identifikátor nepřepíše", () => {
  const akce = CITY_ACTIONS();
  const update = akce.slice(akce.indexOf("export async function updateCityAction"), akce.indexOf("export async function toggleCityActiveAction"));
  assert.doesNotMatch(update, /slug:/, "update neposílá slug");
  assert.match(update, /name: parsed\.value\.name/, "název se měnit dá");
  // zakládání nového města slug naopak nastavuje
  const create = akce.slice(akce.indexOf("export async function createCityAction"), akce.indexOf("export async function updateCityAction"));
  assert.match(create, /slug: parsed\.value\.slug/);
});

test("J4 – žádná migrace nepřepisuje existující identifikátory", () => {
  const migrace = fs
    .readdirSync(path.join(ROOT, "supabase/migrations"))
    .map((f) => f.slice(0, 14))
    .filter((razitko) => /^\d{14}$/.test(razitko) && razitko > "20260911200000");
  assert.deepEqual(migrace, [], "R45 nemá žádnou migraci");
});

// ═══════════ K. Výběr z možností: validace čte odpověď stejně jako hra ═══════════
// Správná odpověď u „vyber" je JEDNA celá nabízená možnost. Čárka uvnitř textu
// možnosti není oddělovač – dřív se odpověď dělila jako u otevřených úkolů
// a možnost „Vlci, medvědi, kůň a brazilský ptáček" se rozpadla na kusy,
// které mezi možnostmi nejsou, takže publikace hlásila falešnou chybu.

const vyberUkol = (correctAnswer: string, options: unknown, type = "vyber") => ({
  id: "t1",
  stopTitle: "Zastávka",
  taskOrder: 1,
  type,
  question: "Otázka?",
  correctAnswer,
  options
});
const zkontroluj = (task: ReturnType<typeof vyberUkol>) =>
  findPublishBlockers([{ id: "s1", title: "Zastávka", order: 1, tasks: [task] }]);
const kody = (task: ReturnType<typeof vyberUkol>) => zkontroluj(task).map((i) => i.code);

test("K1 – výběr s jednoduchou správnou možností projde", () => {
  assert.deepEqual(kody(vyberUkol("Nebe a peklo", ["Nebe a peklo", "Den a noc", "Sláva a pád"])), []);
});

test("K2 – správná možnost s čárkami projde (jedna i více čárek)", () => {
  assert.deepEqual(
    kody(vyberUkol("Vlci, medvědi, kůň a brazilský ptáček", ["Pávi a labutě", "Vlci, medvědi, kůň a brazilský ptáček", "Sloni a velbloudi"])),
    [],
    "dvě čárky uvnitř možnosti nejsou oddělovač"
  );
  assert.deepEqual(
    kody(vyberUkol("Chléb, sůl", ["Chléb, sůl", "Voda", "Med"])),
    [],
    "jedna čárka uvnitř možnosti nejsou dvě odpovědi"
  );
});

test("K3 – odpověď musí opravdu odpovídat jedné z nabízených možností", () => {
  // shoda se nehledá po kusech: „Vlci" samo o sobě žádná možnost není
  assert.deepEqual(
    kody(vyberUkol("Vlci", ["Pávi a labutě", "Vlci, medvědi, kůň a brazilský ptáček", "Sloni a velbloudi"])),
    ["choice_answer_not_in_options"],
    "fragment možnosti není platná odpověď"
  );
  // a naopak celá možnost projde
  assert.deepEqual(kody(vyberUkol("Sloni a velbloudi", ["Pávi a labutě", "Vlci, medvědi, kůň a brazilský ptáček", "Sloni a velbloudi"])), []);
});

test("K4 – neexistující správná možnost dál blokuje publikaci", () => {
  assert.deepEqual(
    kody(vyberUkol("Žirafy", ["Pávi a labutě", "Vlci, medvědi", "Sloni a velbloudi"])),
    ["choice_answer_not_in_options"]
  );
  // prázdná odpověď zůstává „chybí odpověď", ne „není mezi možnostmi"
  assert.deepEqual(kody(vyberUkol("", ["Ano", "Ne"])), ["missing_answer"]);
  // málo možností se hlásí dál
  assert.deepEqual(kody(vyberUkol("Ano", ["Ano"])), ["choice_without_options"]);
});

test("K5 – skutečná data Klamovky tímto pravidlem projdou", () => {
  const klamovka = vyberUkol("Vlci, medvědi, kůň a brazilský ptáček", [
    "Pávi a labutě",
    "Vlci, medvědi, kůň a brazilský ptáček",
    "Sloni a velbloudi"
  ]);
  assert.deepEqual(zkontroluj(klamovka), [], "úkol 2 zastávky Novogotický altán už nehlásí nic");
});

test("K6 – validace a hra vykládají „vyber“ stejně", () => {
  const pripady: Array<[string, string[]]> = [
    ["Vlci, medvědi, kůň a brazilský ptáček", ["Pávi a labutě", "Vlci, medvědi, kůň a brazilský ptáček", "Sloni a velbloudi"]],
    ["Nebe a peklo", ["Nebe a peklo", "Den a noc"]],
    ["2", ["Pávi", "Vlci", "Sloni"]],
    ["Žirafy", ["Pávi", "Vlci", "Sloni"]],
    ["Vlci", ["Pávi a labutě", "Vlci, medvědi", "Sloni"]]
  ];
  for (const [odpoved, moznosti] of pripady) {
    // hra: kanonická odpověď určuje, co se uzná
    const kanonicka = getCanonicalCorrectAnswer({
      id: "t1",
      type: "vyber",
      question: "Otázka?",
      correct_answer: odpoved,
      options: moznosti
    });
    const hraUkolVyresitelny = Boolean(kanonicka) && isTaskAnswerCorrect({ type: "vyber", correctAnswers: kanonicka ? [kanonicka] : [] }, kanonicka ?? "");
    // validace: blokuje publikaci?
    const validaceBlokuje = kody(vyberUkol(odpoved, moznosti)).includes("choice_answer_not_in_options");
    assert.equal(
      validaceBlokuje,
      !hraUkolVyresitelny,
      `rozchod u odpovědi ${JSON.stringify(odpoved)}: hra řešitelná=${hraUkolVyresitelny}, validace blokuje=${validaceBlokuje}`
    );
  }
});

test("K7 – otevřené úkoly a jejich oddělovače zůstávají beze změny", () => {
  // víc uznávaných odpovědí oddělených čárkou u otevřeného úkolu dál platí
  assert.deepEqual(splitAcceptedAnswers("4, ctyri, čtyři"), ["4", "ctyri", "čtyři"]);
  assert.deepEqual(splitAcceptedAnswers("galerie\nvystavni prostor"), ["galerie", "vystavni prostor"]);
  assert.deepEqual(kody(vyberUkol("4, ctyri, čtyři", [], "otevrena")), [], "otevřený úkol s variantami projde");
  // „pro splnění stačí N" se dál počítá z rozdělených odpovědí
  const whitelist = {
    ...vyberUkol("Rakousko; Polsko; Monako", [], "otevrena"),
    minCorrectMatches: 3
  };
  assert.deepEqual(zkontroluj(whitelist), [], "whitelist se třemi odpověďmi a min 3 je v pořádku");
  const prilis = { ...vyberUkol("Rakousko; Polsko", [], "otevrena"), minCorrectMatches: 5 };
  assert.deepEqual(zkontroluj(prilis).map((i) => i.code), ["invalid_min_matches"]);
});
