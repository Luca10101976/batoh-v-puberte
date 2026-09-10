import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// R27: papírová hra. Tiskový sešit je pracovní list do terénu; vyhodnocení
// zůstává na normální herní cestě R23–R26. Testy hlídají obojí: že v sešitu je
// všechno potřebné, a hlavně že v něm NENÍ nic, co má zůstat na serveru.

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const PRINT = "app/api/export/game-content/route.ts";

// ---------------------------------------------------------------------------
// A. Sešit obsahuje, co hráč venku potřebuje
// ---------------------------------------------------------------------------

test("A1 – sešit nese herní obsah zastávky i úkolu", () => {
  const src = read(PRINT);
  for (const field of ["episode.name", "episode.intro", "episode.background", "task.title", "task.content", "task.options"]) {
    assert.ok(src.includes(field), `v tisku chybí ${field}`);
  }
});

test("A2 – u každého úkolu je místo na vlastní odpověď", () => {
  const src = read(PRINT);
  assert.match(src, /class="answer-line">Odpověď: \./);
  assert.match(src, /Splněno na místě/, "fotoúkol má mít vlastní řádek");
});

test("A3 – sešit vysvětluje, že se odpovědi doma přepíšou do aplikace", () => {
  const src = read(PRINT);
  assert.match(src, /class="howto"/, "chybí blok s postupem");
  assert.match(src, /odpovědi postupně přepiš/i);
  assert.match(src, /www\.postope\.cz/);
  assert.match(src, /spočítá body/i, "hráč se musí dozvědět, že body počítá aplikace");
});

test("A4 – sešit upozorňuje na tři pokusy", () => {
  const src = read(PRINT);
  assert.match(src, /tři pokusy/i);
  assert.match(src, /po třetí špatné odpovědi/i);
});

test("A5 – sešit už nenutí hráče počítat body na papíře", () => {
  const src = read(PRINT);
  assert.ok(!/Body celkem: \./.test(src), "zůstala kolonka na ruční součet bodů");
  assert.ok(!/Správně: \./.test(src), "zůstala kolonka na ruční počítání správných");
  assert.match(src, /Na papíře nic sčítat nemusíš/i);
});

test("A6 – fotka zastávky se tiskne, když ji hra má", () => {
  const src = read(PRINT);
  assert.match(src, /function renderPrintableStopPhoto/);
  assert.match(src, /episode\.illustrationImage/);
  assert.match(src, /_next\/image\?url=/, "fotka má jít přes optimalizátor, ne v originále");
});

test("A7 – hra bez fotky se vytiskne normálně", () => {
  const src = read(PRINT);
  const fn = src.slice(src.indexOf("function renderPrintableStopPhoto"), src.indexOf("function renderPrintableEpisode"));
  assert.match(fn, /if \(!source\) \{\s*return "";/, "chybí větev pro zastávku bez fotky");
});

test("A8 – tisk drží rozumnou velikost a poměr stran", () => {
  const src = read(PRINT);
  assert.match(src, /max-height: 52mm/, "fotka nemá mít neomezenou výšku");
  assert.match(src, /object-fit: cover/, "má se zachovat poměr stran");
  assert.match(src, /\.episode-card \{ page-break-inside: avoid; \}/, "zastávka se nemá lámat přes stránky");
});

// ---------------------------------------------------------------------------
// B. Sešit neobsahuje nic, co má zůstat na serveru
// ---------------------------------------------------------------------------

test("B1 – tisková větev nesahá na server-only data", () => {
  const src = read(PRINT);
  const printPart = src.slice(src.indexOf("type PrintableLocation"), src.indexOf("async function buildRows"));
  for (const forbidden of [
    "correctAnswers",
    "correct_answer",
    "hintText",
    "hint_text",
    "minCorrectMatches",
    "endingTitle",
    "endingStory",
    "playerMessage"
  ]) {
    assert.ok(!printPart.includes(forbidden), `tisková verze pracuje s ${forbidden}`);
  }
});

test("B2 – tisk staví na veřejné podobě hry, ne na exportní", () => {
  const src = read(PRINT);
  const build = src.slice(src.indexOf("async function buildPrintableHtml"), src.indexOf("async function buildRows"));
  assert.match(build, /getGameplayLocation\(/, "tisk musí brát obsah veřejnou cestou");
  assert.ok(!/getGameplayLocationForExport/.test(build), "tisk nesmí sáhnout na verzi s odpověďmi");
  assert.match(src, /PrintableLocation\[\]/);
});

test("B3 – typ tiskové hry závěr vůbec nemá", () => {
  const src = read(PRINT);
  const type = src.slice(src.indexOf("type PrintableLocation"), src.indexOf("function isPresent"));
  assert.ok(!/ending|playerMessage/i.test(type), "typ tiskové hry pořád nese závěr");
});

test("B4 – nápověda zůstává funkcí aplikace", () => {
  const src = read(PRINT);
  assert.ok(!/hint/i.test(src.slice(src.indexOf("function renderPrintableTask"), src.indexOf("function renderPrintableEpisode"))));
  // A v aplikaci pořád stojí za body: pravidlo R25 se nemění.
  const rules = read("lib/game-rules.ts");
  assert.match(rules, /POINTS_PER_TASK_WITH_HINT = 5/);
});

// ---------------------------------------------------------------------------
// C. Papírová cesta v aplikaci
// ---------------------------------------------------------------------------

test("C1 – papírová cesta žije v tiskové sekci detailu hry", () => {
  const detail = read("components/location-detail-screen.tsx");
  assert.match(detail, /format=print&locationId=/);
  assert.match(detail, /Vytiskni si sešit/);
  assert.match(detail, /Doma je přepiš do téhle hry/);
});

test("C2 – zvláštní papírová obrazovka už neexistuje a nikde na ni nevede odkaz", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "app/paper-score")), "stránka /paper-score zůstala");
  assert.ok(!fs.existsSync(path.join(ROOT, "components/paper-score-screen.tsx")), "komponenta zůstala");

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        files.push(full);
      }
    }
  };
  walk(path.join(ROOT, "app"));
  walk(path.join(ROOT, "components"));
  walk(path.join(ROOT, "lib"));
  for (const file of files) {
    assert.ok(
      !fs.readFileSync(file, "utf8").includes("paper-score"),
      `${path.relative(ROOT, file)}: zůstala reference na /paper-score`
    );
  }
});

