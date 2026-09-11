import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildProfileGameSummaries,
  combineGamesLoadState,
  resolveGamesView,
  shouldShowGameFilters,
  type ProfileRunInput
} from "./profile-games-model.ts";

// R44 krok 4: profil je identita hráče, ne dashboard.
// Chování seznamu her se ověřuje spuštěním modelu; u obrazovky, kterou kvůli
// aliasu "@/" nelze naimportovat, se ověřuje zdroják.
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const bezKomentaru = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "");

const PROFIL = () => bezKomentaru(read("components/profile-screen.tsx"));
const PROVIDER = () => bezKomentaru(read("components/app-state-provider.tsx"));
const TELEFON = () => bezKomentaru(read("components/mobile-app-card.tsx"));

const run = (over: Partial<ProfileRunInput> = {}): ProfileRunInput => ({
  locationId: "klamovka",
  title: null,
  city: null,
  updatedAt: "2026-09-11T10:00:00.000Z",
  position: { episodeIndex: 0, taskIndex: 2, stopName: "Kaple Panny Marie" },
  ...over
});

const prazdnyVstup = {
  completedLocationIds: [],
  activeRuns: [],
  playedGames: {},
  locationBestScores: {},
  lastCompletedAt: {}
};

// --- 1–4: tři stavy hráče ----------------------------------------------------

test("1 – nový hráč bez hry nemá v profilu žádnou hru", () => {
  assert.deepEqual(buildProfileGameSummaries(prazdnyVstup), []);
});

test("2 – hráč s rozehranou hrou: název z DB, místo, stav a Pokračovat", () => {
  const [hra] = buildProfileGameSummaries({
    ...prazdnyVstup,
    activeRuns: [run()],
    playedGames: { klamovka: { name: "Ztracený příběh Klamovky", city: "Praha", maxScore: 190 } }
  });
  assert.equal(hra.name, "Ztracený příběh Klamovky");
  assert.equal(hra.city, "Praha");
  assert.equal(hra.status, "active");
  assert.equal(hra.statusLabel, "Rozehráno");
  assert.equal(hra.stopName, "Kaple Panny Marie");
  assert.equal(hra.actionLabel, "Pokračovat");
});

test("3 – hráč s dokončenou hrou: název z DB, body a Hrát znovu", () => {
  const [hra] = buildProfileGameSummaries({
    ...prazdnyVstup,
    completedLocationIds: ["klamovka"],
    playedGames: { klamovka: { name: "Ztracený příběh Klamovky", city: "Praha", maxScore: 190 } },
    locationBestScores: { klamovka: 20 },
    lastCompletedAt: { klamovka: "2026-09-11T12:00:00.000Z" }
  });
  assert.equal(hra.name, "Ztracený příběh Klamovky");
  assert.equal(hra.status, "completed");
  assert.equal(hra.statusLabel, "Dokončeno");
  assert.equal(hra.scoreLabel, "20 bodů");
  assert.equal(hra.actionLabel, "Hrát znovu");
});

test("4 – hráč s více hrami vidí všechny, nejčerstvější první", () => {
  const hry = buildProfileGameSummaries({
    completedLocationIds: ["klamovka"],
    activeRuns: [run({ locationId: "vysehrad", updatedAt: "2026-09-11T18:00:00.000Z" })],
    playedGames: {
      klamovka: { name: "Ztracený příběh Klamovky", city: "Praha", maxScore: 190 },
      vysehrad: { name: "Tajemství Vyšehradu", city: "Praha", maxScore: 120 }
    },
    locationBestScores: { klamovka: 20 },
    lastCompletedAt: { klamovka: "2026-09-11T12:00:00.000Z" }
  });
  assert.equal(hry.length, 2);
  assert.deepEqual(hry.map((hra) => hra.id), ["vysehrad", "klamovka"]);
});

// --- 5–7: cesta názvu hry z databáze do profilu ------------------------------

test("5 – profil ukazuje název z databáze, ne interní slug", () => {
  const [hra] = buildProfileGameSummaries({
    ...prazdnyVstup,
    completedLocationIds: ["klamovka"],
    playedGames: { klamovka: { name: "Ztracený příběh Klamovky", city: "Praha", maxScore: 190 } }
  });
  assert.equal(hra.name, "Ztracený příběh Klamovky");
  assert.notEqual(hra.name, "klamovka");
});

