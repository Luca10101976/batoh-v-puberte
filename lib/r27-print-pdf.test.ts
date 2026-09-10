import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { buildPrintDocument, collectPrintIcons, collectPrintText, type PrintableLocation } from "./print-document.ts";
import { PAGE_HEIGHT, PAGE_MARGIN, PAGE_WIDTH, planPrintPdf, renderPrintPdf, type PrintPdfAssets } from "./print-pdf.ts";
import type { PublicGameplayEpisode, PublicGameplayTask } from "./gameplay-types.ts";

// R27: tiskový sešit je PDF a musí být soběstačný.
//
// Předchozí verze posílala HTML, které si ilustrace tahalo z /_next/image. Po
// stažení na disk se z ikon staly rozbité obrázky. Testy tady hlídají obojí:
// že se do PDF opravdu zapeče font i obrázky (žádná externí adresa), a že sazba
// nerozlomí úkol ani nadpis zastávky přes dvě stránky.

const ROOT = path.resolve(import.meta.dirname, "..");
const ASSET_DIR = path.join(ROOT, "assets", "print");

function loadAssets(): PrintPdfAssets {
  const icons: PrintPdfAssets["icons"] = {};
  for (const name of ["batoh", "blok", "konfety", "mapa", "pohar", "rozcestnik"] as const) {
    icons[name] = new Uint8Array(fs.readFileSync(path.join(ASSET_DIR, "illustrations", `${name}.png`)));
  }
  return {
    regularFont: new Uint8Array(fs.readFileSync(path.join(ASSET_DIR, "fonts", "DejaVuSans.ttf"))),
    boldFont: new Uint8Array(fs.readFileSync(path.join(ASSET_DIR, "fonts", "DejaVuSans-Bold.ttf"))),
    icons
  };
}

const ASSETS = loadAssets();

function task(index: number, overrides: Partial<PublicGameplayTask> = {}): PublicGameplayTask {
  return {
    id: `task-${index}`,
    type: "question",
    typeLabel: "Otázka",
    title: `Úkol ${index}`,
    content: `Kolik ježků žije pod křížovou chodbou číslo ${index}?`,
    ...overrides
  };
}

function episode(index: number, taskCount: number, longText = false): PublicGameplayEpisode {
  return {
    id: `stop-${index}`,
    name: `Zastávka ${index} – žluťoučký kůň`,
    intro: longText ? "Příliš žluťoučký kůň úpěl ďábelské ódy. ".repeat(24) : "Příliš žluťoučký kůň úpěl ďábelské ódy.",
    background: longText ? "Ďábelské ódy o koni a jeho příteli ježkovi. ".repeat(24) : "Krátké pozadí zastávky.",
    tasks: Array.from({ length: taskCount }, (_, taskIndex) => task(taskIndex + 1)),
    clue: []
  };
}

function location(id: string, episodes: PublicGameplayEpisode[]): PrintableLocation {
  return {
    id,
    city: "Praha",
    name: `Mise ${id}`,
    teaser: "Krátký teaser mise.",
    introStory: "Úvodní příběh mise.",
    story: "Pokračování příběhu mise.",
    episodes
  };
}

const SAMPLE = buildPrintDocument([
  location("kratka", [episode(1, 3), episode(2, 5)]),
  location("dlouha", [episode(3, 14, true), episode(4, 2)])
]);

// ---------------------------------------------------------------------------
// A. Soběstačnost – po stažení PDF nesmí nic dotahovat ze sítě
// ---------------------------------------------------------------------------

test("A1 – výstup je opravdu PDF, ne HTML", async () => {
  const bytes = await renderPrintPdf(SAMPLE, ASSETS);
  const head = Buffer.from(bytes.slice(0, 8)).toString("latin1");
  assert.match(head, /^%PDF-1\./, `výstup nezačíná hlavičkou PDF: ${head}`);
  assert.ok(bytes.byteLength > 20000, "PDF je podezřele malé");
});

test("A2 – font je vložený uvnitř souboru, takže diakritika funguje i offline", async () => {
  const raw = Buffer.from(await renderPrintPdf(SAMPLE, ASSETS)).toString("latin1");
  assert.ok(raw.includes("/FontFile2"), "font se do PDF nevložil");
  assert.ok(raw.includes("/Identity-H"), "chybí kódování pro plnou sadu znaků");

  const font = (fontkit as unknown as { create(data: Uint8Array): { hasGlyphForCodePoint(cp: number): boolean } }).create(
    ASSETS.regularFont
  );
  for (const char of "ěščřžýáíéúůňťďóĚŠČŘŽÝÁÍÉÚŮŇŤĎÓ") {
    assert.ok(font.hasGlyphForCodePoint(char.codePointAt(0)!), `font neumí ${char}`);
  }
});

test("A3 – ilustrace jsou zapečené jako obrázky v PDF", async () => {
  const raw = Buffer.from(await renderPrintPdf(SAMPLE, ASSETS)).toString("latin1");
  const images = raw.match(/\/Subtype \/Image/g) ?? [];
  // Šest ilustrací + jejich alfa maska.
  assert.ok(images.length >= 6, `v PDF je jen ${images.length} obrázků`);
  assert.deepEqual(collectPrintIcons(SAMPLE), ["batoh", "blok", "konfety", "mapa", "pohar", "rozcestnik"]);
});

test("A4 – PDF nikam nesahá: žádná adresa, žádný odkaz, žádný optimalizátor obrázků", async () => {
  const raw = Buffer.from(await renderPrintPdf(SAMPLE, ASSETS)).toString("latin1");
  for (const forbidden of ["_next/image", "http://", "https://", "supabase", "/URI", "/Launch", "/JavaScript"]) {
    assert.ok(!raw.includes(forbidden), `PDF obsahuje závislost na ${forbidden}`);
  }
});

