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
const DOC = "lib/print-document.ts";
const PDF = "lib/print-pdf.ts";

// ---------------------------------------------------------------------------
// A. Sešit obsahuje, co hráč venku potřebuje
// ---------------------------------------------------------------------------

test("A1 – sešit nese herní obsah zastávky i úkolu", () => {
  const src = read(DOC);
  for (const field of [
    "episode.name",
    "episode.intro",
    "episode.background",
    "task.title",
    "task.content",
    "task.options"
  ]) {
    assert.ok(src.includes(field), `v tisku chybí ${field}`);
  }
});

test("A2 – u každého úkolu je místo na vlastní odpověď", () => {
  const src = read(DOC);
  assert.match(src, /type: "answer", label: taskAnswerLabel\(task\)/);
  assert.match(src, /Splněno na místě/, "fotoúkol má mít vlastní řádek");
  // Řádek na odpověď musí mít výšku na ruční psaní, ne jen na text.
  assert.match(read(PDF), /h: size \* TEXT_LINE \+ 12/);
});

test("A3 – sešit vysvětluje, že se odpovědi doma přepíšou do aplikace", () => {
  const src = read(DOC);
  assert.match(src, /Jak se hraje s papírem/, "chybí blok s postupem");
  assert.match(src, /odpovědi postupně přepiš/i);
  assert.match(src, /www\.postope\.cz/);
  assert.match(src, /spočítá body/i, "hráč se musí dozvědět, že body počítá aplikace");
});

test("A4 – sešit upozorňuje na tři pokusy", () => {
  const src = read(DOC);
  assert.match(src, /tři pokusy/i);
  assert.match(src, /po třetí špatné odpovědi/i);
});

test("A5 – sešit už nenutí hráče počítat body na papíře", () => {
  const src = read(DOC);
  assert.ok(!/Body celkem/.test(src), "zůstala kolonka na ruční součet bodů");
  assert.ok(!/Správně: /.test(src), "zůstala kolonka na ruční počítání správných");
  assert.match(src, /Na papíře nic sčítat nemusíš/i);
});

test("A6 – tisk nepoužívá fotografie skutečných míst ani nic ze sítě", () => {
  // U route se kontroluje jen tisková větev – administrační export s fotkami
  // a odpověďmi za heslem zůstává beze změny.
  const printBranch = (() => {
    const src = read(PRINT);
    return src.slice(src.indexOf("function isPresent"), src.indexOf("async function buildRows"));
  })();

  // Komentáře popisují i to, co se dělat NESMÍ (proč vznikl bug s /_next/image),
  // takže se hlídá jen skutečný kód.
  const withoutComments = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  for (const [file, raw] of [[PRINT, printBranch], [DOC, read(DOC)], [PDF, read(PDF)]] as const) {
    const src = withoutComments(raw);
    assert.ok(!/illustrationImage/.test(src), `${file}: tisk sahá na obrázek zastávky`);
    assert.ok(!/_next\/image/.test(src), `${file}: tisk pořád jde přes optimalizátor obrázků`);
    assert.ok(!/supabase/i.test(src), `${file}: v tisku zůstal odkaz na úložiště`);
    assert.ok(!/https?:\/\//.test(src), `${file}: v tisku zůstala externí adresa`);
  }
});

test("A6b – sešit používá ilustrace Traki, a jen ty se schváleným významem", () => {
  const src = read(DOC);
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
    assert.match(src, new RegExp(`icon: "${name}"`), `chybí ilustrace ${name} (${where})`);
    assert.ok(
      fs.existsSync(path.join(ROOT, `assets/print/illustrations/${name}.png`)),
      `tiskový soubor ilustrace ${name} neexistuje`
    );
    assert.ok(
      fs.existsSync(path.join(ROOT, `public/illustrations/traki/${name}.webp`)),
      `ilustrace ${name} pro aplikaci neexistuje`
    );
  }
});

