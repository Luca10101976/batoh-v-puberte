import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildLeaderboard,
  rankPlayers,
  resolveBoardView,
  resolveFriendsBoardView,
  totalsByProfile,
  type LeaderboardPlayer,
  type ProfileTotals
} from "./leaderboard-model.ts";

// R44 krok 6: UX žebříčku. Pravidla R33 se nemění – mění se jen to, co a kdy
// obrazovka ukazuje, a kde končí stav jedné záložky vůči druhé.
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const bezKomentaru = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "");
const OBRAZOVKA = () => bezKomentaru(read("components/leaderboard-screen.tsx"));
const API = () => bezKomentaru(read("app/api/leaderboard/route.ts"));
const PROFIL = () => bezKomentaru(read("components/profile-screen.tsx"));

const hrac = (nickname: string, over: Partial<LeaderboardPlayer> = {}): LeaderboardPlayer => ({
  profileCode: `BAT-${nickname.toUpperCase().padEnd(6, "X").slice(0, 6)}`,
  nickname,
  avatar: null,
  excluded: false,
  isYou: false,
  ...over
});
const totals = (pairs: Array<[LeaderboardPlayer, number, number]>) => {
  const map = new Map<string, ProfileTotals>();
  for (const [p, score, completed] of pairs) map.set(p.profileCode, { score, completed });
  return map;
};
const zaznam = (rank: number, name: string, isYou = false) => ({ rank, name, avatar: null, score: 0, completed: 0, isYou });

// --- A. Kamarádi bez kamarádů -------------------------------------------------

test("A1 – hráč bez kamarádů nevidí sám sebe jako jednočlenný žebříček", () => {
  assert.equal(resolveFriendsBoardView({ friendCount: 0, entries: [zaznam(1, "Já", true)] }), "no-friends");
  assert.equal(resolveFriendsBoardView({ friendCount: 0, entries: [] }), "no-friends");
});

test("A2 – prázdný stav bez kamarádů má přesný text a CTA", () => {
  const src = OBRAZOVKA();
  assert.match(src, /Zatím tady nemáš žádné kamarády\./);
  const blok = src.slice(src.indexOf('friendsView === "no-friends"'), src.indexOf('friendsView === "friends-without-score"'));
  assert.match(blok, /Přidat kamaráda/);
  assert.match(blok, /href="\/profile#pridat-kamarada"/);
});

