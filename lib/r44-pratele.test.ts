import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FRIEND_CODE_MAX_LENGTH,
  friendErrorMessage,
  isValidFriendCode,
  normalizeFriendCode,
  resolveFriendsView,
  sortFriendsByName
} from "./friends-model.ts";

// R44 krok 5: Přátelé jsou součást profilu. Server (child_friendships) je
// jediný zdroj pravdy; hráč nejdřív vidí, koho našel, a teprve pak přidává.
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const bezKomentaru = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "");
const PROFIL = () => bezKomentaru(read("components/profile-screen.tsx"));
/** Tělo fetchProfileOverview – konec se hledá až za začátkem, deps [supabase, syncCloudProfile] má i dřívější callback. */
const OVERVIEW_FN = () => {
  const src = PROFIL();
  const start = src.indexOf("const fetchProfileOverview = useCallback(");
  const end = src.indexOf("}, [supabase, syncCloudProfile]);", start);
  assert.ok(start > 0 && end > start, "fetchProfileOverview nalezeno");
  return src.slice(start, end);
};
const OVERVIEW = () => bezKomentaru(read("app/api/profile/overview/route.ts"));
const RESOLVE = () => bezKomentaru(read("app/api/friends/resolve/route.ts"));
const ADD = () => bezKomentaru(read("app/api/friends/add/route.ts"));
const REMOVE = () => bezKomentaru(read("app/api/friends/remove/route.ts"));

// --- 1–3: validace kódu --------------------------------------------------------

test("1 – vlastní kód se pozná ještě před dotazem na server", () => {
  const src = PROFIL();
  const hledani = src.slice(src.indexOf("async function handleFindFriend()"), src.indexOf("async function handleConfirmAddFriend()"));
  const vlastni = hledani.indexOf('normalizedCode === normalizePublicCode(state.playerCode)');
  const dotaz = hledani.indexOf('fetch("/api/friends/resolve"');
  assert.ok(vlastni > 0 && dotaz > vlastni, "kontrola vlastního kódu předchází volání serveru");
  assert.match(hledani.slice(vlastni, vlastni + 200), /Tohle je tvůj vlastní kód\./);
  assert.equal(friendErrorMessage("own_code", "x"), "Tohle je tvůj vlastní kód.");
  assert.match(ADD(), /ownPublicCode === targetPublicCode[\s\S]{0,120}own_code/, "server hlídá vlastní kód taky");
});

test("2 – neplatný kód: formát je přesně BAT- a šest znaků", () => {
  assert.equal(isValidFriendCode("BAT-AB12CD"), true);
  assert.equal(isValidFriendCode("bat-ab12cd"), true, "malá písmena se normalizují");
  assert.equal(isValidFriendCode("  BAT-AB12CD "), true, "mezery se ořežou");
  assert.equal(isValidFriendCode("BAT"), false);
  assert.equal(isValidFriendCode(""), false);
  assert.equal(isValidFriendCode("BAT-AB12C"), false, "pět znaků nestačí");
  assert.equal(isValidFriendCode("BAT-AB12CDE"), false, "sedm je moc");
  assert.equal(isValidFriendCode("XYZ-AB12CD"), false, "jiný prefix");
  assert.equal(normalizeFriendCode(" bat-ab12cd "), "BAT-AB12CD");
  assert.equal(FRIEND_CODE_MAX_LENGTH, "BAT-AB12CD".length);
  assert.equal(friendErrorMessage("invalid_code", "x"), "Zadej platný kód kamaráda.");
  const src = PROFIL();
  assert.match(src, /maxLength=\{FRIEND_CODE_MAX_LENGTH\}/);
  assert.match(src, /autoCapitalize="characters"/);
  assert.match(src, /autoCorrect="off"/);
  assert.match(src, /spellCheck=\{false\}/);
});

test("3 – neexistující kód má konkrétní hlášku, z resolve i z add", () => {
  assert.equal(friendErrorMessage("not_found", "x"), "Kamarád s tímto kódem nebyl nalezen.");
  assert.equal(friendErrorMessage("target_not_found", "x"), "Kamarád s tímto kódem nebyl nalezen.");
  assert.equal(friendErrorMessage("rate_limited", "x"), "Moc pokusů. Zkus to za chvíli.");
  assert.equal(friendErrorMessage("neco_jineho", "záloha"), "záloha");
});

