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
