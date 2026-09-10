/**
 * R37: načítání měst z databáze. Jediné místo, které o tabulce cities ví.
 */

import type { City } from "./cities.ts";

type CityRow = {
  id: string;
  slug: string;
  name: string;
  name_locative: string | null;
  display_order: number | null;
  is_active: boolean | null;
  lat: number | null;
  lng: number | null;
};

const CITY_COLUMNS = "id, slug, name, name_locative, display_order, is_active, lat, lng";

function toCity(row: CityRow): City {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameLocative: (row.name_locative ?? "").trim(),
    displayOrder: typeof row.display_order === "number" ? row.display_order : 0,
    isActive: row.is_active !== false,
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null
  };
}

function sortCities(cities: City[]) {
  return cities.sort((a, b) =>
    a.displayOrder === b.displayOrder ? a.name.localeCompare(b.name, "cs") : a.displayOrder - b.displayOrder
  );
}

/**
 * Všechna města, i vypnutá. Vypnuté město se v aplikaci nenabízí, ale v Mozku
 * se musí dát znovu zapnout, takže se načítá taky.
 */
export async function loadCities(admin: { from: (table: string) => any }): Promise<City[]> {
  const { data, error } = await admin.from("cities").select(CITY_COLUMNS);
  if (error) {
    // Mezistav mezi nasazením kódu a migrací nesmí shodit Mozek ani katalog.
    if (error.code === "42P01") {
      return [];
    }
    throw new Error(`cities_failed: ${error.message}`);
  }
  return sortCities(((data as CityRow[] | null) ?? []).map(toCity));
}

export async function loadActiveCities(admin: { from: (table: string) => any }) {
  return (await loadCities(admin)).filter((city) => city.isActive);
}

/** Mapa podle názvu města – tak, jak ho drží missions.city. */
export function cityByName(cities: City[]) {
  const map = new Map<string, City>();
  for (const city of cities) {
    map.set(city.name.trim().toLowerCase(), city);
  }
  return map;
}
