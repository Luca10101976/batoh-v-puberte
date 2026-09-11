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
  /**
   * R44: vlastní lákací text detailu. Karta v katalogu, detail a úvod hry mají
   * každý svou úlohu; dokud autor detailový text nevyplní, použije se jako dosud
   * krátký popis z katalogu.
   */
  detailText?: string | null;
  /** R44: kam má hráč fyzicky přijít (vlastnost hry, ne první zastávky). */
  startPlaceName?: string | null;
  startLat?: number | null;
  startLng?: number | null;
  /** Zastávky hry v pořadí; první = místo startu */
  episodes: Array<{ name: string }>;
  /** locationId vyžadované hry (unlock_after_mission_id), null = bez podmínky */
  unlockedByPlaceId?: string | null;
  /** Uživatelský název vyžadované hry (z katalogu); null když ho nelze určit */
  unlockRequirementName?: string | null;
  /** Výsledek fail-closed vyhodnocení zámku (R20) */
  unlocked: boolean;
  /**
   * Hráč má na tomhle zařízení dokončenou registraci.
   *
   * Popisek hlavní akce to NEOVLIVŇUJE – z pohledu hry se pořád jde „Hrát“ a
   * případné založení hráče si aplikace vyřídí až po kliknutí. Slouží jen k tomu,
   * aby zařízení bez hráče nikdy nenabídlo Pokračovat ani Hrát znovu, protože
   * rozehranost i dokončení jsou vlastnost konkrétního hráče.
   */
  registered: boolean;
  /** R24: hráč má právě běžící výpravu této hry (zdroj: běžící sessions, ne nejlepší výsledek) */
  hasActiveRun?: boolean;
  /** R24: hráč hru už někdy dokončil */
  completed?: boolean;
};

export type LocationDetailModel = {
  title: string;
  subtitle: string | null;
  description: string;
  image: string;
  /** „Začínáme: …“ – název první zastávky; null, když hra zastávky nemá */
  startStopName: string | null;
  /** R44: místo srazu a odkaz do externí mapy; null, když je autor nevyplnil */
  startPlaceName: string | null;
  startMapUrl: string | null;
  locked: boolean;
  /** Text pro zamčenou hru, např. „Nejdřív dokonči: Park Klamovka“ */
  lockMessage: string | null;
  primaryAction: "play" | "continue" | "replay" | "locked";
  /** Popisek hlavního tlačítka podle stavu hráče (R24) */
  primaryLabel: string;
};

const GENERIC_SUBTITLE = "Městská mise";

export function buildLocationDetailModel(input: LocationDetailInput): LocationDetailModel {
  const title = (input.name ?? "").trim();
  const subtitleRaw = (input.subtitle ?? "").trim();
  const subtitle = subtitleRaw && subtitleRaw !== title && subtitleRaw !== GENERIC_SUBTITLE ? subtitleRaw : null;
  // R44: detail má vlastní text, teprve pak sahá po katalogovém popisu.
  const description =
    (input.detailText ?? "").trim() || (input.shortDescription ?? "").trim() || (input.teaser ?? "").trim();
  const startStopName = (input.episodes[0]?.name ?? "").trim() || null;

  // R44: mapu si Traki nekreslí, jen odkáže do běžné mapové služby. Odkaz vznikne
  // jen tehdy, když hra má opravdu obě souřadnice – nikdy se nedopočítává z města.
  const startPlaceName = (input.startPlaceName ?? "").trim() || null;
  const hasCoordinates =
    typeof input.startLat === "number" &&
    Number.isFinite(input.startLat) &&
    typeof input.startLng === "number" &&
    Number.isFinite(input.startLng);
  const startMapUrl = hasCoordinates
    ? `https://www.openstreetmap.org/?mlat=${input.startLat}&mlon=${input.startLng}#map=17/${input.startLat}/${input.startLng}`
    : null;
  const locked = !input.unlocked;
  const requirement = (input.unlockRequirementName ?? "").trim();
  const lockMessage = locked ? `Nejdřív dokonči: ${requirement || "předchozí hru"}` : null;

  // R24: rozehranost se bere z běžící výpravy, ne z nejlepšího výsledku.
  //   běžící výprava        -> Pokračovat
  //   dokončeno, nic neběží -> Hrát znovu (vznikne nová výprava)
  //   jinak                 -> Hrát
  //
  // Hlavní akce popisuje STAV HRY, ne stav přihlášení. Dřív tu byla čtvrtá
  // možnost „Přihlásit a hrát“ pro zařízení bez hráče; technická potřeba
  // identity ale do názvu herní akce nepatří a hráč ji po kliknutí stejně
  // vyřídí cestou, kterou aplikace zvolí sama.
  const playerState = input.registered ? input : { hasActiveRun: false, completed: false };
  const primaryAction: LocationDetailModel["primaryAction"] = locked
    ? "locked"
    : playerState.hasActiveRun
      ? "continue"
      : playerState.completed
        ? "replay"
        : "play";

  const PRIMARY_LABELS: Record<LocationDetailModel["primaryAction"], string> = {
    play: "Hrát",
    continue: "Pokračovat",
    replay: "Hrát znovu",
    locked: ""
  };

  return {
    title,
    subtitle,
    description,
    image: input.image,
    startStopName,
    startPlaceName,
    startMapUrl,
    locked,
    lockMessage,
    primaryAction,
    primaryLabel: PRIMARY_LABELS[primaryAction]
  };
}