test("A5 – stránky jsou A4 na výšku", () => {
  assert.ok(Math.abs(PAGE_WIDTH - 595.276) < 0.01, `špatná šířka stránky: ${PAGE_WIDTH}`);
  assert.ok(Math.abs(PAGE_HEIGHT - 841.89) < 0.01, `špatná výška stránky: ${PAGE_HEIGHT}`);
  assert.ok(Math.abs(PAGE_MARGIN - 34.015) < 0.01, `špatný okraj: ${PAGE_MARGIN}`);
});

// ---------------------------------------------------------------------------
// B. Stránkování – nic se neroztrhne a nic nepřeteče
// ---------------------------------------------------------------------------

test("B1 – nic nepřeteče mimo tiskovou plochu", async () => {
  const plan = await planPrintPdf(SAMPLE, ASSETS);
  const tolerance = 0.01;

  for (const box of plan.boxes) {
    assert.ok(box.x >= PAGE_MARGIN - tolerance, `rámeček začíná mimo okraj: ${box.x}`);
    assert.ok(box.x + box.width <= PAGE_WIDTH - PAGE_MARGIN + tolerance, "rámeček přetéká vpravo");
    assert.ok(box.top >= PAGE_MARGIN - tolerance, `rámeček začíná nad okrajem: ${box.top}`);
    assert.ok(box.bottom <= PAGE_HEIGHT - PAGE_MARGIN + tolerance, `rámeček přetéká dolů: ${box.bottom}`);
  }

  for (const row of plan.rows) {
    assert.ok(row.top >= PAGE_MARGIN - tolerance, "řádek začíná nad tiskovou plochou");
    assert.ok(row.top < PAGE_HEIGHT - PAGE_MARGIN + tolerance, "řádek začíná pod tiskovou plochou");
  }
});

test("B2 – rámeček úkolu se nikdy nerozdělí přes dvě stránky", async () => {
  const plan = await planPrintPdf(SAMPLE, ASSETS);
  const fragmentsPerBox = new Map<number, number>();
  for (const box of plan.boxes) {
    if (box.variant !== "task") {
      continue;
    }
    fragmentsPerBox.set(box.order, (fragmentsPerBox.get(box.order) ?? 0) + 1);
  }

  assert.ok(fragmentsPerBox.size > 0, "test nemá co kontrolovat");
  for (const [order, count] of fragmentsPerBox) {
    assert.equal(count, 1, `úkol ${order} je rozdělený na ${count} částí`);
  }
});

test("B3 – zastávka, která se vejde na stránku, zůstane vcelku", async () => {
  const plan = await planPrintPdf(SAMPLE, ASSETS);
  const cards = new Map<number, number>();
  for (const box of plan.boxes) {
    if (box.variant !== "card") {
      continue;
    }
    cards.set(box.order, (cards.get(box.order) ?? 0) + 1);
  }

  const split = [...cards.values()].filter((count) => count > 1);
  // Jediná zastávka, která se dělí, je ta uměle přetažená přes celou A4.
  assert.equal(split.length, 1, `nečekaně rozdělených bloků: ${split.length}`);
});

test("B4 – žádný rámeček nekončí prázdným proužkem na patě stránky", async () => {
  const plan = await planPrintPdf(SAMPLE, ASSETS);
  for (const box of plan.boxes) {
    const height = box.bottom - box.top;
    assert.ok(height > 14, `rámeček ${box.order} je jen ${height.toFixed(1)} pt vysoký pahýl`);
  }
});

test("B5 – každá mise začíná na vlastní stránce", async () => {
  const plan = await planPrintPdf(SAMPLE, ASSETS);
  const heroes = plan.boxes.filter((box) => box.variant === "dark");
  // Hlavička sešitu, dvě mise a patička.
  assert.ok(heroes.length >= 4, `chybí tmavé bloky: ${heroes.length}`);
  const secondHero = heroes.find((box) => Math.abs(box.top - PAGE_MARGIN) < 0.01 && box.page > 0);
  assert.ok(secondHero, "druhá mise nezačíná na čisté stránce");
});

// ---------------------------------------------------------------------------
// C. Obsah – co v sešitu je a co v něm nesmí být
// ---------------------------------------------------------------------------

test("C1 – sešit nese herní obsah a řádek na odpověď", () => {
  const text = collectPrintText(SAMPLE);
  assert.match(text, /Zastávka 1 – žluťoučký kůň/);
  assert.match(text, /Kolik ježků žije pod křížovou chodbou/);
  assert.match(text, /Odpověď/);
  assert.match(text, /Jak se hraje s papírem/);
  assert.match(text, /www\.postope\.cz/);
});

test("C2 – fotoúkol má vlastní formulaci řádku", () => {
  const photo = buildPrintDocument([
    location("foto", [
      {
        ...episode(9, 0),
        tasks: [task(1, { type: "photo", typeLabel: "Fotka" })]
      }
    ])
  ]);
  assert.match(collectPrintText(photo), /Splněno na místě/);
});

test("C3 – volby se tisknou, ale správná odpověď ani nápověda ne", () => {
  const choice = buildPrintDocument([
    location("volba", [
      {
        ...episode(8, 0),
        tasks: [task(1, { type: "choice", typeLabel: "Výběr", options: ["Ano", "Ne"], hasHint: true })]
      }
    ])
  ]);
  const text = collectPrintText(choice);
  assert.match(text, /Možnosti: Ano/);
  assert.ok(!/nápověd/i.test(text.replace(/Doma ti Traki nabídne nápovědu\./, "")), "v sešitu zůstala nápověda");
});
