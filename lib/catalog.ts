// R20: katalog měst a her = čistá, testovatelná vrstva nad tabulkou `missions`.
//
// Jediný zdroj pravdy pro katalog je DB (missions). Tento modul rozhoduje:
//   - které hry jsou v katalogu (pouze is_published = true),
//   - která města se zobrazí (jen s aspoň jednou publikovanou hrou), abecedně (cs),
//   - pořadí her v městě (catalog_order, při shodě název),
//   - popis karty (short_description, jinak první věta intro_text),
//   - katalogový vztah zamčení (unlock_after_mission_id → locationId vyžadované hry).
//
// Identita hry (locationId) zůstává kompatibilní: hry, které mají historický slug
// (např. "klamovka"), ho dostanou přes `resolveLocationId`; ostatní používají UUID mise.
// Modul záměrně neimportuje mock-data ani nic ze serveru – je bez závislostí.

export type CatalogMissionRow = {
  id: string;
  title: string;
  city: string;
  intro_text?: string | null;
  short_description?: string | null;
  hero_image_url?: string | null;
  difficulty?: string | null;
  duration_min?: number | null;
  points?: number | null;
  catalog_order?: number | null;
  is_published?: boolean | null;
  unlock_after_mission_id?: string | null;
};

export type CatalogEntry = {
  missionId: string;
  locationId: string;
  city: string;
  title: string;
  /** short_description, jinak první věta intro_text, jinak "" */
  teaser: string;
  /** hero_image_url (trim) nebo null – fallback na existující obrázek řeší volající */
  heroImageUrl: string | null;
  difficulty: string | null;
  durationMin: number | null;
  points: number | null;
  catalogOrder: number;
  /**
   * locationId hry, kterou je nutné dokončit; null = dostupná bez podmínky.
   * FAIL-CLOSED: pokud je unlock_after_mission_id nastavené, ale nejde přeložit
   * (mise neexistuje), zůstává zde surové UUID – takové hře nikdy neodpovídá
   * dokončený progress, hra tedy zůstane zamčená místo omylem odemčená.
   */
  unlockAfterLocationId: string | null;
};

export function firstSentence(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const sentenceMatch = trimmed.match(/^.+?[.!?](?:\s|$)/);
  return sentenceMatch ? sentenceMatch[0].trim() : trimmed;
}

export function resolveCatalogTeaser(row: Pick<CatalogMissionRow, "short_description" | "intro_text">) {
  const short = (row.short_description ?? "").trim();
  return short || firstSentence(row.intro_text);
}

function compareCs(a: string, b: string) {
  return a.localeCompare(b, "cs");
}

function toOrder(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Sestaví katalog z řádků `missions` (předej VŠECHNY řádky, i nepublikované –
 * nepublikované se nezobrazí, ale mohou být cílem unlock_after_mission_id).
 * Výsledek je seřazený: město (cs abecedně) → catalog_order → název (cs).
 */
export function buildCatalog(
  rows: CatalogMissionRow[],
  resolveLocationId: (row: CatalogMissionRow) => string = (row) => row.id
): CatalogEntry[] {
  const byId = new Map(rows.map((row) => [row.id, row] as const));

  const entries = rows
    .filter((row) => row.is_published === true)
    .map<CatalogEntry>((row) => {
      const requiredRow = row.unlock_after_mission_id ? byId.get(row.unlock_after_mission_id) ?? null : null;
      return {
        missionId: row.id,
        locationId: resolveLocationId(row),
        city: (row.city ?? "").trim(),
        title: (row.title ?? "").trim(),
        teaser: resolveCatalogTeaser(row),
        heroImageUrl: (row.hero_image_url ?? "").trim() || null,
        difficulty: row.difficulty ?? null,
        durationMin: typeof row.duration_min === "number" && Number.isFinite(row.duration_min) ? row.duration_min : null,
        points: typeof row.points === "number" && Number.isFinite(row.points) ? row.points : null,
        catalogOrder: toOrder(row.catalog_order),
        unlockAfterLocationId: row.unlock_after_mission_id
          ? requiredRow
            ? resolveLocationId(requiredRow)
            : String(row.unlock_after_mission_id)
          : null
      };
    });

  return entries.sort(
    (a, b) => compareCs(a.city, b.city) || a.catalogOrder - b.catalogOrder || compareCs(a.title, b.title)
  );
}

/**
 * Najde katalogový záznam pro ID z URL. Hra má jedinou kanonickou adresu (locationId);
 * když ID odpovídá jen UUID mise, která má kanonický slug, jde o alias – vrací se
 * `isAlias: true`, aby volající mohl alias odmítnout (jinak by šel obejít katalogový zámek).
 */
export function resolveCatalogEntryForLocation(entries: CatalogEntry[], locationId: string) {
  const canonical = entries.find((entry) => entry.locationId === locationId) ?? null;
  if (canonical) {
    return { entry: canonical, isAlias: false };
  }
  const byMission = entries.find((entry) => entry.missionId === locationId) ?? null;
  return { entry: byMission, isAlias: Boolean(byMission) };
}

/** Města s aspoň jednou publikovanou hrou, abecedně (cs). */
export function getCatalogCities(entries: CatalogEntry[]) {
  return Array.from(new Set(entries.map((entry) => entry.city))).sort(compareCs);
}

/** Zapamatované město, pokud je stále dostupné; jinak první dostupné; bez měst null. */
export function resolveCatalogCity(remembered: string | null | undefined, cities: string[]) {
  if (cities.length === 0) {
    return null;
  }
  const wanted = (remembered ?? "").trim();
  return wanted && cities.includes(wanted) ? wanted : cities[0];
}

/** Hry jednoho města v katalogovém pořadí (catalog_order, pak název). */
export function getCatalogEntriesForCity(entries: CatalogEntry[], city: string) {
  return entries.filter((entry) => entry.city === city);
}
