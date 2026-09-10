import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getCanonicalCorrectAnswer } from "@/lib/mission-task-normalization";
import type { GameplayEnding, GameplayEpisode, GameplayTask, PublicGameplayTask } from "@/lib/gameplay-types";
import { toPublicTask as stripServerOnlyTaskFields } from "@/lib/gameplay-public";
import { buildCatalog, firstSentence, resolveCatalogEntryForLocation, type CatalogEntry, type CatalogMissionRow } from "@/lib/catalog";
import { legacyLocationIdForMission, legacyMissionIdForLocation } from "@/lib/legacy-location-ids";
import { cityByName, loadCities } from "@/lib/cities-server";
import { cityCoordinates, cityLocative, type City } from "@/lib/cities";

type MissionStopDbRow = {
  id: string;
  mission_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  order: number;
  transition_text?: string | null;
};

type MissionTaskDbRow = {
  id: string;
  stop_id: string;
  type: "otevrena" | "vyber" | "ano-ne";
  question: string;
  correct_answer: string;
  options: unknown;
  order: number;
  hint_text?: string | null;
  min_correct_matches?: number | null;
};

type MissionDbRow = {
  id: string;
  title: string;
  city: string;
  intro_text?: string;
  hero_image_url?: string;
  difficulty?: "lehka" | "stredni" | "tezka";
  duration_min?: number;
  is_published?: boolean;
  short_description?: string | null;
  catalog_order?: number | null;
  unlock_after_mission_id?: string | null;
  ending_title?: string | null;
  ending_text?: string | null;
  ending_player_message?: string | null;
};

type DbBackedLocationSeed = {
  id: string;
  city: string;
  name: string;
  teaser: string;
  shortDescription?: string;
  unlockedByPlaceId?: string | null;
  subtitle: string;
  story: string;
  image: string;
  unlocked: boolean;
  difficulty: "Lehká" | "Střední" | "Vyšší";
  distance: string;
  duration: string;
  vibe: string[];
  lat: number;
  lng: number;
  map: {
    x: number;
    y: number;
  };
  introLabel: string;
  introStory: string;
  endingTitle: string;
  endingStory: string;
  playerMessage: string;
  interludes: string[];
  catalogOrder: number;
};

/** Neutrální zástup, když hra nemá vlastní obrázek. Systémová ilustrace Traki, ne obsah jiné hry. */
const NEUTRAL_GAME_IMAGE = "/illustrations/traki/mapa.webp";

function mapDifficultyLabel(value?: "lehka" | "stredni" | "tezka") {
  if (value === "lehka") {
    return "Lehká";
  }
  if (value === "tezka") {
    return "Vyšší";
  }
  if (value === "stredni") {
    return "Střední";
  }
  return undefined;
}