// --- 4–5: náhled, potom přidání ------------------------------------------------

test("4 – existující hráč → náhled s avatarem a přezdívkou, bez kódu", () => {
  assert.match(RESOLVE(), /select\("id, child_name, profile_code, player_code, avatar"\)/, "resolve vrací avatar");
  assert.match(RESOLVE(), /avatar: targetProfile\.avatar \?\? null/);
  const src = PROFIL();
  const nahled = src.slice(src.indexOf("{friendPreview ? ("), src.indexOf("{friendMessage ? ("));
  assert.match(nahled, /<AvatarPreview avatar=\{friendPreview\.avatar\}/);
  assert.match(nahled, /\{friendPreview\.name\}/);
  assert.doesNotMatch(nahled, /friendPreview\.code/, "kód se v náhledu neopakuje");
});

test("5 – přátelství vznikne až kliknutím v náhledu, hledání ho nezakládá", () => {
  const src = PROFIL();
  const hledani = src.slice(src.indexOf("async function handleFindFriend()"), src.indexOf("async function handleConfirmAddFriend()"));
  assert.doesNotMatch(hledani, /\/api\/friends\/add/, "hledání nevolá add");
  assert.match(hledani, /setFriendPreview\(payload\.profile\)/);
  const pridani = src.slice(src.indexOf("async function handleConfirmAddFriend()"), src.indexOf("function normalizePublicCode"));
  assert.match(pridani, /if \(!supabase \|\| !friendPreview\) \{\s*return;/, "bez náhledu se nepřidává");
  assert.match(pridani, /\/api\/friends\/add/);
  const nahled = src.slice(src.indexOf("{friendPreview ? ("), src.indexOf("{friendMessage ? ("));
  assert.match(nahled, /onClick=\{\(\) => void handleConfirmAddFriend\(\)\}/);
});

// --- 6–8: oboustrannost, okamžité zobrazení, duplicita -------------------------

test("6 – přátelství je oboustranné: server zapisuje obě strany", () => {
  const add = ADD();
  assert.match(add, /child_profile_id: ownProfile\.id,\s*friend_child_profile_id: targetProfile\.id/);
  assert.match(add, /child_profile_id: targetProfile\.id,\s*friend_child_profile_id: ownProfile\.id/);
  assert.match(add, /onConflict: "child_profile_id,friend_child_profile_id"/);
});

test("7 – nový kamarád se objeví v seznamu hned, bez čekání na refresh", () => {
  const src = PROFIL();
  const pridani = src.slice(src.indexOf("async function handleConfirmAddFriend()"), src.indexOf("function normalizePublicCode"));
  const lokalne = pridani.indexOf("setCloudFriends((current) =>");
  const znovu = pridani.indexOf("await fetchProfileOverview();", lokalne);
  assert.ok(lokalne > 0 && znovu > lokalne, "nejdřív se doplní z náhledu, pak se server zeptá znovu");
  assert.match(pridani, /setFriendMessage\("Hotovo\."\)/);
  assert.match(src, /Teď byste se měli vidět navzájem\./);
});

test("8 – už existující přátelství rozhoduje server, ne lokální kopie", () => {
  const src = PROFIL();
  assert.doesNotMatch(src, /squadMembers/, "profil už nečte lokální partu");
  assert.doesNotMatch(src, /setFriendsFromCloud|addFriendByCode|removeFriendByCode/, "žádný zápis přátel do lokálního stavu");
  const pridani = src.slice(src.indexOf("async function handleConfirmAddFriend()"), src.indexOf("function normalizePublicCode"));
  assert.match(pridani, /payload\.alreadyFriend[\s\S]{0,200}Tohohle kamaráda už máš přidaného\./);
  assert.match(ADD(), /alreadyFriend: true/);
});

// --- 9–12: aktuální data, řazení, nula bodů -----------------------------------

test("9 – přezdívka kamaráda se čte živě z child_profiles přes UUID vztahu", () => {
  const ov = OVERVIEW();
  assert.match(ov, /from\("child_profiles"\)\.select\("id, child_name, profile_code, player_code, avatar"\)\.in\("id", friendIds\)/);
  assert.match(ov, /name: profile\.child_name \|\| "Kamarád"/);
  assert.doesNotMatch(ov, /name: row\.friend_display_name/, "uložená kopie jména se už nepoužívá");
  assert.match(ov, /outgoing\.map\(\(row\) => row\.friend_child_profile_id\)/);
  assert.match(ov, /incoming\.map\(\(row\) => row\.child_profile_id\)/);
});

test("10 – avatar kamaráda přichází ze stejného živého čtení", () => {
  assert.match(OVERVIEW(), /avatar: profile\.avatar \?\? null/);
  const src = PROFIL();
  assert.match(src, /avatar: friend\.avatar \?\? null/, "profil avatar přebírá z odpovědi");
  const seznam = src.slice(src.indexOf('{friendsView === "list" ? ('), src.indexOf("</section>", src.indexOf('{friendsView === "list" ? (')));
  assert.match(seznam, /<AvatarPreview avatar=\{friend\.avatar\} size=\{48\} \/>/);
});

test("11 – seznam je abecedně podle aktuální přezdívky (česky, bez ohledu na velikost)", () => {
  const serazeno = sortFriendsByName([
    { name: "Šimon", code: "BAT-000003" },
    { name: "adam", code: "BAT-000002" },
    { name: "Čenda", code: "BAT-000004" },
    { name: "Bára", code: "BAT-000001" }
  ]).map((f) => f.name);
  assert.deepEqual(serazeno, ["adam", "Bára", "Čenda", "Šimon"]);
  assert.match(OVERVIEW(), /localeCompare\(b\.name, "cs", \{ sensitivity: "base" \}\)/, "server řadí stejně");
});

test("12 – kamarád s 0 body a bez her je v seznamu vidět (žádný filtr podle bodů)", () => {
  const ov = OVERVIEW();
  const blok = ov.slice(ov.indexOf("const friendsList"), ov.indexOf("const friends = friendsUnknown"));
  assert.doesNotMatch(blok, /score|best_score|completed/, "seznam kamarádů nezná body ani hry");
  const src = PROFIL();
  const seznam = src.slice(src.indexOf('{friendsView === "list" ? ('), src.indexOf("</section>", src.indexOf('{friendsView === "list" ? (')));
  assert.doesNotMatch(seznam, /bod|score|her\b|rank|pořadí/i, "karta nese jen avatar, přezdívku, kód a Odebrat");
  assert.match(seznam, /\{friend\.name\}[\s\S]{0,200}\{friend\.code\}[\s\S]{0,600}Odebrat/);
});

// --- 13–14: odebrání ----------------------------------------------------------

test("13 – odebrání jde přes vlastní dialog, ne window.confirm", () => {
  const src = PROFIL();
  assert.doesNotMatch(src, /window\.confirm\(`Opravdu chceš odebrat/);
  assert.match(src, /role="dialog"[\s\S]{0,400}Odebrat \{friendToRemove\.name\} z přátel\?/);
  assert.match(src, /aria-label="Zavřít"/, "křížek");
  assert.match(src, /onClick=\{\(\) => setFriendToRemove\(null\)\}[\s\S]{0,80}>\s*<div\s+role="dialog"/, "klik mimo dialog zavírá");
  assert.match(src, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/, "klik do dialogu nezavírá");
  assert.match(src, /event\.key === "Escape"[\s\S]{0,60}setFriendToRemove\(null\)/, "Escape zavírá");
  const dialog = src.slice(src.indexOf('role="dialog"'), src.indexOf("{/* 6. Odhlásit */}"));
  assert.match(dialog, /onClick=\{\(\) => void confirmRemoveFriend\(\)\}/, "maže až tlačítko Odebrat");
});

test("14 – odebrání smaže obě strany a kamarád zmizí hned", () => {
  const rm = REMOVE();
  assert.match(rm, /\.eq\("child_profile_id", ownProfile\.id\)\s*\.eq\("friend_child_profile_id", targetProfile\.id\)/);
  assert.match(rm, /\.eq\("child_profile_id", targetProfile\.id\)\s*\.eq\("friend_child_profile_id", ownProfile\.id\)/);
  const src = PROFIL();
  const odebrani = src.slice(src.indexOf("async function confirmRemoveFriend()"), src.indexOf("async function handleCopyPlayerCode()"));
  const lokalne = odebrani.indexOf("setCloudFriends((current) => current.filter(");
  const znovu = odebrani.indexOf("await fetchProfileOverview();", lokalne);
  assert.ok(lokalne > 0 && znovu > lokalne, "nejdřív zmizí lokálně, pak se server zeptá znovu");
  assert.match(odebrani, /setFriendToRemove\(null\)/, "dialog se po úspěchu zavře");
});

// --- 15–17: loading / error / prázdno (R43) ------------------------------------

test("15 – dokud seznam neznáme, ukazuje se Načítám, ne prázdno", () => {
  assert.equal(resolveFriendsView("idle", 0), "loading");
  assert.equal(resolveFriendsView("loading", 0), "loading");
  assert.match(PROFIL(), /Načítám tvoje kamarády…/);
});

test("16 – chyba načtení má vlastní hlášku a nepřepíše známý seznam", () => {
  assert.equal(resolveFriendsView("error", 0), "error");
  assert.equal(resolveFriendsView("error", 2), "list", "známí kamarádi zůstávají vidět");
  assert.equal(resolveFriendsView("loading", 1), "list");
  const src = PROFIL();
  assert.match(src, /Kamarády se teď nepodařilo načíst\./);
  const fn = OVERVIEW_FN();
  assert.match(fn, /if \(!shouldApplyServerList\(payload\.friends\)\) \{\s*setFriendsLoadState\(\(current\) => \(current === "ready" \? current : "error"\)\);\s*return;/, "null od serveru = chyba, ne prázdno");
  assert.doesNotMatch(fn, /setCloudFriends\(\[\]\)/, "žádné falešné []");
  assert.match(src, /friendsView = resolveFriendsView\(cloudReady === false \? "error" : friendsLoadState, friends\.length\)/, "bez session není věčné načítání");
});

test("17 – skutečně prázdný seznam až po potvrzení serverem", () => {
  assert.equal(resolveFriendsView("ready", 0), "empty");
  assert.match(PROFIL(), /Zatím tu žádný kamarád není\./);
  const fn = OVERVIEW_FN();
  assert.match(fn, /setCloudFriends\(\s*sortFriendsByName\([\s\S]{0,400}setFriendsLoadState\("ready"\)/, "ready až po úspěšném uložení seznamu");
});

// --- 18–20: refresh, recovery, žádná localStorage závislost ---------------------

test("18 – refresh: stav načítání se odvozuje z průběhu fetchProfileOverview", () => {
  const fn = OVERVIEW_FN();
  assert.match(fn, /if \(!response\?\.ok\) \{\s*setFriendsLoadState\(\(current\) => \(current === "ready" \? current : "error"\)\)/);
  assert.match(fn, /setFriendsLoadState\(\(current\) => \(current === "ready" \? current : "loading"\)\)/);
  assert.doesNotMatch(fn, /setTimeout/, "žádné umělé čekání");
});

test("19 – recovery přes Traki klíč: seznam přátel přijde z overview po obnovení profilu", () => {
  const src = PROFIL();
  assert.match(src, /await ensureOwnCloudProfile\(\);\s*await fetchProfileOverview\(\);/, "po ověření účtu se přehled načte");
  assert.match(src, /table: "child_friendships"[\s\S]{0,80}void fetchProfileOverview\(\)/, "realtime změna přátel načte znovu");
});

test("20 – existence přátelství nezávisí na localStorage cache", () => {
  const src = PROFIL();
  assert.doesNotMatch(src, /squadMembers|localStorage\.getItem\("pan-batoh-state"\)/);
  assert.match(src, /const friends = cloudFriends;/);
  assert.doesNotMatch(src, /Identita objevitele|Ověřím kód|Tip: veřejný kód|Zadej kód kamaráda\./, "staré texty jsou pryč");
  assert.doesNotMatch(read("app/profile/page.tsx"), /party a bezpečnostních/);
  assert.doesNotMatch(read("components/app-state-provider.tsx"), /do tvé party|a parta`/);
});
