/**
 * R37: město jako spravovaná entita.
 *
 * Dřív bylo město jen textem u mise: nové město nešlo v Mozku založit, souřadnice
 * se braly z obsahu v kódu a skloňování pro větu „Hry v Praze“ bylo pevnou mapou
 * v komponentě. Tenhle modul je čistý – žádná databáze – aby se pravidla dala
 * testovat samostatně.
 */

export type City = {
  id: string;
  slug: string;
  name: string;
  /** Tvar pro větu „Hry v …“. Prázdný = použije se název v prvním pádě. */
  nameLocative: string;
  displayOrder: number;
  isActive: boolean;
  lat: number | null;
  lng: number | null;
};

export const CITY_NAME_MIN_LENGTH = 2;
export const CITY_NAME_MAX_LENGTH = 60;

export const CITY_NAME_LENGTH_MESSAGE = `Název města musí mít ${CITY_NAME_MIN_LENGTH} až ${CITY_NAME_MAX_LENGTH} znaků.`;
export const CITY_NAME_TAKEN_MESSAGE = "Město s tímhle názvem už existuje.";
export const CITY_SLUG_TAKEN_MESSAGE = "Tenhle identifikátor už jiné město používá.";

const DIACRITICS: Record<string, string> = {
  á: "a", č: "c", ď: "d", é: "e", ě: "e", í: "i", ň: "n", ó: "o",
  ř: "r", š: "s", ť: "t", ú: "u", ů: "u", ý: "y", ž: "z"
};

/**
 * Stabilní identifikátor města. Musí odpovídat tomu, co dělá backfill v migraci,
 * aby se ručně založené a zpětně doplněné město chovaly stejně.
 */
export function slugifyCityName(value: string) {
  const lowered = String(value ?? "").normalize("NFC").toLowerCase();
  let out = "";
  for (const char of lowered) {
    out += DIACRITICS[char] ?? char;
  }
  return out
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Věta „Hry v …“. Bez vyplněného tvaru se použije název, jak je. */
export function cityLocative(city: Pick<City, "name" | "nameLocative"> | null | undefined) {
  if (!city) {
    return "";
  }
  const locative = city.nameLocative.trim();
  return locative || city.name;
}

export type CityInput = {
  name: string;
  slug: string;
  nameLocative: string;
  displayOrder: number;
  isActive: boolean;
  lat: number | null;
  lng: number | null;
};

export type CityValidation =
  | { ok: true; value: CityInput }
  | { ok: false; fieldErrors: Record<string, string> };

function parseCoordinate(raw: string, min: number, max: number) {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) {
    return { value: null as number | null };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return { value: null as number | null, error: `Zadej číslo mezi ${min} a ${max}, nebo nech pole prázdné.` };
  }
  return { value: parsed };
}

export function validateCity(raw: {
  name: string;
  slug?: string;
  nameLocative?: string;
  displayOrder?: string;
  isActive?: boolean;
  lat?: string;
  lng?: string;
}): CityValidation {
  const fieldErrors: Record<string, string> = {};

  const name = String(raw.name ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < CITY_NAME_MIN_LENGTH || name.length > CITY_NAME_MAX_LENGTH) {
    fieldErrors.name = CITY_NAME_LENGTH_MESSAGE;
  }

  const slugSource = String(raw.slug ?? "").trim() || name;
  const slug = slugifyCityName(slugSource);
  if (!slug) {
    fieldErrors.slug = "Z názvu se nepodařilo odvodit identifikátor. Doplň ho ručně (písmena bez diakritiky a pomlčky).";
  }

  const orderRaw = String(raw.displayOrder ?? "").trim();
  let displayOrder = 0;
  if (orderRaw) {
    const parsed = Number(orderRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      fieldErrors.display_order = "Pořadí musí být celé číslo od 0.";
    } else {
      displayOrder = Math.floor(parsed);
    }
  }

  const lat = parseCoordinate(String(raw.lat ?? ""), -90, 90);
  if (lat.error) {
    fieldErrors.lat = lat.error;
  }
  const lng = parseCoordinate(String(raw.lng ?? ""), -180, 180);
  if (lng.error) {
    fieldErrors.lng = lng.error;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: {
      name,
      slug,
      nameLocative: String(raw.nameLocative ?? "").replace(/\s+/g, " ").trim(),
      displayOrder,
      isActive: raw.isActive !== false,
      lat: lat.value,
      lng: lng.value
    }
  };
}

/** Souřadnice, které dostane hra ve městě bez vyplněné polohy. */
export const FALLBACK_CITY_COORDINATES = { lat: 50.0755, lng: 14.4378 };

export function cityCoordinates(city: Pick<City, "lat" | "lng"> | null | undefined) {
  if (city && typeof city.lat === "number" && typeof city.lng === "number") {
    return { lat: city.lat, lng: city.lng };
  }
  return FALLBACK_CITY_COORDINATES;
}