test("C3 – stará adresa se přesměruje, ať nikomu nespadne záložka", () => {
  const config = read("next.config.mjs");
  assert.match(config, /source: "\/paper-score"/);
  assert.match(config, /destination: "\/"/);
});

// ---------------------------------------------------------------------------
// D. Herní pravidla se nemění
// ---------------------------------------------------------------------------

test("D1 – R23–R26 zůstávají beze změny", () => {
  assert.match(read("lib/game-rules.ts"), /POINTS_PER_TASK = 10/);
  assert.match(read("lib/task-order.ts"), /export function resolveTaskAvailability/);
  assert.match(read("app/api/game/submit-task-answer/route.ts"), /resolveServerTaskAvailability\(/);
  assert.match(read("app/api/game/complete-location/route.ts"), /getGameplayEnding\(locationId\)/);
  assert.match(read("lib/gameplay-server.ts"), /export async function getGameplayEnding/);
});

test("D2 – žádná zvláštní cesta pro papírový výsledek nevznikla", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "app/api/game/submit-paper-score")), "vznikl endpoint na papírové body");
  const complete = read("app/api/game/complete-location/route.ts");
  assert.match(complete, /manual_completion_removed/, "ruční dokončení musí zůstat zavřené");
});

// ---------------------------------------------------------------------------
// E. Service worker
// ---------------------------------------------------------------------------

test("E1 – service worker neukládá předběžné dotazy Nextu", () => {
  const sw = read("public/sw.js");
  assert.match(sw, /searchParams\.has\("_rsc"\)/);
  const guard = sw.indexOf('searchParams.has("_rsc")');
  const put = sw.indexOf("cache.put(event.request");
  assert.ok(guard > 0 && guard < put, "kontrola musí být před ukládáním do cache");
});

test("E2 – nová verze cache vyčistí starou", () => {
  const sw = read("public/sw.js");
  assert.match(sw, /const CACHE_NAME = "traki-na-stope-v6"/);
  assert.match(sw, /keys\.filter\(\(key\) => key !== CACHE_NAME\)\.map\(\(key\) => caches\.delete\(key\)\)/);
});

test("E3 – PWA a bezpečný fallback zůstávají", () => {
  const sw = read("public/sw.js");
  assert.match(sw, /PRECACHE_URLS = \["\/", "\/offline", "\/manifest\.webmanifest", "\/icon\.png", "\/apple-icon\.png"\]/);
  assert.match(sw, /caches\.match\(OFFLINE_URL\)/);
  // caching se nerozšiřuje na herní data ani na aplikaci
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(sw, /pathname\.startsWith\("\/_next\/"\)/);
  assert.match(sw, /requestUrl\.origin !== self\.location\.origin/);
});

test("E4 – offline stránka neslibuje offline hraní a ukáže na tiskovou verzi", () => {
  const page = read("app/offline/page.tsx");
  assert.match(page, /jen s připojením/i);
  assert.match(page, /tiskovou verzi/i);
});
