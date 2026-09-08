// R21: view-model zjednodušeného detailu hry (čistý, testovatelný modul).
//
// Detail hry obsahuje POUZE: hero obrázek, název hry, krátký lákavý popis,
// místo startu (= první zastávka hry) a tlačítko Hrát; u zamčené hry místo
// tlačítka informaci, kterou hru je potřeba nejdřív dokončit.
// Záměrně NEobsahuje: věk, délku, obtížnost, počet zastávek/úkolů, seznam zastávek,
// galerii, body, „čas“ ani technický štítek ODEMČENO.

export type LocationDetailInput = {
  name: string;
  /** Název mise (u historických her se liší od názvu místa); zobrazí se jen když dává smysl */
  subtitle?: string | null;
  image: string;
  /** Krátký popis z katalogu (short_description → jinak první věta intro_text) */
  shortDescription?: string | null;
  /** Oříznutý teaser karty – fallback, když shortDescription chybí */
  teaser?: string | null;
  /** Zastávky hry v pořadí; první = místo startu */
  episodes: Array<{ name: string }>;
  /** locationId vyžadované hry (unlock_after_mission_id), null = bez podmínky */
  unlockedByPlaceId?: string | null;
  /** Uživatelský název vyžadované hry (z katalogu); null když ho nelze určit */
  unlockRequirementName?: string | null;
  /** Výsledek fail-closed vyhodnocení zámku (R20) */
  unlocked: boolean;
  /** Hráč má dokončenou registraci (může hrát bez přihlašovacího kroku) */
  registered: boolean;
};

export type LocationDetailModel = {
  title: string;
  subtitle: string | null;
  description: string;
  image: string;
  /** „Začínáme: …“ – název první zastávky; null, když hra zastávky nemá */
  startStopName: string | null;
  locked: boolean;
  /** Text pro zamčenou hru, např. „Nejdřív dokonči: Park Klamovka“ */
  lockMessage: string | null;
  primaryAction: "play" | "login_and_play" | "locked";
};

const GENERIC_SUBTITLE = "Městská mise";

export function buildLocationDetailModel(input: LocationDetailInput): LocationDetailModel {
  const title = (input.name ?? "").trim();
  const subtitleRaw = (input.subtitle ?? "").trim();
  const subtitle = subtitleRaw && subtitleRaw !== title && subtitleRaw !== GENERIC_SUBTITLE ? subtitleRaw : null;
  const description = (input.shortDescription ?? "").trim() || (input.teaser ?? "").trim();
  const startStopName = (input.episodes[0]?.name ?? "").trim() || null;
  const locked = !input.unlocked;
  const requirement = (input.unlockRequirementName ?? "").trim();
  const lockMessage = locked ? `Nejdřív dokonči: ${requirement || "předchozí hru"}` : null;

  return {
    title,
    subtitle,
    description,
    image: input.image,
    startStopName,
    locked,
    lockMessage,
    primaryAction: locked ? "locked" : input.registered ? "play" : "login_and_play"
  };
}
