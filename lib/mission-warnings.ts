// R55: „Co ještě doladit“ – co ve hře chybí, i když ji publikace pustí ven.
//
// Kontrola publikace (mission-publish-validation) blokuje jen technické chyby,
// kvůli kterým by hra nešla dohrát. Tady jsou mezery v obsahu: nikdy neblokují,
// jen upozorní. Stejný druh mezery se slučuje do jednoho řádku („3 zastavení
// nemají fotku“), aby seznam nebyl dlouhý jako hra. Modul je čistý kvůli testům.

export type WarningInput = {
  mission: {
    heroImageUrl?: string | null;
    shortDescription?: string | null;
    startPlaceName?: string | null;
    endingTitle?: string | null;
    endingText?: string | null;
    endingBubbleCount: number;
  };
  stops: Array<{
    id: string;
    title: string;
    description?: string | null;
    imageUrl?: string | null;
    transitionText?: string | null;
    bubbleCount: number;
    tasks: Array<{ hasHint: boolean }>;
  }>;
};

export type MissionWarning = {
  /** Stabilní klíč – kvůli testům a Reactu. */
  code: string;
  text: string;
  /** Kam jít opravit; zastavení mají odkaz na každé jednotlivě. */
  links: Array<{ label: string; href: string }>;
};

const prazdne = (value?: string | null) => !(value ?? "").trim();

function cesky(pocet: number, jedno: string, dve: string, pet: string) {
  return pocet === 1 ? jedno : pocet >= 2 && pocet <= 4 ? dve : pet;
}

export function findMissionWarnings(input: WarningInput, missionId: string): MissionWarning[] {
  const vysledek: MissionWarning[] = [];
  const hra = `/mozek/missions/${missionId}`;
  const odkazy = (stops: WarningInput["stops"]) => stops.map((s) => ({ label: s.title, href: `/mozek/stops/${s.id}` }));

  const { mission, stops } = input;
  if (prazdne(mission.heroImageUrl)) {
    vysledek.push({ code: "hero_image", text: "Hra nemá titulní obrázek – v katalogu se použije první fotka zastavení.", links: [{ label: "Upravit hru", href: hra }] });
  }
  if (prazdne(mission.shortDescription)) {
    vysledek.push({ code: "short_description", text: "Hra nemá krátký popis do katalogu.", links: [{ label: "Upravit hru", href: hra }] });
  }
  if (prazdne(mission.startPlaceName)) {
    vysledek.push({ code: "start_place", text: "Hra nemá místo startu – hráč neví, kam přijít.", links: [{ label: "Upravit hru", href: hra }] });
  }
  if (prazdne(mission.endingTitle) && prazdne(mission.endingText) && mission.endingBubbleCount === 0) {
    vysledek.push({ code: "ending", text: "Hra nemá závěr – hráč na konci uvidí jen výsledek.", links: [{ label: "Upravit hru", href: hra }] });
  }

  const bezFotky = stops.filter((s) => prazdne(s.imageUrl));
  if (bezFotky.length) {
    vysledek.push({
      code: "stop_image",
      text: `${bezFotky.length} ${cesky(bezFotky.length, "zastavení nemá", "zastavení nemají", "zastavení nemá")} fotku.`,
      links: odkazy(bezFotky)
    });
  }
  const bezUvedeni = stops.filter((s) => prazdne(s.description));
  if (bezUvedeni.length) {
    vysledek.push({
      code: "stop_description",
      text: `${bezUvedeni.length} ${cesky(bezUvedeni.length, "zastavení nemá", "zastavení nemají", "zastavení nemá")} popis – hráč neví, kde je.`,
      links: odkazy(bezUvedeni)
    });
  }
  // Poslední zastavení přechod nepotřebuje – po něm přijde závěr.
  const bezPrechodu = stops.slice(0, -1).filter((s) => prazdne(s.transitionText));
  if (bezPrechodu.length) {
    vysledek.push({
      code: "stop_transition",
      text: `${bezPrechodu.length} ${cesky(bezPrechodu.length, "zastavení nemá", "zastavení nemají", "zastavení nemá")} text přechodu – hráč neví, kudy dál.`,
      links: odkazy(bezPrechodu)
    });
  }
  const bezBubliny = stops.filter((s) => s.bubbleCount === 0);
  if (bezBubliny.length && bezBubliny.length < stops.length) {
    // Jen když hra bubliny jinde používá – hra úplně bez bublin je volba, ne mezera.
    vysledek.push({
      code: "stop_bubble",
      text: `${bezBubliny.length} ${cesky(bezBubliny.length, "zastavení nemá", "zastavení nemají", "zastavení nemá")} bublinu při příchodu.`,
      links: odkazy(bezBubliny)
    });
  }

  const ukoly = stops.flatMap((s) => s.tasks);
  const bezNapovedy = ukoly.filter((t) => !t.hasHint).length;
  if (ukoly.length && bezNapovedy) {
    const sNapovedou = stops.filter((s) => s.tasks.some((t) => !t.hasHint));
    vysledek.push({
      code: "task_hint",
      text: `${bezNapovedy} z ${ukoly.length} úkolů nemá nápovědu – hráč může jen hádat, nebo dát „Nevím“.`,
      links: odkazy(sNapovedou)
    });
  }
  return vysledek;
}
