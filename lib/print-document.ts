/**
 * R27: model tiskového sešitu.
 *
 * Tenhle soubor popisuje, CO je v sešitu (nadpisy, odstavce, řádky na odpovědi),
 * ne JAK se to kreslí. Sazbu do PDF dělá lib/print-pdf.ts. Rozdělení je schválně:
 * model jde otestovat bez PDF knihovny a hlavně jde na něm dokázat, že se do
 * tisku nikdy nedostanou správné odpovědi, nápovědy ani konec příběhu.
 */

import type { PublicGameplayEpisode, PublicGameplayTask } from "./gameplay-types";

export type PrintIconName = "batoh" | "blok" | "konfety" | "mapa" | "pohar" | "rozcestnik";

export const PRINT_ICON_NAMES: PrintIconName[] = [
  "batoh",
  "blok",
  "konfety",
  "mapa",
  "pohar",
  "rozcestnik"
];

export type PrintTextTone = "default" | "muted" | "invert" | "accent";

export type PrintItem =
  | { type: "kicker"; text: string }
  | { type: "title"; text: string; size: "xl" | "lg" | "md"; icon?: PrintIconName }
  | { type: "text"; text: string; size?: "md" | "sm"; weight?: "regular" | "bold"; tone?: PrintTextTone }
  | { type: "bullet"; marker: string; lead?: string; text: string }
  | { type: "answer"; label: string }
  | { type: "cta"; text: string };

export type PrintBlockVariant = "dark" | "card" | "green" | "task";

export type PrintBlock = {
  variant: PrintBlockVariant;
  items: PrintItem[];
  children?: PrintBlock[];
  /** Blok se nikdy nesmí rozlomit přes dvě stránky (typicky jeden úkol). */
  keepTogether?: boolean;
  /** Prvních N položek zůstane pohromadě – nadpis zastávky nemá viset na patě. */
  keepHead?: number;
  /** Nová mise začíná na čisté stránce. */
  pageBreakBefore?: boolean;
};

export type PrintDocument = {
  title: string;
  blocks: PrintBlock[];
};

export type PrintableLocation = {
  id: string;
  city: string;
  name: string;
  teaser: string;
  introStory: string;
  story: string;
  episodes: PublicGameplayEpisode[];
};

export function formatStopCount(count: number) {
  return `${count} zastavení`;
}

function taskAnswerLabel(task: PublicGameplayTask) {
  return task.type === "photo" ? "Splněno na místě" : "Odpověď";
}

function buildTaskBlock(task: PublicGameplayTask, taskIndex: number): PrintBlock {
  const items: PrintItem[] = [
    { type: "title", text: `Úkol ${taskIndex + 1} • ${task.title}`, size: "md" },
    { type: "text", text: task.content }
  ];

  if (task.options && task.options.length > 0) {
    items.push({ type: "text", text: `Možnosti: ${task.options.join("  |  ")}`, size: "sm", tone: "muted" });
  }

  items.push({ type: "answer", label: taskAnswerLabel(task) });

  return { variant: "task", items, keepTogether: true };
}

function buildEpisodeBlock(episode: PublicGameplayEpisode, episodeIndex: number): PrintBlock {
  const items: PrintItem[] = [
    { type: "kicker", text: `Zastavení ${episodeIndex + 1}` },
    { type: "title", text: episode.name, size: "lg", icon: "rozcestnik" },
    { type: "text", text: episode.intro, weight: "bold" },
    { type: "text", text: episode.background, tone: "muted" }
  ];

  return {
    variant: "card",
    items,
    // Zastavení je jeden logický celek. Když se celé vejde na čistou stránku,
    // začne až tam. Když je delší než A4, dělí se jen mezi celými úkoly a
    // hlavička s úvodním textem zůstává pohromadě.
    keepTogether: true,
    keepHead: items.length,
    children: episode.tasks.map((task, taskIndex) => buildTaskBlock(task, taskIndex))
  };
}

function buildLocationBlocks(location: PrintableLocation, isFirst: boolean): PrintBlock[] {
  const hero: PrintBlock = {
    variant: "dark",
    pageBreakBefore: !isFirst,
    keepTogether: true,
    items: [
      { type: "kicker", text: `${location.city} • ${formatStopCount(location.episodes.length)}` },
      { type: "title", text: location.name, size: "xl" },
      { type: "text", text: location.teaser, tone: "invert" }
    ]
  };

  const story: PrintBlock = {
    variant: "card",
    keepTogether: true,
    items: [
      { type: "title", text: "Příběh mise", size: "lg", icon: "mapa" },
      { type: "text", text: location.introStory },
      { type: "text", text: location.story }
    ]
  };

  const final: PrintBlock = {
    variant: "card",
    keepTogether: true,
    items: [
      { type: "title", text: "Závěr mise", size: "lg" },
      {
        type: "text",
        text: "Konec příběhu se dozvíš v aplikaci, až tam svoje odpovědi přepíšeš a hru dokončíš."
      }
    ]
  };

  const score: PrintBlock = {
    variant: "green",
    keepTogether: true,
    items: [
      { type: "title", text: "Hotovo? Zbývá poslední krok", size: "lg", icon: "konfety" },
      { type: "answer", label: "Tenhle list patří" },
      {
        type: "text",
        text: "Doma otevři stejnou hru na www.postope.cz a odpovědi z papíru do ní postupně přepiš."
      },
      {
        type: "text",
        text: "Body, výsledek i konec příběhu spočítá Traki za tebe. Na papíře nic sčítat nemusíš."
      }
    ]
  };

  return [
    hero,
    story,
    ...location.episodes.map((episode, episodeIndex) => buildEpisodeBlock(episode, episodeIndex)),
    final,
    score
  ];
}

