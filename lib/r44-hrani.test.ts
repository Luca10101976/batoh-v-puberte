import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { POINTS_PER_TASK, POINTS_PER_TASK_WITH_HINT } from "./game-rules.ts";
import { pointsForTask, scoreTaskProgress } from "./mission-completion.ts";

// R44 krok 3: hraní je dobrodružství, ne formulář ani test.
// Herní obrazovku nejde spustit (alias "@/"), takže se u ní ověřuje zdroják;
// pravidla bodování se ověřují chováním nad čistými moduly.
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const bezKomentaru = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "");

const PLAY = () => bezKomentaru(read("components/play-screen.tsx"));

// --- 1–3: kontext zastávky ---------------------------------------------------

test("kontext zastávky se váže na příchod na zastávku, ne na každý úkol", () => {
  const src = PLAY();
  assert.match(src, /const isFirstTaskOfEpisode = taskIndex === 0;/, "musí existovat rozlišení prvního úkolu zastávky");
  assert.match(src, /\{isFirstTaskOfEpisode \? \(/, "uvedení místa se ukazuje jen při příchodu");
  // uvedení, historie i fotka jsou uvnitř té podmínky
  const zacatek = src.indexOf("{isFirstTaskOfEpisode ? (");
  const konec = src.indexOf("</section>", zacatek);
  const blok = src.slice(zacatek, konec);
  assert.match(blok, /activeEpisode\.intro/, "uvedení zastávky patří do bloku příchodu");
  assert.match(blok, /Trocha nudné historie/, "historie patří do bloku příchodu");
  assert.match(blok, /activeEpisode\.illustrationImage/, "fotka patří do bloku příchodu");
});

test("TROCHA NUDNÉ HISTORIE zůstává a nesbaluje se", () => {
  const src = PLAY();
  assert.match(src, /Trocha nudné historie/, "nadpis historie musí zůstat");
  assert.match(src, /activeEpisode\.background/, "obsah historie z Mozku se dál zobrazuje");
  const zacatek = src.indexOf("Trocha nudné historie");
  const okoli = src.slice(Math.max(0, zacatek - 600), zacatek);
  assert.ok(!/<details/.test(okoli), "historie se nesmí automaticky sbalit");
});

test("název zastávky není na obrazovce vícekrát a zmizely nálepkové nadpisy", () => {
  const src = PLAY();
  for (const zakazane of ["Aktuální zastavení", "O tomhle zastavení", "Jsi na správném místě ve hře"]) {
    assert.ok(!src.includes(zakazane), `„${zakazane}“ se už nezobrazuje`);
  }
  // alt popisky fotky název obsahovat smí – ty hráč nevidí, slouží čtečkám
  const bezAltu = src.replace(/alt=\{[^}]*\}/g, "");
  const vyskyty = (bezAltu.match(/\{activeEpisode\.name\}/g) ?? []).length;
  assert.equal(vyskyty, 1, `název zastávky se vypisuje jednou, nalezeno ${vyskyty}×`);
});

// --- 4: fotografie -----------------------------------------------------------

test("fotka zastávky je na mobilu menší", () => {
  const src = PLAY();
  assert.match(src, /max-w-\[120px\][^"]*sm:max-w-\[160px\]/, "na mobilu má fotka menší strop než dřív (168/220)");
  assert.ok(!/max-w-\[168px\]/.test(src), "původní mobilní rozměr fotky zastávky je pryč");
});

// --- 5–6: bodová pravidla a nápovědy ----------------------------------------

test("pod úkolem už není opakovaný odstavec s bodovými pravidly", () => {
  const src = PLAY();
  assert.ok(!/Pravidlo: Správná odpověď/.test(src), "odstavec s pravidly musí být pryč");
  assert.ok(!/Na odpověď máš 2 opravné pokusy/.test(src), "vysvětlování pokusů pod úkolem musí být pryč");
});

test("nápověda se nabízí jen tam, kde ji autor vyplnil", () => {
  const src = PLAY();
  assert.match(src, /\{activeTask\.hasHint \? \(/, "nápovědní blok visí na hasHint");
  assert.match(src, /handleRevealHint\(\)/, "tlačítko nápovědy zůstává funkční");
});

test("bodování 10 / 5 / 0 zůstává beze změny", () => {
  assert.equal(POINTS_PER_TASK, 10);
  assert.equal(POINTS_PER_TASK_WITH_HINT, 5);

  assert.equal(pointsForTask("correct", false), POINTS_PER_TASK, "správně bez nápovědy = 10");
  assert.equal(pointsForTask("correct", true), POINTS_PER_TASK_WITH_HINT, "správně po nápovědě = 5");
  assert.equal(pointsForTask("unknown", false), 0, "Nevím = 0");
  assert.equal(pointsForTask("wrong", false), 0, "špatně = 0");

  const vysledek = scoreTaskProgress(["t1", "t2", "t3"], [
    { task_id: "t1", status: "correct", hintUsed: false },
    { task_id: "t2", status: "correct", hintUsed: true },
    { task_id: "t3", status: "unknown" }
  ] as never);
  assert.equal(vysledek.score, POINTS_PER_TASK + POINTS_PER_TASK_WITH_HINT, "10 + 5 + 0");

  const serverova = read("app/api/game/submit-task-answer/route.ts");
  assert.match(serverova, /pointsForTask/, "body přiděluje dál server");
});

// --- 7: štítek typu ----------------------------------------------------------

test("štítek typu úkolu se nezobrazuje, typ zůstává interně", () => {
  const src = PLAY();
  assert.ok(!/\{activeTask\.typeLabel\}/.test(src), "typeLabel se hráči nevypisuje");
  assert.match(src, /activeTask\.type === "choice"/, "typ úkolu se dál používá v logice");
});

// --- 8: historie předchozího dohrání ----------------------------------------

test("během hry se nepřipomíná předchozí dokončení", () => {
  const src = PLAY();
  assert.ok(!/Tuhle hru už máš jednou dokončenou/.test(src), "hláška o předchozím průchodu je z průběhu hry pryč");
  assert.match(read("lib/game-completion.ts"), /first_completed_at/, "historická data se dál ukládají");
});

// --- 9–12: odpovídání --------------------------------------------------------

test("hlavní akce se jmenuje Ověřit odpověď", () => {
  const src = PLAY();
  assert.match(src, /"Ověřit odpověď"/);
  assert.ok(!/"Ověřit úkol"/.test(src));
});

test("po vyřešení úkolu zůstane jen cesta dál, předtím se dá odpovídat opakovaně", () => {
  const src = PLAY();
  assert.match(src, /\{verificationFinished \? \(/, "po vyřešení se nabídka akcí mění");
  const zacatek = src.indexOf("{verificationFinished ? (");
  const konec = src.indexOf("</div>", src.indexOf("</>", zacatek));
  const blok = src.slice(zacatek, konec);
  const vyresenaVetev = blok.slice(0, blok.indexOf(") : ("));
  assert.ok(!/Ověřit odpověď/.test(vyresenaVetev), "vyřešený úkol už nenabízí ověřování");
  assert.ok(!/Nevím/.test(vyresenaVetev), "vyřešený úkol už nenabízí Nevím");
  assert.match(vyresenaVetev, /advance\(\)/, "zůstává jedna cesta dál");
  // opakované pokusy musí dál fungovat
  assert.match(src, /disabled=\{submittingAnswer\}/, "dokud není vyřešeno, jde odpovídat znovu");
});

test("výběrové možnosti hlásí stav a po vyřešení nejdou měnit", () => {
  const src = PLAY();
  assert.match(src, /aria-pressed=\{zvoleno\}/, "stav výběru musí být dostupný čtečkám");
  assert.match(src, /disabled=\{verificationFinished\}/, "po vyřešení se volby nedají přepínat");
  assert.match(src, /verificationFinished && !zvoleno \? "opacity-40" : ""/, "nezvolené možnosti po vyřešení zešednou");
});

test("prázdná odpověď je validace, ne serverová chyba", () => {
  const src = PLAY();
  assert.match(src, /setMessage\("Napiš nejdřív odpověď\."\)/);
  assert.match(src, /setMessage\("Vyber nejdřív odpověď\."\)/);
  // kontrola musí předcházet odeslání na server
  const validace = src.indexOf('Napiš nejdřív odpověď');
  const odeslani = src.indexOf('await submitTaskAnswer("answer", input)');
  assert.ok(validace > 0 && odeslani > 0 && validace < odeslani, "prázdný vstup se na server neposílá");
  // skutečné serverové chyby si dál hlásí svoje
  assert.match(src, /Ověření odpovědi se nepodařilo/, "technická chyba má dál vlastní hlášku");
});

// --- 13–14: přechod mezi zastávkami -----------------------------------------

test("přechod mezi zastávkami je zjednodušený", () => {
  const src = PLAY();
  assert.match(src, /Zastávka hotová/);
  assert.match(src, /Pokračuješ na/);
  assert.ok(!/text-mist">Dokončeno</.test(src), "nadpis Dokončeno je pryč");
  assert.ok(!/pendingTransition\.fromStopName/.test(src), "název právě dokončené zastávky se neopakuje");
  assert.match(src, /\{transitionText \? \(/, "autorský text se ukáže, jen když existuje");
});

test("před posledním úkolem zastávky se nic nehlásí dopředu", () => {
  const src = PLAY();
  assert.ok(!/Po tomhle úkolu se přesuneš na další zastavení/.test(src));
});

// --- 16: konec hry -----------------------------------------------------------

test("konec hry ukazuje body bez zlomku a bez bilance", () => {
  const src = PLAY();
  assert.ok(!/\/\{endingView\.maxScore\}/.test(src), "zlomek se skóre je pryč");
  assert.ok(!/Správně: </.test(src) && !/endingView\.correctTasks/.test(src), "bilance správně/Nevím je pryč");
  assert.match(src, /\{endingView\.score\}\s*\n?\s*<span className="ml-2 text-xl text-mist">bodů<\/span>/, "skóre se zobrazí jako „N bodů“");
  assert.match(src, /zůstává \{endingView\.bestScore\} bodů/, "nejlepší výsledek taky bez zlomku");
});

// --- 15+18: Mozek ------------------------------------------------------------

test("Mozek ukáže, že zastávce chybí navigace na další místo", () => {
  const page = read("app/admin/missions/[id]/page.tsx");
  assert.match(page, /transition_text/, "přehled zastávek musí text načíst");
  assert.match(page, /Chybí text „kudy dál“ na další zastavení/, "chybějící text musí být vidět");
  assert.match(page, /index < orderedStops\.length - 1/, "u poslední zastávky se navigace nečeká");
  const form = read("components/admin/stop-form.tsx");
  assert.match(form, /name="transition_text"/, "text zůstává spravovatelný");
  assert.ok(!/aplikace použije obecný text/.test(form), "popisek už neslibuje náhradní text");
});

test("závěrečný obsah hry se dál bere z Mozku", () => {
  const src = PLAY();
  assert.match(src, /endingView\.ending\?\.endingStory/, "závěrečný příběh z dat");
  assert.match(src, /endingView\.ending\?\.playerMessage/, "vzkaz hráči z dat");
  const form = read("components/admin/mission-form.tsx");
  for (const pole of ["ending_title", "ending_text", "ending_player_message"]) {
    assert.match(form, new RegExp(`name="${pole}"`), `${pole} musí jít spravovat v Mozku`);
  }
});

// --- 17: co zůstalo beze změny ----------------------------------------------

test("schválené texty a chování zůstaly", () => {
  const src = PLAY();
  assert.match(src, /Tohle nesedí\. Zkus to znovu\./, "reakce na chybu");
  assert.match(src, /formatRemainingAttempts\(attemptsLeft\)/, "počet zbývajících pokusů zůstává");
  assert.match(read("lib/game-rules.ts"), /export function formatRemainingAttempts/);
  assert.match(src, /Správně\. Za tenhle úkol máš/, "reakce na správnou odpověď");
  assert.match(src, /Nevadí, jdeme dál\. Za tenhle úkol je 0 bodů\./, "reakce na Nevím");
  assert.match(src, /Navázali jsme na tvoji rozehranou hru\./, "resume hláška");
  assert.match(src, /intro=1|setIntroOpen/, "ZAČÍNÁME zůstává");
  for (const akce of ["Hrát znovu", "Vybrat další hru", "Žebříček", "Profil"]) {
    assert.ok(src.includes(akce), `závěrečná akce „${akce}“ zůstává`);
  }
  assert.match(read("lib/task-order-server.ts"), /task_out_of_order/, "pořadí úkolů dál hlídá server");
  assert.match(read("app/api/game/submit-task-answer/route.ts"), /assertTaskAvailable|task-order-server/, "endpoint tu kontrolu volá");
});