test("5b – slug zůstává jen jako záchrana, když jméno opravdu chybí", () => {
  const [bezVseho] = buildProfileGameSummaries({ ...prazdnyVstup, completedLocationIds: ["klamovka"] });
  assert.equal(bezVseho.name, "klamovka", "bez jména z DB i bez výpravy zbývá jen slug");

  const [zVypravy] = buildProfileGameSummaries({
    ...prazdnyVstup,
    activeRuns: [run({ title: "Ztracený příběh Klamovky" })]
  });
  assert.equal(zVypravy.name, "Ztracený příběh Klamovky", "jméno z běžící výpravy má přednost před slugem");
});

test("6 – playedGames se skutečně vrací do aplikačního stavu", () => {
  const src = PROVIDER();
  const zacatek = src.indexOf("const playedGames: AppState[\"playedGames\"] = {};");
  assert.ok(zacatek > 0, "playedGames se musí stále skládat z odpovědi serveru");
  const konec = src.indexOf("cloudHydratedForUserRef.current = session.user.id;", zacatek);
  const navrat = src.slice(src.indexOf("return {", zacatek), konec);
  assert.match(navrat, /^\s*playedGames\s*$/m, "spočítané playedGames musí být součástí vráceného stavu");
});

test("6b – výchozí stav i oba resety mají playedGames prázdné", () => {
  const src = PROVIDER();
  const mista = src.split("locationMaxScores: {},");
  // výchozí stav + reset po odhlášení + reset při nové registraci
  const sPlayedGames = mista.slice(1).filter((usek) => usek.trimStart().startsWith("playedGames: {},"));
  assert.equal(mista.length - 1, 3, "locationMaxScores se nuluje na třech místech");
  assert.equal(sPlayedGames.length, 3, "všude, kde se nuluje postup, se musí vynulovat i playedGames");
});

test("7 – změna playedGames překreslí seznam her", () => {
  const src = PROFIL();
  const zacatek = src.indexOf("const gameSummaries = useMemo(");
  assert.ok(zacatek > 0);
  const deps = src.slice(zacatek, src.indexOf(");", src.indexOf("[", src.indexOf("buildProfileGameSummaries", zacatek))) + 2);
  assert.match(deps, /state\.playedGames/, "playedGames musí být mezi závislostmi useMemo");

  // a chování: stejný vstup s jiným playedGames dá jiný výsledek
  const bezJmena = buildProfileGameSummaries({ ...prazdnyVstup, completedLocationIds: ["klamovka"] });
  const seJmenem = buildProfileGameSummaries({
    ...prazdnyVstup,
    completedLocationIds: ["klamovka"],
    playedGames: { klamovka: { name: "Ztracený příběh Klamovky", city: "Praha", maxScore: 190 } }
  });
  assert.notEqual(bezJmena[0].name, seJmenem[0].name);
});

// --- 8–9: horní část profilu -------------------------------------------------

