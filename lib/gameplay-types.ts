export type GameplayTaskType = "question" | "photo" | "choice";

export type GameplayTask = {
  id: string;
  type: GameplayTaskType;
  typeLabel: string;
  title: string;
  content: string;
  options?: string[];
  illustrationImage?: string;
  illustrationImageAlt?: string;
  /** R25: uznávané odpovědi. SERVER ONLY – do prohlížeče se nikdy neposílají. */
  correctAnswers: string[];
  /** R25: kolik uznávaných odpovědí stačí ke splnění; není tajné, hráč to má vědět. */
  minCorrectMatches?: number;
  /** R25: má úkol autorskou nápovědu? Samotný text se posílá až po jejím otevření. */
  hasHint?: boolean;
  /** R25: text nápovědy. SERVER ONLY – jinak by ji šlo přečíst zadarmo. */
  hintText?: string;
  legacyTaskId?: string;
};

export type GameplayEpisode = {
  id: string;
  name: string;
  intro: string;
  background: string;
  /** R26: autorský text po dokončení téhle zastávky. Prázdný = obecný text. Není spoiler. */
  transitionText?: string;
  illustrationImage?: string;
  illustrationImageAlt?: string;
  tasks: GameplayTask[];
  clue: string[];
};

/** R25: podoba úkolu, která smí do prohlížeče. Bez odpovědí a bez textu nápovědy. */
export type PublicGameplayTask = Omit<GameplayTask, "correctAnswers" | "hintText">;

export type PublicGameplayEpisode = Omit<GameplayEpisode, "tasks"> & { tasks: PublicGameplayTask[] };

/** R26: závěrečný obsah hry. Server ho vydá až po platném dokončení výpravy. */
export type GameplayEnding = {
  endingTitle: string;
  endingStory: string;
  playerMessage: string;
};

/**
 * R38: tvar hry tak, jak ji vydá server. Dřív tenhle typ žil v lib/mock-data.ts
 * vedle obsahu Klamovky a Budějovic, takže kvůli němu musel zůstat v produkčním
 * bundlu i celý herní obsah v kódu. Data teď pocházejí výhradně z databáze.
 */
export type MapLocation = {
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
  map: { x: number; y: number };
  introLabel: string;
  introStory: string;
  endingTitle: string;
  endingStory: string;
  playerMessage: string;
  interludes: string[];
  episodes: GameplayEpisode[];
  catalogOrder?: number;
  /** Tvar města pro větu „Hry v …"; spravuje se v Mozku (R37). */
  cityLocative?: string;
  /** Název hry, kterou je potřeba dohrát dřív (R21/R22). */
  unlockRequirementName?: string | null;
  /** R44: kam má hráč fyzicky přijít. Vlastnost hry, ne města ani první zastávky. */
  startPlaceName?: string | null;
  startLat?: number | null;
  startLng?: number | null;
  /** R44: vlastní lákací text detailu. Prázdný = použije se krátký popis z katalogu. */
  detailText?: string | null;
};