export function buildPrintDocument(locations: PrintableLocation[]): PrintDocument {
  const title = locations.length === 1 ? locations[0].name : "Traki na stopě tajemství – herní sešit";

  const header: PrintBlock = {
    variant: "dark",
    keepTogether: true,
    items: [
      { type: "title", text: "Traki na stopě tajemství – tisková hra", size: "lg", icon: "batoh" },
      {
        type: "text",
        text:
          "Vytiskni si sešit, hraj venku podle papíru a doma svoje odpovědi přepiš do aplikace na www.postope.cz",
        size: "sm",
        tone: "invert"
      }
    ]
  };

  const howto: PrintBlock = {
    variant: "green",
    keepTogether: true,
    items: [
      { type: "title", text: "Jak se hraje s papírem", size: "lg", icon: "blok" },
      { type: "bullet", marker: "1.", lead: "Venku", text: "běž zastávku po zastávce a svoje odpovědi piš rovnou do listu." },
      { type: "bullet", marker: "2.", lead: "Nevíš?", text: "Nech řádek prázdný a jdi dál. Doma ti Traki nabídne nápovědu." },
      { type: "bullet", marker: "3.", lead: "Doma", text: "otevři stejnou hru na www.postope.cz a odpovědi postupně přepiš." },
      { type: "bullet", marker: "4.", lead: "Traki", text: "je vyhodnotí, spočítá body a ukáže ti konec příběhu." },
      {
        type: "text",
        text:
          "V aplikaci máš na každý úkol tři pokusy. Po třetí špatné odpovědi se úkol uzavře jako Nevím, takže si na papíře nech i variantu, které věříš nejvíc.",
        size: "sm",
        tone: "muted"
      },
      { type: "text", text: "Tip: ideální je oboustranný tisk.", size: "sm", tone: "muted" }
    ]
  };

  const locationBlocks =
    locations.length > 0
      ? locations.flatMap((location, index) => buildLocationBlocks(location, index === 0))
      : [
          {
            variant: "card" as const,
            keepTogether: true,
            items: [
              { type: "title" as const, text: "Tisková verze není dostupná", size: "lg" as const },
              { type: "text" as const, text: "Pro tuhle misi teď nemáme připravený živý tiskový export." }
            ]
          }
        ];

  const footer: PrintBlock = {
    variant: "dark",
    keepTogether: true,
    items: [
      { type: "title", text: "Bavilo tě to? Zahraj si další hry v aplikaci", size: "md", icon: "pohar" },
      { type: "cta", text: "www.postope.cz" },
      {
        type: "text",
        text: "Body za odpovědi, žebříček s kamarády a nové mise. Funguje na mobilu, bez instalace a zdarma.",
        size: "sm",
        tone: "invert"
      }
    ]
  };

  return { title, blocks: [header, howto, ...locationBlocks, footer] };
}

/** Ikony, které dokument opravdu používá – pro test i pro renderer. */
export function collectPrintIcons(document: PrintDocument): PrintIconName[] {
  const found = new Set<PrintIconName>();
  const walk = (blocks: PrintBlock[]) => {
    for (const block of blocks) {
      for (const item of block.items) {
        if (item.type === "title" && item.icon) {
          found.add(item.icon);
        }
      }
      if (block.children) {
        walk(block.children);
      }
    }
  };
  walk(document.blocks);
  return PRINT_ICON_NAMES.filter((name) => found.has(name));
}

/** Všechen text dokumentu – používají to testy, které hlídají únik odpovědí. */
export function collectPrintText(document: PrintDocument): string {
  const parts: string[] = [document.title];
  const walk = (blocks: PrintBlock[]) => {
    for (const block of blocks) {
      for (const item of block.items) {
        if (item.type === "answer") {
          parts.push(item.label);
        } else if (item.type === "bullet") {
          parts.push(item.lead ?? "", item.text);
        } else {
          parts.push(item.text);
        }
      }
      if (block.children) {
        walk(block.children);
      }
    }
  };
  walk(document.blocks);
  return parts.join("\n");
}