test("8 – horní trojice Hry/Body/Parta v profilu není", () => {
  const src = PROFIL();
  assert.doesNotMatch(src, /text-mist">Hry<\/div>/, "počitadlo Hry je pryč");
  assert.doesNotMatch(src, /text-mist">Body<\/div>/, "počitadlo Body je pryč");
  assert.doesNotMatch(src, /Parta/, "počitadlo Parta je pryč");
  assert.doesNotMatch(src, /publishedGamesCount/, "katalogové číslo profil nepotřebuje");
});

test("9 – pevná hodnost Lovec městských tajemství neexistuje", () => {
  assert.doesNotMatch(PROVIDER(), /Lovec městských tajemství/);
  assert.doesNotMatch(PROFIL(), /Lovec městských tajemství/);
  assert.doesNotMatch(PROFIL(), /profile\.title/, "profil už žádný titul nezobrazuje");
});

// --- 10–13: identita a editace ----------------------------------------------

test("10 – profil se neotevírá jako editační formulář", () => {
  const src = PROFIL();
  const zacatek = src.indexOf("<section className=\"glass-card overflow-hidden p-5\">");
  const cta = src.indexOf("Upravit profil", zacatek);
  assert.ok(cta > 0, "nahoře musí být CTA Upravit profil");
  const hlavicka = src.slice(zacatek, cta);
  assert.doesNotMatch(hlavicka, /<input/, "nad CTA nesmí být žádné vstupní pole");
  assert.match(hlavicka, /\{state\.profile\.name\}/, "přezdívka se ukazuje jako text");
  assert.match(src, /useState\(false\);/, "editor je ve výchozím stavu zavřený");
  assert.match(src, /const \[profileEditorOpen, setProfileEditorOpen\] = useState\(false\)/);
});

test("11 – Upravit profil zpřístupní přezdívku i avatara a jde zavřít", () => {
  const src = PROFIL();
  const zacatek = src.indexOf("{profileEditorOpen ? (");
  assert.ok(zacatek > 0);
  const blok = src.slice(zacatek, src.indexOf(") : null}\n      </section>", zacatek));
  assert.match(blok, /persistProfileName/, "editor umí uložit přezdívku");
  assert.match(blok, /AVATAR_IDS\.map/, "editor umí vybrat avatara");
  assert.match(blok, /saveAvatarDebounced/, "avatar se ukládá stávající logikou");
  assert.match(blok, /Hotovo/, "z editace musí jít odejít");
  assert.doesNotMatch(src, /Upravit avatara/, "samostatné CTA na avatara je pryč");
});

test("13 – úspěšná změna přezdívky hlásí přesně Přezdívka uložena.", () => {
  const src = PROFIL();
  assert.match(src, /setProfileMessage\("Přezdívka uložena\."\)/);
  assert.doesNotMatch(src, /do cloudu/, "technická formulace o cloudu je pryč");
});

// --- 14: Traki klíč ----------------------------------------------------------

test("14 – Traki klíč je hned pod identitou hráče a má všechny funkce", () => {
  const src = PROFIL();
  const identita = src.indexOf("Upravit profil");
  const klic = src.indexOf("id=\"traki-key\"");
  const hry = src.indexOf("Moje hry");
  const telefon = src.indexOf("<MobileAppCard />");
  assert.ok(identita > 0 && klic > identita, "klíč je až za identitou hráče");
  assert.ok(klic < hry, "klíč je nad sekcí Moje hry");
  assert.ok(klic < telefon, "klíč je nad sekcí do telefonu");

  const sekce = src.slice(klic, src.indexOf("</section>", klic));
  assert.match(sekce, /••••-••••-••••-••••/, "klíč je ve výchozím stavu zamaskovaný");
  assert.match(sekce, /"Skrýt" : "Ukázat"/, "akce Ukázat zůstává");
  assert.match(sekce, /Zkopírovat/, "akce Zkopírovat zůstává");
  assert.match(sekce, /Vytvořit nový klíč/, "akce Vytvořit nový klíč zůstává");
});

// --- 15–20: podoba her v seznamu --------------------------------------------

test("15 – rozehraná hra neukazuje X/Y ani procenta", () => {
  const [hra] = buildProfileGameSummaries({ ...prazdnyVstup, activeRuns: [run()] });
  assert.equal(hra.scoreLabel, "", "u rozehrané hry není žádný číselný popisek");
  assert.doesNotMatch(JSON.stringify(hra), /\d+\/\d+/, "nikde není poměr");
  assert.doesNotMatch(JSON.stringify(hra), /%/, "nikde nejsou procenta");
  assert.doesNotMatch(PROFIL(), /Zastavení \$\{/, "text Zastavení X/Y je z profilu pryč");
  assert.doesNotMatch(PROFIL(), /progressText/, "profil už progress text nepočítá");
});

test("16 – Pokračovat vede přesně tam, kde hráč skončil", () => {
  const [hra] = buildProfileGameSummaries({
    ...prazdnyVstup,
    activeRuns: [run({ position: { episodeIndex: 2, taskIndex: 1, stopName: "Letohrádek" } })]
  });
  assert.equal(hra.href, "/play/klamovka?episode=3&task=2");
});

test("17 – dokončená hra ukazuje jen dosažené body, bez maxima", () => {
  const [hra] = buildProfileGameSummaries({
    ...prazdnyVstup,
    completedLocationIds: ["klamovka"],
    playedGames: { klamovka: { name: "Ztracený příběh Klamovky", city: "Praha", maxScore: 190 } },
    locationBestScores: { klamovka: 20 }
  });
  assert.equal(hra.scoreLabel, "20 bodů");
  assert.doesNotMatch(hra.scoreLabel, /190/, "maximum se nezobrazuje");
  assert.doesNotMatch(hra.scoreLabel, /\//, "žádný zlomek");
});

test("18 – text Nejlepší uložený výsledek zmizel", () => {
  assert.doesNotMatch(PROFIL(), /Nejlepší uložený výsledek/);
});

test("19 – datum dohrání se do seznamu her nepřidalo", () => {
  const src = PROFIL();
  const zacatek = src.indexOf("visibleGames.map(");
  const blok = src.slice(zacatek, src.indexOf("hasMoreGames ?", zacatek));
  assert.doesNotMatch(blok, /toLocaleDateString|updatedAt|lastCompletedAt/, "datum se nezobrazuje");
});

test("20 – CTA dokončené hry je Hrát znovu", () => {
  const [hra] = buildProfileGameSummaries({ ...prazdnyVstup, completedLocationIds: ["klamovka"] });
  assert.equal(hra.actionLabel, "Hrát znovu");
  assert.doesNotMatch(PROFIL(), /Zahrát znovu/);
});

// --- 21–22: filtry -----------------------------------------------------------

test("21 – při 0 a 1 hře se filtry nezobrazí", () => {
  assert.equal(shouldShowGameFilters(0), false);
  assert.equal(shouldShowGameFilters(1), false);
  assert.match(PROFIL(), /\{showGameFilters \? \(/, "filtry jsou podmíněné");
});

test("22 – při dvou a více hrách jsou filtry dostupné a beze změny", () => {
  assert.equal(shouldShowGameFilters(2), true);
  assert.equal(shouldShowGameFilters(9), true);
  const src = PROFIL();
  const zacatek = src.indexOf("{showGameFilters ? (");
  const blok = src.slice(zacatek, src.indexOf("filteredGames.length === 0", zacatek));
  assert.match(blok, /label: "Všechny"/);
  assert.match(blok, /label: "Rozehrané"/);
  assert.match(blok, /label: "Dokončené"/);
});

// --- 23–24: sociální část ----------------------------------------------------

test("23 – štítek Solo tah je pryč a nic ho nenahradilo", () => {
  assert.doesNotMatch(PROFIL(), /Solo tah/);
});

test("24 – veřejný kód kamaráda zůstává funkční", () => {
  const src = PROFIL();
  assert.match(src, /\{state\.playerCode\}/, "kód se dál zobrazuje");
  assert.match(src, /placeholder="BAT-XXXXXX"/, "tvar kódu ukazuje placeholder");
  // R44 krok 5: přidání jde přes hledání a náhled, ne přímo
  assert.match(src, /handleFindFriend/);
  assert.match(src, /handleConfirmAddFriend/);
});

// --- 25–26: telefon a odhlášení ---------------------------------------------

test("25 – Traki v telefonu je sbalené a dá se rozbalit", () => {
  const src = TELEFON();
  assert.match(src, /<details className="group">/, "sekce je rozbalovací");
  assert.doesNotMatch(src, /<details[^>]*\bopen\b/, "ve výchozím stavu je sbalená");
  assert.match(src, /Traki v telefonu/, "srozumitelný řádek");
  assert.doesNotMatch(src, /Aplikace do telefonu/, "starý nadpis je pryč");
  assert.match(src, /handleInstallClick/, "instalační logika se nemění");
  assert.match(src, /beforeinstallprompt/, "PWA mechanismus zůstává stejný");
});

test("26 – Odhlásit je úplně dole a používá původní logout", () => {
  const src = PROFIL();
  const telefon = src.indexOf("<MobileAppCard />");
  const odhlasit = src.indexOf("Odhlásit");
  assert.ok(odhlasit > telefon, "Odhlásit je až za sekcí do telefonu");
  assert.match(src.slice(odhlasit - 400, odhlasit), /handleLogout/, "funkčnost se nemění");
  assert.equal(src.slice(odhlasit).indexOf("<section"), -1, "za Odhlásit už žádná sekce není");
});

// --- 27: poctivost chybových stavů (R43) ------------------------------------

test("27 – výpadek načtení se neprezentuje jako nula ani prázdný profil", () => {
  const src = PROFIL();
  assert.match(src, /shouldApplyServerNumber\(payload\.totalScore\)/, "R43: nezjištěné skóre se nesynchronizuje");
  assert.match(src, /setCloudProfileError\("Načtení cloud profilu selhalo\."\)/);
  assert.match(src, /setCloudProfileError\("Účet už není přihlášený\. Přihlas se znovu\."\)/);
  assert.match(src, /serverScore \?\? getPlayerScore\(\)/, "dokud server nemluví, platí poslední známá hodnota");
});

// --- 28–34: R44 doplněk – loading vs. skutečně prázdný stav ------------------
// Falešný prázdný stav vznikal tím, že sekce Moje hry měla jen dvě větve:
// „nula her" a „hry". Nezjištěný stav spadl do té první.

test("28 – dokud nevíme, nesmí profil tvrdit, že hráč nic neodehrál", () => {
  assert.equal(resolveGamesView("idle", 0), "loading");
  assert.equal(resolveGamesView("loading", 0), "loading");
});

test("29 – prázdný stav patří jen k dokončenému načtení", () => {
  assert.equal(resolveGamesView("ready", 0), "empty");
});

test("30 – načtené hry se ukážou, i když na pozadí běží další načítání", () => {
  assert.equal(resolveGamesView("ready", 1), "games");
  assert.equal(resolveGamesView("loading", 1), "games", "platná data se kvůli refreshi neschovávají");
  assert.equal(resolveGamesView("error", 2), "games", "chyba refreshe nesmí smazat, co hráč vidí");
});

test("31 – selhané načtení dá chybu, ne prázdný profil ani věčné načítání", () => {
  assert.equal(resolveGamesView("error", 0), "error");
  assert.notEqual(resolveGamesView("error", 0), "empty");
  assert.notEqual(resolveGamesView("error", 0), "loading");
});

test("32 – hry čekají na obě nezávislá načtení", () => {
  // dokončené hry a skóre (profilové API) × běžící výpravy (herní API)
  assert.equal(combineGamesLoadState("ready", "loading"), "loading", "bez výprav nevíme, co je rozehrané");
  assert.equal(combineGamesLoadState("loading", "ready"), "loading", "bez postupu nevíme, co je dokončené");
  assert.equal(combineGamesLoadState("ready", "idle"), "idle");
  assert.equal(combineGamesLoadState("ready", "ready"), "ready");
});

test("33 – chyba kteréhokoli z obou načtení je chyba, i když druhé ještě běží", () => {
  assert.equal(combineGamesLoadState("error", "ready"), "error");
  assert.equal(combineGamesLoadState("ready", "error"), "error");
  // Kdyby nedokončené načítání přebilo chybu, stačilo by, aby se druhá půlka
  // nikdy nerozběhla, a hráč by zůstal navždy u „Načítám tvoje hry…".
  assert.equal(combineGamesLoadState("loading", "error"), "error");
  assert.equal(combineGamesLoadState("idle", "error"), "error");
});

test("33b – žádná kombinace nevede k věčnému načítání po selhání", () => {
  const stavy = ["idle", "loading", "ready", "error"] as const;
  for (const a of stavy) {
    for (const b of stavy) {
      if (a === "error" || b === "error") {
        assert.equal(combineGamesLoadState(a, b), "error", `${a} + ${b} musí skončit chybou`);
        assert.equal(resolveGamesView(combineGamesLoadState(a, b), 0), "error");
      }
    }
  }
});

test("34 – stav vychází z průběhu načítání, ne z čekání", () => {
  const provider = PROVIDER();
  assert.match(provider, /setActiveRunsLoadState\("ready"\)/, "úspěch výprav se zaznamená");
  assert.match(provider, /setProgressLoadState\("ready"\)/, "úspěch postupu se zaznamená");
  // po jednou načtených datech se stav nevrací na loading ani na error
  assert.match(provider, /setActiveRunsLoadState\(\(current\) => \(current === "ready" \? current : "loading"\)\)/);
  assert.match(provider, /setProgressLoadState\(\(current\) => \(current === "ready" \? current : "error"\)\)/);
  // R43: když server postup nezjistil, není to prázdno
  const r43 = provider.slice(provider.indexOf("if (progressUnavailable) {"));
  assert.match(r43.slice(0, 600), /setProgressLoadState/, "nezjištěný postup musí stav načítání ovlivnit");
  // žádné umělé čekání kvůli zobrazení: stav her se odvozuje výhradně
  // ze skutečného stavu načítání a z počtu známých her
  const profil = PROFIL();
  assert.match(profil, /const gamesView = resolveGamesView\(gamesLoadState, gameSummaries\.length\);/);
  const pouziteTimery = profil.match(/[a-zA-Z.]*setTimeout\(/g) ?? [];
  // debounce avatara, reset „Zkopírováno" u Traki klíče a (R44 krok 5) u kódu kamaráda
  assert.equal(pouziteTimery.length, 3, "v profilu jsou jen časovače avatara a dvou hlášek o zkopírování");
  assert.doesNotMatch(profil, /gamesLoadState[\s\S]{0,200}setTimeout/, "stav her nevisí na časovači");
});

test("35 – odhlášení vrátí načítání na začátek", () => {
  const provider = PROVIDER();
  const odhlaseni = provider.slice(provider.indexOf("cloudHydratedForUserRef.current = null;\n    setProgressLoadState"));
  assert.match(odhlaseni.slice(0, 240), /setProgressLoadState\("idle"\)/);
  assert.match(odhlaseni.slice(0, 240), /setActiveRunsLoadState\("idle"\)/);
  assert.match(odhlaseni.slice(0, 240), /setActiveRuns\(\[\]\)/, "výpravy předchozího hráče nesmí zůstat");
});

test("36 – profil zobrazuje přesně schválené texty pro každý stav", () => {
  const src = PROFIL();
  assert.match(src, /gamesView === "loading" \|\| gamesView === "error"/, "loading a error mají vlastní větev");
  assert.match(src, /Načítám tvoje hry…/);
  assert.match(src, /gamesView === "empty"/, "prázdný stav je samostatná větev");
  assert.match(src, /Zatím tady nemáš žádnou rozehranou ani dokončenou hru\. Vyber si hru a vyraž\./);
  // chybový stav používá konkrétní hlášku z R43, když ji máme
  assert.match(src, /\{cloudProfileError \|\| "Načtení tvých her se nepodařilo/);
});

test("37 – neúspěšné načtení se opakuje, takže slib o dalším pokusu platí", () => {
  const provider = PROVIDER();
  // postup: existující opakování přes cloudRetryTick
  assert.match(provider, /setCloudRetryTick\(\(value\) => value \+ 1\)/);
  // výpravy: nově taky, včetně počitadla, aby se nezkusilo jen jednou
  const blok = provider.slice(provider.indexOf('if (activeRunsLoadState !== "error") {'));
  assert.match(blok.slice(0, 600), /setActiveRunsRetryTick\(\(value\) => value \+ 1\)/);
  assert.match(blok.slice(0, 600), /void refreshActiveRuns\(\);/);
  assert.match(blok.slice(0, 700), /\[activeRunsLoadState, activeRunsRetryTick, refreshActiveRuns\]/);
});

test("38 – hydratace naběhne i po obnovení klíčem bez znovunačtení stránky", () => {
  const provider = PROVIDER();
  assert.match(
    provider,
    /\}, \[cloudRetryTick, hydrated, supabase, state\.registrationCompleted, state\.profileCode\]\);/,
    "efekt musí reagovat na to, že hráč vznikl nebo se obnovil"
  );
  assert.match(provider, /cloudHydratedForUserRef\.current === session\.user\.id/, "opakovaný běh pro stejného hráče je pořád ošetřený");
});
