import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { shouldApplyServerList, shouldApplyServerNumber } from "./overview-sync.ts";
import { formatRecoveryKey, normalizeRecoveryKey } from "./recovery-key.ts";
import { generateRecoveryKey, hashRecoveryKey } from "./recovery-key-server.ts";

// R43: technická chyba se nikdy nesmí tvářit jako skutečná hodnota.
//
// Čtyři regrese k nálezům z auditu. Kde to architektura dovolí, testuje se
// chování; u API rout se testuje zdroják, protože routy používají alias "@/",
// který node --test neumí načíst, a kvůli testu se architektura nepředělává.
const ROOT = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

// ---------------------------------------------------------------------------
// 1. /api/profile/overview nevydává falešnou nulu ani falešně prázdné přátele
//
// Chování routy nejde spustit (alias "@/"), takže se ověřuje, že žádné z jejích
// čtení nezahazuje `error` a že nezjištěná hodnota odchází jako null se jménem
// v `unavailable`. Test je psaný tak, aby spadl při návratu původního vzorce
// „vezmi jen data a chybu ignoruj".
// ---------------------------------------------------------------------------

test("overview: žádné čtení nezahazuje error", () => {
  const src = read("app/api/profile/overview/route.ts");
  const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "");

  // destrukturalizace `const { data: x } = await` bez `error` je přesně ten vzorec,
  // kterým chyba mizela
  const blindReads = (withoutComments.match(/const \{\s*data:[^}]*\}\s*=\s*await/g) ?? []).filter(
    (fragment) => !/\berror\b/.test(fragment)
  );
  assert.deepEqual(blindReads, [], "každé čtení musí vyhodnotit i error");
});