test("A3 – CTA míří na skutečný formulář přidání kamaráda v profilu", () => {
  const profil = PROFIL();
  assert.match(profil, /<h2 id="pridat-kamarada"[\s\S]{0,120}Přidat kamaráda/, "kotva je na nadpisu formuláře");
  const formular = profil.slice(profil.indexOf('id="pridat-kamarada"'));
  assert.match(formular.slice(0, 3000), /id="friend-code"/, "za kotvou opravdu následuje pole pro kód");
  assert.match(profil, /window\.location\.hash !== "#pridat-kamarada"[\s\S]{0,300}scrollIntoView/, "doscrollování po vykreslení formuláře");
  assert.doesNotMatch(OBRAZOVKA(), /#add-friend/, "stará kotva na začátek celé sekce se už nepoužívá");
});

test("A4 – bez kamarádů se neukáže ani samostatný vlastní řádek", () => {
  const src = OBRAZOVKA();
  assert.match(src, /showOwnRowSeparately = Boolean\(you && !you\.inTop && friendsView !== "no-friends"\)/);
});

// --- B. Kamarádi s body -------------------------------------------------------

test("B1 – když má kamarád body, vykreslí se normální žebříček", () => {
  assert.equal(
    resolveFriendsBoardView({ friendCount: 2, entries: [zaznam(1, "Kamarád"), zaznam(2, "Já", true)] }),
    "board"
  );
});

test("B2 – velké lákadlo na přidání kamaráda se ukazuje jen v prázdném stavu", () => {
  const src = OBRAZOVKA();
  assert.doesNotMatch(src, /Chceš soutěžit s někým známým/, "trvalá promo sekce je pryč");
  assert.equal((src.match(/Přidat kamaráda/g) ?? []).length, 1, "CTA existuje právě jednou");
  const cta = src.indexOf("Přidat kamaráda");
  const blok = src.slice(src.indexOf('friendsView === "no-friends"'), src.indexOf('friendsView === "friends-without-score"'));
  assert.ok(cta > 0 && blok.includes("Přidat kamaráda"), "CTA leží uvnitř stavu bez kamarádů");
});

// --- C. Kamarádi bez bodů -----------------------------------------------------

test("C1 – kamarád s nulou není účastník pořadí (R33 beze změny)", () => {
  const ja = hrac("Já", { isYou: true });
  const kamarad = hrac("Kamarad");
  const entries = rankPlayers([ja, kamarad], totals([[ja, 50, 1], [kamarad, 0, 0]]));
  assert.deepEqual(entries.map((e) => e.name), ["Já"], "nula se do pořadí nedostane");
});

test("C2 – kamarádi bez bodů mají přesný text", () => {
  assert.equal(resolveFriendsBoardView({ friendCount: 1, entries: [] }), "friends-without-score");
  assert.equal(
    resolveFriendsBoardView({ friendCount: 3, entries: [zaznam(1, "Já", true)] }),
    "friends-without-score",
    "vlastní řádek není kamarád"
  );
  const src = OBRAZOVKA();
  assert.match(src, /Tvoji kamarádi zatím nemají žádné body\./);
  assert.match(src, /Tak vyrazíte spolu\?/);
});

test("C3 – žádný samostatný seznam „ještě nehráli“ a žádné tlačítko na společnou výpravu", () => {
  const src = OBRAZOVKA();
  assert.doesNotMatch(src, /ještě nehrál|nehráli|Vyrazit spolu|pozvat|Pozvat/i);
  const blok = src.slice(src.indexOf('friendsView === "friends-without-score"'), src.indexOf('tab === "global"'));
  assert.doesNotMatch(blok, /<button|<Link/, "je to jen text");
});

// --- D. Obsah řádku -----------------------------------------------------------

test("D1 – z řádku zmizel počet dokončených her", () => {
  const src = OBRAZOVKA();
  assert.doesNotMatch(src, /formatGames/, "formátovač počtu her je pryč");
  assert.doesNotMatch(src, /dokončená hra|dokončené hry|\d+ dokončených her/, "žádný počet her v UI");
  const radek = src.slice(src.indexOf("function EntryRow("), src.indexOf("export function LeaderboardScreen"));
  assert.doesNotMatch(radek, /completed/, "řádek už počet her vůbec nedostává");
  // ve schválené hlavičce slovo „dokončených her" zůstává, je to popis bodování
  assert.match(src, /Počítají se tvoje nejlepší výsledky z dokončených her\./);
});

test("D2 – řádek nese pořadí, avatar, přezdívku a body", () => {
  const radek = OBRAZOVKA().slice(
    OBRAZOVKA().indexOf("function EntryRow("),
    OBRAZOVKA().indexOf("export function LeaderboardScreen")
  );
  assert.match(radek, /\{rank \?\? "–"\}/);
  assert.match(radek, /<AvatarPreview avatar=\{avatar\} size=\{44\} \/>/);
  assert.match(radek, /\{name\}/);
  assert.match(radek, /\{score\}/);
  assert.match(radek, /bodů/);
});

test("D3 – přezdívka se nezkracuje třemi tečkami (R33)", () => {
  const radek = OBRAZOVKA().slice(
    OBRAZOVKA().indexOf("function EntryRow("),
    OBRAZOVKA().indexOf("export function LeaderboardScreen")
  );
  assert.doesNotMatch(radek, /truncate/, "žádný ořez");
  assert.match(radek, /break-words/, "dlouhá přezdívka se zalomí");
});

test("D4 – vlastní řádek zůstává rozlišený", () => {
  const radek = OBRAZOVKA().slice(
    OBRAZOVKA().indexOf("function EntryRow("),
    OBRAZOVKA().indexOf("export function LeaderboardScreen")
  );
  assert.match(radek, /isYou \|\| highlight \? "border-lime\/30 bg-lime\/8"/);
  assert.match(radek, /\{isYou \? <div[^>]*>Ty<\/div> : null\}/);
});

// --- E. Shoda bodů ------------------------------------------------------------

test("E1 – shodné skóre = shodné pořadí a další pořadí přeskočí (R33)", () => {
  const a = hrac("Alena");
  const b = hrac("Bara");
  const c = hrac("Cyril");
  const d = hrac("David");
  const entries = rankPlayers([a, b, c, d], totals([[a, 190, 1], [b, 170, 1], [c, 170, 1], [d, 150, 1]]));
  assert.deepEqual(entries.map((e) => e.rank), [1, 2, 2, 4]);
});

test("E2 – při shodě se vykresluje abecedně podle aktuální přezdívky", () => {
  const s = hrac("Šimon");
  const a = hrac("adam");
  const c = hrac("Čenda");
  const b = hrac("Bára");
  const entries = rankPlayers([s, a, c, b], totals([[s, 100, 1], [a, 100, 1], [c, 100, 1], [b, 100, 1]]));
  assert.deepEqual(entries.map((e) => e.name), ["adam", "Bára", "Čenda", "Šimon"], "české řazení, velikost písmen nerozhoduje");
});

test("E3 – abecední pořadí nemění čísla pořadí", () => {
  const z = hrac("Zdenek");
  const a = hrac("Adam");
  const entries = rankPlayers([z, a], totals([[z, 100, 1], [a, 100, 1]]));
  assert.deepEqual(entries.map((e) => e.rank), [1, 1], "oba jsou první");
  assert.deepEqual(entries.map((e) => e.name), ["Adam", "Zdenek"], "jen se vykreslí abecedně");
});

test("E4 – abeceda se uplatní jen uvnitř shody, ne napříč skóre", () => {
  const z = hrac("Zdenek");
  const a = hrac("Adam");
  const entries = rankPlayers([a, z], totals([[a, 10, 1], [z, 200, 1]]));
  assert.deepEqual(entries.map((e) => [e.rank, e.name]), [[1, "Zdenek"], [2, "Adam"]], "rozhodují body, ne abeceda");
});

test("E5 – pořadí je stabilní bez ohledu na pořadí z databáze", () => {
  const hraci = [hrac("Cyril"), hrac("Alena"), hrac("Bara")];
  const t = totals(hraci.map((h) => [h, 100, 1] as [LeaderboardPlayer, number, number]));
  const prvni = rankPlayers(hraci, t).map((e) => e.name);
  const druhy = rankPlayers([...hraci].reverse(), t).map((e) => e.name);
  assert.deepEqual(prvni, druhy, "seznam se mezi načteními nemíchá");
});

// --- F. Záložky ---------------------------------------------------------------

test("F1 – výchozí záložka je Kamarádi a názvy zůstávají", () => {
  const src = OBRAZOVKA();
  assert.match(src, /useState<"friends" \| "global">\("friends"\)/);
  assert.match(src, /label: "Kamarádi"/);
  assert.match(src, /label: "Všichni"/);
});

test("F2 – záložky mají správnou přístupnostní sémantiku", () => {
  const src = OBRAZOVKA();
  assert.match(src, /role="tablist"/);
  assert.match(src, /aria-label="Žebříček"/);
  assert.match(src, /role="tab"/);
  assert.match(src, /aria-selected=\{tab === item\.value\}/);
  assert.match(src, /aria-controls=\{`leaderboard-panel-\$\{item\.value\}`\}/);
  assert.match(src, /tabIndex=\{tab === item\.value \? 0 : -1\}/);
  assert.match(src, /role="tabpanel"/);
  assert.match(src, /aria-labelledby=\{`leaderboard-tab-\$\{tab\}`\}/);
});

test("F3 – hlavička je zjednodušená na schválený text", () => {
  const src = OBRAZOVKA();
  assert.match(src, /<h1[^>]*>Žebříček<\/h1>/);
  assert.match(src, /Počítají se tvoje nejlepší výsledky z dokončených her\./);
  assert.doesNotMatch(src, /SOUTĚŽ|Soutěž/);
  assert.doesNotMatch(src, /Žebříček objevitelů/);
  assert.doesNotMatch(src, /Lepší opakování body přidá/);
});

// --- G. Nezávislý stav záložek ------------------------------------------------

test("G1 – už načtená data se kvůli chybě neschovávají", () => {
  assert.equal(resolveBoardView("error", true), "ready", "chyba nepřekryje známý seznam");
  assert.equal(resolveBoardView("loading", true), "ready");
  assert.equal(resolveBoardView("error", false), "error");
  assert.equal(resolveBoardView("idle", false), "loading");
  assert.equal(resolveBoardView("loading", false), "loading");
  assert.equal(resolveBoardView("ready", true), "ready");
});

test("G2 – každá záložka má vlastní data i vlastní stav načítání", () => {
  const src = OBRAZOVKA();
  assert.match(src, /const \[friendsTab, setFriendsTab\] = useState<TabState>\(INITIAL_TAB\)/);
  assert.match(src, /const \[globalTab, setGlobalTab\] = useState<TabState>\(INITIAL_TAB\)/);
  assert.doesNotMatch(src, /const \[loading, setLoading\]|const \[error, setError\]/, "žádný sdílený stav");
  assert.match(src, /const setTabState = tab === "friends" \? setFriendsTab : setGlobalTab;/, "zapisuje se jen do aktivní záložky");
  assert.match(src, /const active = tab === "friends" \? friendsTab : globalTab;/);
});

test("G3 – selhání jedné záložky nesahá na data druhé", () => {
  const src = OBRAZOVKA();
  const nacitani = src.slice(src.indexOf("async function loadActiveBoard()"), src.indexOf("void loadActiveBoard();"));
  const zapisy = nacitani.match(/setFriendsTab|setGlobalTab|setTabState/g) ?? [];
  assert.ok(zapisy.length > 0 && zapisy.every((z) => z === "setTabState"), "načítání zapisuje výhradně do aktivní záložky");
  // každá chybová větev buď jen prohodí status (spread), nebo respektuje už načtená data
  const chybove = nacitani.match(/setTabState\([^;]*?"error"[^;]*?\);/g) ?? [];
  assert.ok(chybove.length >= 3, "chybové větve existují");
  for (const vetev of chybove) {
    const zachovavaData = /\.\.\.current, status: "error"/.test(vetev) || /current\.board \? current :/.test(vetev);
    assert.ok(zachovavaData, `chybová větev nesmí přepsat načtený seznam: ${vetev}`);
  }
});

test("G4 – přepnutí na už načtenou záložku ji znovu nenačítá ani nepřebarví", () => {
  const src = OBRAZOVKA();
  assert.match(src, /if \(active\.board !== null \|\| active\.status === "loading"\) \{\s*return;/);
});

// --- H. R33 zůstává beze změny ------------------------------------------------

test("H1 – bodování a započítání her se nezměnilo", () => {
  const publikovane = new Map([["klamovka", 190]]);
  const rows = [
    { profile_code: "BAT-AAAAAA", location_id: "klamovka", best_score: 160, status: "completed" as const },
    { profile_code: "BAT-AAAAAA", location_id: "klamovka", best_score: 110, status: "in_progress" as const, first_completed_at: "2026-09-11T00:00:00Z" }
  ];
  const t = totalsByProfile(rows, publikovane);
  assert.deepEqual(t.get("BAT-AAAAAA"), { score: 160, completed: 1 }, "hra se počítá jednou, platí nejlepší výsledek");
});

test("H2 – nepublikovaná hra nepřidá bod", () => {
  const t = totalsByProfile(
    [{ profile_code: "BAT-AAAAAA", location_id: "budejovice", best_score: 100, status: "completed" as const }],
    new Map([["klamovka", 190]])
  );
  assert.equal(t.get("BAT-AAAAAA"), undefined);
});

test("H3 – vyřazený profil se neobjeví ani neovlivní pořadí", () => {
  const test1 = hrac("Testovaci", { excluded: true });
  const a = hrac("Alena");
  const b = hrac("Bara");
  const entries = rankPlayers([test1, a, b], totals([[test1, 500, 5], [a, 190, 1], [b, 170, 1]]));
  assert.deepEqual(entries.map((e) => [e.rank, e.name]), [[1, "Alena"], [2, "Bara"]]);
});

test("H4 – TOP 20 a vlastní pozice mimo něj zůstávají", () => {
  const hraci = Array.from({ length: 25 }, (_, i) => hrac(`H${String(i).padStart(2, "0")}`));
  const ja = hrac("Ja", { isYou: true });
  const t = totals([...hraci.map((h, i) => [h, 1000 - i, 1] as [LeaderboardPlayer, number, number]), [ja, 1, 1]]);
  const vysledek = buildLeaderboard({ players: [...hraci, ja], totals: t, limit: 20 });
  assert.equal(vysledek.entries.length, 20);
  assert.equal(vysledek.you?.inTop, false);
  assert.equal(vysledek.you?.rank, 26);
  assert.equal(vysledek.rankedPlayers, 26);
});

test("H5 – hráč s nulou není v pořadí, ale vidí sám sebe", () => {
  const ja = hrac("Ja", { isYou: true });
  const vysledek = buildLeaderboard({ players: [ja], totals: totals([[ja, 0, 0]]), limit: 20 });
  assert.deepEqual(vysledek.entries, []);
  assert.equal(vysledek.you?.rank, null);
  assert.equal(vysledek.you?.score, 0);
  assert.match(OBRAZOVKA(), /Dokonči první hru a dostaň se do žebříčku\./);
});

test("H6 – žebříček zůstává odvozený, jen pro přihlášené, bez stránkování", () => {
  const api = API();
  assert.match(api, /error: "unauthorized" \}, \{ status: 401 \}/);
  assert.match(api, /Math\.min\(20, Math\.max\(5, Number\(body\?\.limit\) \|\| 20\)\)/);
  assert.doesNotMatch(api, /offset|page|cursor/i, "žádné stránkování");
  assert.doesNotMatch(api, /from\("leaderboard/, "žádná paralelní tabulka žebříčku");
  assert.match(api, /excluded_from_leaderboard/, "vyřazení testovacích profilů zůstává");
});

test("H7 – friendCount je nová informace navíc, pravidla nemění", () => {
  const api = API();
  assert.match(api, /friendCount = Math\.max\(0, memberIds\.size - 1\)/);
  assert.match(api, /entries, you, rankedPlayers, friendCount/);
  const pocitani = api.slice(api.indexOf("const totals = totalsByProfile"), api.indexOf("return NextResponse.json({ ok: true, scope"));
  assert.doesNotMatch(pocitani, /friendCount/, "do výpočtu skóre ani pořadí nevstupuje");
});