function splitParagraphs(value: string | null | undefined) {
  return (value ?? "")
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitQuestion(value: string) {
  const parts = splitParagraphs(value);
  if (parts.length === 0) {
    return { title: "Úkol", content: "" };
  }
  if (parts.length === 1) {
    return { title: parts[0], content: "" };
  }
  return { title: parts[0], content: parts.slice(1).join("\n\n") };
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function mapTaskType(type: MissionTaskDbRow["type"]): GameplayTask["type"] {
  if (type === "vyber" || type === "ano-ne") {
    return "choice";
  }
  return "question";
}

function mapTaskTypeLabel(type: MissionTaskDbRow["type"]) {
  if (type === "vyber") {
    return "Výběr";
  }
  if (type === "ano-ne") {
    return "Ano / ne";
  }
  return "Otázka";
}

function parseTaskOptions(type: MissionTaskDbRow["type"], options: unknown) {
  if (Array.isArray(options)) {
    const parsed = options.map((item) => String(item).trim()).filter(Boolean);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  if (type === "ano-ne") {
    return ["Ano", "Ne"];
  }

  return undefined;
}

function parseCorrectAnswers(value: string | null | undefined) {
  return (value ?? "")
    .split(/\n|[|,;*•]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

// R25: pravidlo správnosti je teď v datech, ne v textu zadání.
// Uznávané odpovědi = řádky (nebo běžné oddělovače) sloupce correct_answer.
// Kolik jich stačí = sloupec min_correct_matches. Dřívější odvozování z formulací
// „alespoň N" / „aspoň N", prefix „MIN n:" i výjimka natvrdo pro jeden úkol
// Klamovky jsou pryč – obsah se převedl migrací R25.
function parseTaskCorrectnessRule(rawCorrectAnswer: string | null | undefined, minCorrectMatches: number | null | undefined) {
  const correctAnswers = parseCorrectAnswers(rawCorrectAnswer);
  const min =
    typeof minCorrectMatches === "number" && Number.isFinite(minCorrectMatches) && minCorrectMatches > 0
      ? minCorrectMatches
      : undefined;
  return { correctAnswers, minCorrectMatches: min };
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/**
 * R37: poloha města přichází z tabulky cities, kterou spravuje Mozek. Dřív se
 * hledala v obsahu v kódu a nové město spadlo na souřadnice Prahy.
 */
function resolveCityMeta(cities: Map<string, City>, city: string) {
  const match = cities.get((city ?? "").trim().toLowerCase()) ?? null;
  return {
    coordinates: cityCoordinates(match),
    locative: cityLocative(match) || city
  };
}

async function loadCityMap() {
  try {
    return cityByName(await loadCities(getSupabaseServerClient()));
  } catch {
    return new Map<string, City>();
  }
}

function buildDbBackedLocationSeed(
  mission: MissionDbRow,
  episodes: GameplayEpisode[],
  cityMeta: { coordinates: { lat: number; lng: number }; locative: string },
  fallbackImage?: string,
  catalogEntry?: CatalogEntry | null
): DbBackedLocationSeed {
  const introStory = (mission.intro_text ?? "").trim();
  // R20: popis karty = short_description, jinak první věta intro (katalogová vrstva)
  const teaserSource = catalogEntry?.teaser || firstSentence(introStory) || `${mission.city} městská mise`;
  const teaser = truncateText(teaserSource, 96);
  // R38: titulní obrázek je obsah hry a patří do databáze. Když ho hra nemá,
  // použije se její vlastní první fotka, a teprve pak neutrální ilustrace Traki.
  // Nikdy ne fotka jiné hry – přesně to dřív dávalo Budějovicím obrázek Klamovky.
  const image = mission.hero_image_url?.trim() || fallbackImage?.trim() || NEUTRAL_GAME_IMAGE;

  return {
    id: mission.id,
    city: mission.city,
    name: mission.title,
    teaser,
    shortDescription: teaser,
    // R20/R22: katalogový zámek z DB; neplatná vazba = trvale zamčeno
    unlockedByPlaceId: catalogUnlockedByPlaceId(catalogEntry ?? null),
    subtitle: "Městská mise",
    story: introStory,
    image,
    // R20 fail-closed: hra s katalogovým zámkem není "defaultně odemčená"
    unlocked: !catalogEntry?.unlockAfterLocationId,
    difficulty: mapDifficultyLabel(mission.difficulty) ?? "Lehká",
    distance: mission.city,
    duration:
      typeof mission.duration_min === "number" && Number.isFinite(mission.duration_min)
        ? `${mission.duration_min} min`
        : "",
    vibe: [],
    lat: cityMeta.coordinates.lat,
    lng: cityMeta.coordinates.lng,
    map: { x: 50, y: 50 },
    introLabel: "Mise",
    introStory,
    // R25: autorský závěr z databáze. Konstanty zůstávají jen jako neutrální náhrada,
    // když ho autor zatím nenapsal.
    endingTitle: (mission.ending_title ?? "").trim() || "Mise dokončena",
    endingStory:
      (mission.ending_text ?? "").trim() ||
      "Prošla jsi celou hru a posbírala všechny stopy. Tohle je konec téhle výpravy.",
    playerMessage:
      (mission.ending_player_message ?? "").trim() || "Skvělá práce. Tohle je oficiální výsledek tvé hry.",
    interludes: [],
    catalogOrder: catalogEntry?.catalogOrder ?? 0
  };
}

async function fetchPublishedMissionById(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  missionId: string,
  options?: { includeUnpublished?: boolean }
) {
  // R37: náhled v Mozku potřebuje i nepublikovanou hru. Používá se k tomu stejná
  // cesta k obsahu jako pro hráče, aby nevznikla druhá interpretace dat.
  const publishedOnly = options?.includeUnpublished !== true;
  const withPublishFilter = <T>(query: T): T => (publishedOnly ? ((query as any).eq("is_published", true) as T) : query);

  const queryWithHero = await withPublishFilter(
    supabase
    .from("missions")
    .select(
      "id, title, city, intro_text, hero_image_url, difficulty, duration_min, is_published, ending_title, ending_text, ending_player_message"
    )
      .eq("id", missionId)
  ).maybeSingle<MissionDbRow>();

  if (!queryWithHero.error) {
    return queryWithHero.data ?? null;
  }

  const message = queryWithHero.error.message?.toLowerCase() ?? "";

  // R25: prostředí bez migrace R25 nemá sloupce autorského závěru – hra funguje dál
  // s neutrální náhradou.
  if (message.includes("ending_")) {
    const queryWithoutEnding = await withPublishFilter(
      supabase
        .from("missions")
        .select("id, title, city, intro_text, hero_image_url, difficulty, duration_min, is_published")
        .eq("id", missionId)
    ).maybeSingle<MissionDbRow>();
    if (!queryWithoutEnding.error) {
      return queryWithoutEnding.data ?? null;
    }
  }

  if (!message.includes("hero_image_url")) {
    return null;
  }

  const queryWithoutHero = await withPublishFilter(
    supabase
      .from("missions")
      .select("id, title, city, intro_text, difficulty, duration_min, is_published")
      .eq("id", missionId)
  ).maybeSingle<MissionDbRow>();

  return queryWithoutHero.data ?? null;
}

/**
 * Historická hra (slug z legacy mapy podle UUID mise). Obsah se v DB hledá výhradně
 * podle stabilního UUID – změna názvu nebo města v Mozku identitu hry nemění.
 */
function getCanonicalMission(locationId: string) {
  const missionId = legacyMissionIdForLocation(locationId);
  return missionId ? { missionId } : null;
}

function buildTaskFromDb(stop: MissionStopDbRow, task: MissionTaskDbRow): GameplayTask {
  const questionParts = splitQuestion(task.question);
  const correctnessRule = parseTaskCorrectnessRule(task.correct_answer, task.min_correct_matches);
  const correctAnswers = correctnessRule.correctAnswers;
  const options = parseTaskOptions(task.type, task.options);
  const canonicalDbAnswer =
    task.type === "otevrena"
      ? null
      : getCanonicalCorrectAnswer({
          id: task.id,
          type: task.type,
          question: task.question,
          correct_answer: task.correct_answer,
          options: task.options
        });
  const finalCorrectAnswers =
    task.type === "otevrena"
      ? correctAnswers
      : canonicalDbAnswer
        ? [canonicalDbAnswer]
        : [];

  return {
    id: task.id,
    type: mapTaskType(task.type),
    typeLabel: mapTaskTypeLabel(task.type),
    title: questionParts.title,
    content: questionParts.content,
    options,
    correctAnswers: finalCorrectAnswers,
    minCorrectMatches: correctnessRule.minCorrectMatches,
    hasHint: Boolean((task.hint_text ?? "").trim()),
    hintText: (task.hint_text ?? "").trim() || undefined
  };
}

function buildEpisodesFromDb(stops: MissionStopDbRow[], tasks: MissionTaskDbRow[]): GameplayEpisode[] {
  const tasksByStopId = new Map<string, MissionTaskDbRow[]>();
  tasks.forEach((task) => {
    const current = tasksByStopId.get(task.stop_id) ?? [];
    current.push(task);
    tasksByStopId.set(task.stop_id, current);
  });

  return stops.map((stop) => {
    const [intro = "", ...backgroundParts] = splitParagraphs(stop.description);

    return {
      id: stop.id,
      name: stop.title,
      intro,
      background: backgroundParts.join("\n\n"),
      illustrationImage: stop.image_url || undefined,
      transitionText: (stop.transition_text ?? "").trim() || undefined,
      clue: [],
      tasks: (tasksByStopId.get(stop.id) ?? [])
        .sort((a, b) => a.order - b.order)
        .map((task) => buildTaskFromDb(stop, task))
    };
  });
}

export async function getGameplayEpisodes(
  locationId: string,
  options?: { includeUnpublished?: boolean }
): Promise<GameplayEpisode[] | null> {
  const canonical = getCanonicalMission(locationId);

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return null;
  }

  const mission = await fetchPublishedMissionById(supabase, canonical?.missionId ?? locationId, options);

  if (!mission) {
    return null;
  }
  // R26: transition_text je autorský přechod po dokončení zastávky. Prostředí bez
  // migrace R26 sloupec nemá – hra pak jede s obecným textem.
  const stopQuery = (columns: string) =>
    supabase
      .from("mission_stops")
      .select(columns)
      .eq("mission_id", mission.id)
      .order("order", { ascending: true }) as unknown as Promise<{
      data: MissionStopDbRow[] | null;
      error: { message?: string } | null;
    }>;

  let { data: stopsData, error: stopsError } = await stopQuery(
    "id, mission_id, title, description, image_url, order, transition_text"
  );
  if (stopsError?.message?.toLowerCase().includes("transition_text")) {
    ({ data: stopsData, error: stopsError } = await stopQuery(
      "id, mission_id, title, description, image_url, order"
    ));
  }

  const stopIds = (stopsData ?? []).map((row) => row.id);
  const taskQuery = (columns: string) =>
    supabase
      .from("mission_tasks")
      .select(columns)
      .in("stop_id", stopIds.length > 0 ? stopIds : ["00000000-0000-0000-0000-000000000000"])
      .order("order", { ascending: true });

  let { data: tasksData, error: tasksError } = (await taskQuery(
    "id, stop_id, type, question, correct_answer, options, order, hint_text, min_correct_matches"
  )) as { data: MissionTaskDbRow[] | null; error: { message?: string } | null };
  if (tasksError && /hint_text|min_correct_matches/i.test(tasksError.message ?? "")) {
    // Prostředí bez migrace R25: hra funguje dál, jen bez nápověd a bez pravidla „stačí X".
    ({ data: tasksData, error: tasksError } = (await taskQuery(
      "id, stop_id, type, question, correct_answer, options, order"
    )) as { data: MissionTaskDbRow[] | null; error: { message?: string } | null });
  }

  if (stopsError || tasksError || !stopsData?.length) {
    return null;
  }

  const normalizedTasks = (tasksData ?? []).map((task) => ({ ...task }));

  return buildEpisodesFromDb((stopsData as MissionStopDbRow[]) ?? [], normalizedTasks);
}

// ---------------------------------------------------------------------------
// R20: katalog měst a her – jediný zdroj pravdy je tabulka `missions`.
// mock-data.ts už nerozhoduje, zda se hra/město v katalogu objeví, o publikaci
// ani o pořadí; slouží jen k runtime gameplay obsahu historických her (viz R38/R39).
// Historický slug (klamovka, …) určuje výhradně lib/legacy-location-ids.ts podle UUID.
// ---------------------------------------------------------------------------

const CATALOG_COLUMNS =
  "id, title, city, intro_text, hero_image_url, short_description, difficulty, duration_min, catalog_order, is_published, unlock_after_mission_id";
const CATALOG_COLUMNS_LEGACY = "id, title, city, intro_text, hero_image_url, difficulty, duration_min, is_published";

/** Historický slug hry podle UUID mise (stabilní mapa); jinak UUID mise. */
function resolveCatalogLocationId(row: CatalogMissionRow) {
  return legacyLocationIdForMission(row.id) ?? row.id;
}

/** Uživatelský název hry pro dané locationId: název místa z mocku (karta), jinak titul mise z katalogu. */
/**
 * R22: hodnota, kterou nikdy nemůže mít dokončená hra. Používá se, když je vazba
 * unlock_after_mission_id nastavená, ale neplatná (jiné město / nedohledatelná hra),
 * aby se hra i v UI chovala jako trvale zamčená (fail-closed).
 */
const INVALID_PREREQUISITE = "__neplatny_prerequisite__";

function catalogUnlockedByPlaceId(entry: CatalogEntry | null) {
  if (!entry?.unlockAfterLocationId) {
    return null;
  }
  return entry.unlockPrerequisiteInvalid ? INVALID_PREREQUISITE : entry.unlockAfterLocationId;
}

/**
 * R38: název vyžadované hry („Nejdřív dohraj: …") přichází výhradně z katalogu
 * v databázi. Dřív se hledal nejdřív v obsahu v kódu, takže hra přejmenovaná
 * v Mozku se tady pořád ukazovala starým jménem.
 */
function resolveLocationDisplayName(locationId: string | null | undefined, catalog: CatalogEntry[]) {
  if (!locationId) {
    return null;
  }
  return catalog.find((entry) => entry.locationId === locationId)?.title ?? null;
}

/**
 * Katalog z DB (pouze publikované hry, seřazené město → catalog_order → název).
 * Při nedostupné DB vyhodí chybu – stránka Domů (ISR) pak dál servíruje poslední
 * úspěšně vygenerovanou verzi místo prázdného katalogu.
 */
export async function getCatalog(): Promise<CatalogEntry[]> {
  let supabase: ReturnType<typeof getSupabaseServerClient>;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    // Bez Supabase env (např. CI build bez secrets) = prázdný katalog.
    // Záměrně žádný mock fallback: mock nesmí rozhodovat, co je v katalogu.
    return [];
  }
  let { data, error } = await supabase.from("missions").select(CATALOG_COLUMNS);
  if (error && /short_description|catalog_order|unlock_after_mission_id/i.test(error.message ?? "")) {
    ({ data, error } = await supabase.from("missions").select(CATALOG_COLUMNS_LEGACY));
  }
  if (error || !data) {
    throw new Error(`catalog_unavailable: ${error?.message ?? "no data"}`);
  }
  return buildCatalog(data as CatalogMissionRow[], resolveCatalogLocationId);
}

/**
 * R38: publikované hry určuje výhradně katalog v databázi.
 *
 * Dřív se při nedostupné databázi vracel pevný seznam z kódu. To znamenalo, že
 * výpadek databáze prohlásil za publikovanou i rozepsanou hru (Budějovice) –
 * tedy pravý opak toho, co má fail-safe dělat. Chyba se proto propaguje
 * a volající ji řeší jako chybu, ne jako jinou verzi katalogu.
 */
export async function getPublishedLocationIds() {
  const catalog = await getCatalog();
  return Array.from(new Set(catalog.map((entry) => entry.locationId)));
}

/**
 * R25: verze se VŠEMI daty, včetně správných odpovědí a textů nápověd.
 * Smí ji volat jen server. Do prohlížeče se nikdy nesmí dostat.
 */
async function getGameplayLocationInternal(locationId: string, catalog?: CatalogEntry[]) {
  const canonical = getCanonicalMission(locationId);
  // R38: katalog je jediný zdroj. Když ho nejde načíst, chyba se propaguje –
  // nikdy se nesmí potichu použít stará kopie hry z kódu.
  const catalogEntries: CatalogEntry[] = catalog ?? (await getCatalog());

  const resolvedEntry = resolveCatalogEntryForLocation(catalogEntries, locationId);
  if (resolvedEntry.isAlias) {
    // R21: UUID mise, která má kanonický slug, není samostatná adresa – jinak by šel
    // obejít katalogový zámek (unlock_after_mission_id) přes druhou URL.
    return null;
  }
  const catalogEntry = resolvedEntry.entry;

  if (canonical) {
    const publishedLocationIds = catalogEntries.map((entry) => entry.locationId);
    if (!publishedLocationIds.includes(locationId)) {
      return null;
    }
  }

  const supabase = getSupabaseServerClient();
  const mission = await fetchPublishedMissionById(supabase, canonical?.missionId ?? locationId);
  const episodes = await getGameplayEpisodes(locationId);

  // R38: hra bez obsahu v databázi se prostě nezobrazí. Žádná náhradní verze.
  if (!mission || !episodes) {
    return null;
  }

  const cityMap = await loadCityMap();
  const cityMeta = resolveCityMeta(cityMap, mission.city);
  const fallbackImage = episodes.find((episode) => episode.illustrationImage)?.illustrationImage;

  return {
    ...buildDbBackedLocationSeed(mission, episodes, cityMeta, fallbackImage, catalogEntry),
    // Historická hra si drží svůj slug: pod ním má uložený postup i výsledky.
    id: locationId,
    // R37: tvar města pro větu „Hry v …" přichází z Mozku, ne z mapy v kódu.
    cityLocative: cityMeta.locative,
    // R21: název vyžadované hry pro detail („Nejdřív dokonči: …")
    unlockRequirementName: resolveLocationDisplayName(catalogEntry?.unlockAfterLocationId, catalogEntries),
    episodes
  };
}

/** R25: odstraní z úkolu vše, co je tajné – uznávané odpovědi a text nápovědy. */
function toPublicTask(task: GameplayTask): PublicGameplayTask {
  return stripServerOnlyTaskFields(task);
}

/**
 * R25: obsah hry pro prohlížeč. Jediné místo, kudy se hra dostává na stránku,
 * a proto jediné místo, kde se odstraňují správné odpovědi a texty nápověd.
 *
 * Dřív se celý objekt hry předával herní obrazovce jako vlastnost komponenty,
 * takže se všech devatenáct sad odpovědí Klamovky serializovalo do HTML.
 * Klient je k ničemu nepotřebuje: o správnosti rozhoduje výhradně server.
 */
export async function getGameplayLocation(locationId: string, catalog?: CatalogEntry[]) {
  const location = await getGameplayLocationInternal(locationId, catalog);
  if (!location) {
    return null;
  }
  // R26: kromě odpovědí a nápověd tady zůstává i závěr hry. Do prohlížeče ho
  // vydá až server po dokončení výpravy (getGameplayEnding).
  const { endingTitle: _endingTitle, endingStory: _endingStory, playerMessage: _playerMessage, ...publicLocation } =
    location;
  return {
    ...publicLocation,
    episodes: location.episodes.map((episode) => ({
      ...episode,
      tasks: episode.tasks.map(toPublicTask)
    }))
  };
}

/**
 * R26: závěrečný obsah hry. Volá se JEN po platném dokončení výpravy nebo když
 * oprávněný hráč zobrazuje výsledek hry, kterou už dokončil.
 */
export async function getGameplayEnding(locationId: string): Promise<GameplayEnding | null> {
  const location = await getGameplayLocationInternal(locationId);
  if (!location) {
    return null;
  }
  return {
    endingTitle: location.endingTitle,
    endingStory: location.endingStory,
    playerMessage: location.playerMessage
  };
}

/**
 * R25: obsah hry včetně odpovědí pro administrační export za heslem.
 * Jediný povolený konzument je CSV/JSON export v Mozku, nikdy ne stránka pro hráče.
 */
export async function getGameplayLocationForExport(locationId: string, catalog?: CatalogEntry[]) {
  return getGameplayLocationInternal(locationId, catalog);
}

export async function getGameplayTask(locationId: string, taskId: string) {
  const canonical = getCanonicalMission(locationId);
  if (canonical) {
    const publishedLocationIds = await getPublishedLocationIds();
    if (!publishedLocationIds.includes(locationId)) {
      return null;
    }
  }

  // R38: úkol existuje jen tehdy, když ho má databáze.
  const episodes = await getGameplayEpisodes(locationId);
  for (const episode of episodes ?? []) {
    const found = episode.tasks.find((task) => task.id === taskId);
    if (found) {
      return found;
    }
  }

  return null;
}

export async function getGameplayTaskIds(locationId: string) {
  const canonical = getCanonicalMission(locationId);
  if (canonical) {
    const publishedLocationIds = await getPublishedLocationIds();
    if (!publishedLocationIds.includes(locationId)) {
      return [];
    }
  }

  // R38: seznam úkolů určuje výhradně databáze. Prázdný seznam znamená, že hra
  // obsah nemá – nikdy se nedoplní z kódu, protože id úkolů by nesouhlasila
  // s uloženými odpověďmi hráčů.
  const episodes = await getGameplayEpisodes(locationId);
  return (episodes ?? []).flatMap((episode) => episode.tasks.map((task) => task.id));
}
