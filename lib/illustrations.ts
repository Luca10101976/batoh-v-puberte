// Ilustrace Traki pro stavy aplikace (samolepková sada, schválené mapování).
//
// Nejde o dekoraci: každá ilustrace patří k jednomu konkrétnímu stavu, aby aplikace
// mluvila obrázkem tam, kde dnes stojí jen text.

export const ILLUSTRATIONS = {
  /** zamčená hra na detailu */
  zamek: "zamek",
  /** správná odpověď */
  hvezda: "hvezda",
  /** špatná odpověď */
  otaznik: "otaznik",
  /** úkol označený jako „Nevím“ */
  pokrceni: "pokrceni",
  /** dokončená hra, žebříček */
  pohar: "pohar",
  /** oslava po dokončení */
  konfety: "konfety",
  /** přechod mezi zastávkami */
  rozcestnik: "rozcestnik",
  /** výběr města */
  mapa: "mapa",
  /** prázdný katalog */
  pin: "pin",
  /** pokračování v rozehrané hře */
  bezici: "bezici",
  /** tisková verze a papírová hra */
  blok: "blok",
  /** nápověda a stopa */
  zarovka: "zarovka",
  /** offline a chybová stránka */
  sos: "sos",
  /** start hry */
  batoh: "batoh"
} as const;

export type IllustrationName = keyof typeof ILLUSTRATIONS;

export const ILLUSTRATION_NAMES = Object.keys(ILLUSTRATIONS) as IllustrationName[];

export function illustrationSrc(name: IllustrationName) {
  return `/illustrations/traki/${ILLUSTRATIONS[name]}.webp`;
}