test("A6c – ilustrace nerozbíjejí tiskový layout", () => {
  const src = read(PDF);
  const sizes = src.match(/const TITLE_ICON = \{ xl: mm\((\d+)\), lg: mm\((\d+)\), md: mm\((\d+)\) \}/);
  assert.ok(sizes, "chybí velikosti ilustrací");
  for (const size of sizes.slice(1).map(Number)) {
    assert.ok(size >= 8 && size <= 18, `ilustrace ${size} mm je mimo rozumnou tiskovou velikost`);
  }
  // Ikona stojí vedle nadpisu a nikdy ho nepřekrývá.
  assert.match(src, /const textX = x \+ iconSize \+ gap;/);
  assert.match(src, /const textWidth = width - iconSize - gap;/);
});

test("A7 – fonty a ilustrace pro tisk leží v repozitáři, ne na CDN", () => {
  for (const file of [
    "assets/print/fonts/DejaVuSans.ttf",
    "assets/print/fonts/DejaVuSans-Bold.ttf",
    "assets/print/fonts/LICENSE-DejaVu.txt"
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `chybí ${file}`);
  }
  // A serverless funkce je musí mít u sebe, jinak tisk na produkci spadne.
  const config = read("next.config.mjs");
  assert.match(config, /outputFileTracingIncludes/);
  assert.match(config, /"\/api\/export\/game-content": \["\.\/assets\/print\/\*\*\/\*"\]/);
});

test("A8 – tisk drží zastávku i úkol pohromadě", () => {
  const doc = read(DOC);
  assert.match(doc, /keepTogether: true,\n    keepHead: items\.length/, "zastávka se nemá lámat");
  assert.match(doc, /return \{ variant: "task", items, keepTogether: true \};/, "úkol se nemá lámat");
  const pdf = read(PDF);
  assert.match(pdf, /const fitsOnEmptyPage = height <= CONTENT_BOTTOM - CONTENT_TOP;/);
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
  for (const file of [DOC, PDF]) {
    const src = read(file);
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
      assert.ok(!src.includes(forbidden), `${file}: tisková verze pracuje s ${forbidden}`);
    }
  }
});

test("B2 – tisk staví na veřejné podobě hry, ne na exportní", () => {
  const src = read(PRINT);
  const build = src.slice(src.indexOf("async function buildPrintablePdf"), src.indexOf("async function buildRows"));
  assert.match(build, /getGameplayLocation\(/, "tisk musí brát obsah veřejnou cestou");
  assert.ok(!/getGameplayLocationForExport/.test(build), "tisk nesmí sáhnout na verzi s odpověďmi");
  assert.match(build, /PrintableLocation\[\]/);
});

test("B3 – typ tiskové hry závěr vůbec nemá", () => {
  const src = read(DOC);
  const type = src.slice(src.indexOf("export type PrintableLocation"), src.indexOf("export function formatStopCount"));
  assert.ok(!/ending|playerMessage/i.test(type), "typ tiskové hry pořád nese závěr");
  assert.match(type, /episodes: PublicGameplayEpisode\[\]/, "tisk musí stavět na veřejném typu");
});

test("B4 – nápověda zůstává funkcí aplikace", () => {
  const src = read(DOC);
  const taskBlock = src.slice(src.indexOf("function buildTaskBlock"), src.indexOf("function buildEpisodeBlock"));
  assert.ok(!/hint/i.test(taskBlock), "do tištěného úkolu se dostala nápověda");
  // A v aplikaci pořád stojí za body: pravidlo R25 se nemění.
  assert.match(read("lib/game-rules.ts"), /POINTS_PER_TASK_WITH_HINT = 5/);
});

test("B5 – tiskový soubor je PDF, ne stažitelné HTML", () => {
  const src = read(PRINT);
  assert.match(src, /"Content-Type": "application\/pdf"/);
  assert.match(src, /traki-tiskovy-sesit-\$\{locationId\}\.pdf/);
  assert.ok(!/buildPrintableHtml/.test(src), "zůstala stará HTML větev tisku");
  assert.ok(!/text\/html/.test(src), "tisk pořád umí vrátit HTML");
});

// ---------------------------------------------------------------------------
// C. Papírová cesta v aplikaci
// ---------------------------------------------------------------------------

test("C1 – papírová cesta žije v tiskové sekci detailu hry", () => {
  const detail = read("components/location-detail-screen.tsx");
  assert.match(detail, /format=pdf&locationId=/);
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
