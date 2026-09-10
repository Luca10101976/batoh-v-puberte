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

test("A6 – tisk nepoužívá fotografie skutečných míst", () => {
  const src = read(PRINT);
  assert.ok(!/renderPrintableStopPhoto/.test(src), "zůstala funkce pro tisk fotky");
  assert.ok(!/class="stop-photo"/.test(src), "zůstala fotka zastávky");
  assert.ok(!/Podle téhle fotky poznáš místo/.test(src), "zůstal popisek k fotce");
  assert.ok(!/episode\.illustrationImage/.test(src), "tisk pořád čte obrázek zastávky");
  // Jediné obrázky v sešitu smí být vlastní ilustrace Traki ze statických souborů.
  for (const match of src.matchAll(/_next\/image\?url=\$\{encodeURIComponent\(([^)]*)\)/g)) {
    assert.match(match[1], /illustrations\/traki/, `tisk sahá na cizí obrázek: ${match[1]}`);
  }
  assert.ok(!/supabase/i.test(src), "v tisku zůstal odkaz na fotku z úložiště");
});

test("A6b – sešit používá ilustrace Traki, a jen ty se schváleným významem", () => {
  const src = read(PRINT);
  assert.match(src, /function trakiIllustration/);
  // Batoh = start hry, blok = papírová hra, rozcestník = přechod na zastávku,
  // konfety = konec. Stejný význam jako v aplikaci (lib/illustrations.ts).
  for (const [name, where] of [
    ["batoh", "hlavička sešitu"],
    ["blok", "návod k papírové hře"],
    ["rozcestnik", "nadpis zastávky"],
    ["konfety", "závěrečný blok"],
    ["mapa", "příběh mise"],
    ["pohar", "patička o žebříčku"]
  ] as const) {
    assert.match(src, new RegExp(`trakiIllustration\\("${name}"`), `chybí ilustrace ${name} (${where})`);
    assert.ok(
      fs.existsSync(path.join(ROOT, `public/illustrations/traki/${name}.webp`)),
      `soubor ilustrace ${name} neexistuje`
    );
  }
  // Šířky musí být povolené velikosti Next.js, jinak optimalizátor vrátí 400.
  for (const width of src.match(/trakiIllustration\("\w+", (\d+)\)/g) ?? []) {
    const size = Number(width.match(/(\d+)\)/)![1]);
    assert.ok([96, 128, 256].includes(size), `nepovolená šířka obrázku: ${size}`);
  }
});

test("A6c – ilustrace nerozbíjejí tiskový layout", () => {
  const src = read(PRINT);
  assert.match(src, /\.traki-icon \{[\s\S]*?width: 11mm/, "ilustrace musí mít pevnou malou velikost");
  assert.match(src, /object-fit: contain/, "ilustrace se nemá ořezávat");
  const flexBlock = src.slice(src.indexOf(".episode-head,"), src.indexOf(".episode-head,") + 220);
  assert.match(flexBlock, /display: flex/, "nadpis a ikona mají stát vedle sebe");
  assert.match(flexBlock, /align-items: center/);
});

test("A7 – místo pro budoucí ilustraci Traki je připravené, ale prázdné", () => {
  const src = read(PRINT);
  assert.match(src, /function renderPrintableStopVisual/, "chybí místo pro vizuál zastávky");
  assert.match(src, /\$\{renderPrintableStopVisual\(episode\)\}/, "místo se nevykresluje u zastávky");
  const fn = src.slice(src.indexOf("function renderPrintableStopVisual"), src.indexOf("function renderPrintableEpisode"));
  assert.match(fn, /return "";/, "dnes se nemá tisknout nic");
  assert.ok(!/<img/.test(fn), "žádný zástupný obrázek se nevymýšlí");
  assert.match(src, /\.stop-visual \{/, "chybí připravený styl pro ilustraci");
});

test("A8 – tisk drží rozumnou velikost a nelomí zastávku", () => {
  const src = read(PRINT);
  assert.match(src, /max-height: 52mm/, "vizuál nemá mít neomezenou výšku");
  assert.match(src, /object-fit: contain/, "ilustrace se nemá ořezávat");
  assert.match(src, /\.episode-card \{ page-break-inside: avoid; \}/, "zastávka se nemá lámat přes stránky");
});

test("A9 – fotky v databázi a v online hře zůstávají nedotčené", () => {
  // Tisk je jediné místo, kde se fotky nepoužívají; hra i Mozek s nimi pracují dál.
  assert.match(read("lib/gameplay-server.ts"), /illustrationImage: stop\.image_url \|\| undefined/);
  assert.match(read("components/admin/stop-form.tsx"), /Fotografie zastavení/);
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