test("overview: nezjištěná hodnota odchází jako null a je pojmenovaná", () => {
  const src = read("app/api/profile/overview/route.ts");

  assert.match(src, /let totalScore: number \| null = 0;/, "skóre musí umět být null");
  assert.match(src, /let completedGames: number \| null = 0;/, "počet dohraných musí umět být null");
  assert.match(src, /let publishedGames: number \| null = 0;/, "počet her musí umět být null");
  assert.match(src, /const unavailable: string\[\] = \[\];/, "routa musí umět pojmenovat, co nezjistila");

  for (const name of ["publishedGames", "score", "friends", "session"]) {
    assert.match(src, new RegExp(`unavailable\\.push\\("${name}"\\)`), `${name} musí jít označit za nezjištěný`);
  }

  assert.match(src, /if \(progressError\) \{\s*throw new Error/, "chyba čtení postupu nesmí skončit nulou");
  assert.match(src, /const friends = friendsUnknown\s*\?\s*null/, "nezjištění přátelé musí být null, ne prázdné pole");
  assert.match(src, /totalScore = null;/, "nezjištěné skóre musí být null, ne 0");

  // každá úspěšná odpověď (bez výpravy, s nezjištěnou výpravou i s výpravou)
  // musí nést seznam nezjištěných hodnot – jinak by se jedna z cest tvářila,
  // že je všechno v pořádku
  const responses = src.match(/ok: true,\s*\n\s*totalScore,/g) ?? [];
  assert.ok(responses.length >= 2, "úspěšné odpovědi musí mít stejný tvar");
  assert.equal(
    (src.match(/\n\s*unavailable[,:]/g) ?? []).length,
    responses.length,
    "každá úspěšná odpověď musí nést unavailable"
  );
});

test("overview: prázdný seznam vlastních profilů se bere jako chyba čtení", () => {
  const src = read("app/api/profile/overview/route.ts");
  assert.match(src, /const ownProfilesUnknown = ownProfiles\.length === 0;/);
  assert.match(src, /friendsUnknown = ownProfilesUnknown/, "bez vlastních profilů nesmí vzniknout „žádní kamarádi“");
});

test("child-profile/me: nezjištěný postup odchází jako null, ne jako prázdno", () => {
  const src = read("app/api/child-profile/me/route.ts");
  assert.match(src, /if \(progressQuery\.error\)/, "chyba čtení postupu se musí vyhodnotit");
  assert.match(src, /progress: progressUnavailable \? null : progressRows/, "nezjištěný postup musí být null");
  assert.match(src, /games: progressUnavailable \? null : games/, "bez postupu nemá smysl posílat hry");
});

// ---------------------------------------------------------------------------
// 2. Klient nepřepíše skóre ani přátele hodnotou, kterou server nezná.
//    Pravidlo je čistá funkce, takže se testuje chování.
// ---------------------------------------------------------------------------

test("klient: skutečná nula se synchronizuje, nezjištěná hodnota ne", () => {
  assert.equal(shouldApplyServerNumber(0), true, "nula je platný výsledek a musí se projevit");
  assert.equal(shouldApplyServerNumber(180), true);
  assert.equal(shouldApplyServerNumber(null), false, "null = server to nezjistil");
  assert.equal(shouldApplyServerNumber(undefined), false, "chybějící pole = nevíme");
  assert.equal(shouldApplyServerNumber(Number.NaN), false, "NaN není hodnota");
  assert.equal(shouldApplyServerNumber("0"), false, "řetězec není číslo");
});

test("klient: prázdný seznam se synchronizuje, nezjištěný ne", () => {
  assert.equal(shouldApplyServerList([]), true, "hráč opravdu nikoho nemá – to se projevit musí");
  assert.equal(shouldApplyServerList([{ code: "BAT-AAAAAA" }]), true);
  assert.equal(shouldApplyServerList(null), false, "null = server seznam nezjistil");
  assert.equal(shouldApplyServerList(undefined), false);
});

test("klient: profil i stav aplikace používají stejné pravidlo", () => {
  const profile = read("components/profile-screen.tsx");
  assert.match(profile, /shouldApplyServerNumber\(payload\.totalScore\)/, "skóre se smí přepsat jen známou hodnotou");
  assert.match(profile, /shouldApplyServerNumber\(payload\.publishedGames\)/);
  assert.match(profile, /shouldApplyServerList\(payload\.friends\)/, "kamarádi se smí přepsat jen známým seznamem");
  assert.ok(
    !/typeof payload\.totalScore === "number"/.test(profile),
    "starý test na typ čísla se nesmí vrátit – nula z výpadku je taky číslo"
  );

  // neúspěšné načtení nesmí mazat lokální seznam kamarádů
  const overviewFn = profile.slice(profile.indexOf("const fetchProfileOverview"));
  const beforePayload = overviewFn.slice(0, overviewFn.indexOf("const payload"));
  assert.ok(
    !/setFriendsFromCloud\(\[\]\)/.test(beforePayload) && !/setCloudFriends\(\[\]\)/.test(beforePayload),
    "chybové větve nesmí vyprázdnit kamarády"
  );

  const state = read("components/app-state-provider.tsx");
  assert.match(state, /shouldApplyServerList\(payload\?\.progress\)/, "postup se smí přepsat jen známým seznamem");
  assert.match(state, /if \(progressUnavailable\) \{/, "bez známého postupu se nesmí přepsat dokončené hry ani skóre");
});

// ---------------------------------------------------------------------------
// 3. complete-location nikdy netvrdí „nemáš hotové úkoly", když stav nezná.
// ---------------------------------------------------------------------------

test("complete-location: chyba čtení stavu končí technickou chybou, ne obviněním hráče", () => {
  const src = read("app/api/game/complete-location/route.ts");

  assert.match(
    src,
    /const \{ data: existingProgress, error: existingProgressError \}/,
    "čtení hotového stavu musí vyhodnotit error"
  );
  assert.match(
    src,
    /if \(existingProgressError && existingProgressError\.code !== "PGRST116"\) \{[\s\S]{0,220}error: "progress_load_failed"[\s\S]{0,60}status: 500/,
    "nezjištěný stav musí skončit 500, ne pokračováním"
  );

  // pořadí je podstatné: kontrola chyby musí předcházet hlášce o nedokončené hře
  const errorCheck = src.indexOf("existingProgressError && existingProgressError.code");
  const notFinished = src.indexOf('error: "mission_not_finished"');
  assert.ok(errorCheck > 0 && notFinished > 0, "obě větve musí existovat");
  assert.ok(errorCheck < notFinished, "chyba čtení se musí vyhodnotit dřív, než se hráči něco vytkne");
});

// ---------------------------------------------------------------------------
// 4. Traki klíč: co hráč uvidí při vytvoření, musí redeem najít.
//    Tohle je čistá funkce, takže test je plně behaviorální.
// ---------------------------------------------------------------------------

test("recovery key: klíč, jak ho hráč vidí, se po opsání zahashuje na totéž", () => {
  process.env.RECOVERY_KEY_PEPPER = "r43-testovaci-pepper-dost-dlouhy-aby-prosel";

  for (let i = 0; i < 25; i += 1) {
    // create: server vygeneruje kanonický tvar, uloží jeho hash a hráči ukáže formát
    const canonical = generateRecoveryKey();
    const storedHash = hashRecoveryKey(canonical);
    const shownToPlayer = formatRecoveryKey(canonical);

    // redeem: hráč klíč opíše, server ho normalizuje a hledá podle hashe
    for (const typed of [
      shownToPlayer,
      shownToPlayer.toLowerCase(),
      shownToPlayer.replace(/-/g, " "),
      ` ${shownToPlayer} `,
      shownToPlayer.replace(/-/g, "")
    ]) {
      const normalized = normalizeRecoveryKey(typed);
      assert.ok(normalized, `„${typed}“ musí jít normalizovat`);
      assert.equal(hashRecoveryKey(normalized!), storedHash, `„${typed}“ musí najít stejný profil`);
    }
  }
});

test("recovery key: jiný klíč nikdy nenajde cizí profil", () => {
  process.env.RECOVERY_KEY_PEPPER = "r43-testovaci-pepper-dost-dlouhy-aby-prosel";
  const hashes = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    hashes.add(hashRecoveryKey(generateRecoveryKey()));
  }
  assert.equal(hashes.size, 200, "dva různé klíče nesmí vést na stejný profil");
});

test("recovery key: create ukládá hash a redeem hledá podle něj a podle vlastníka", () => {
  const create = read("app/api/recovery-key/create/route.ts");
  assert.match(create, /recovery_key_hash: hash/, "do databáze jde hash, ne klíč");
  assert.ok(!/recovery_key: canonical\b/.test(create), "kanonický klíč se nesmí ukládat");
  assert.match(create, /recovery_key: formatRecoveryKey\(canonical\)/, "hráč dostane formátovaný tvar");

  const redeem = read("app/api/recovery-key/redeem/route.ts");
  assert.match(redeem, /hash = hashRecoveryKey\(canonical\)/, "redeem hledá podle hashe opsaného klíče");
  assert.match(redeem, /\.eq\("recovery_key_hash", hash\)/);
  assert.match(redeem, /getUserById\(profile\.parent_user_id\)/, "obnova musí vést na původní auth účet");
  assert.match(redeem, /type: "magiclink"/, "session vzniká jednorázovým tokenem, ne novou identitou");
});
