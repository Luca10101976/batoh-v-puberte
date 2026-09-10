// R26: JEDINÁ autoritativní odpověď na otázku „který úkol je teď na řadě?“.
//
// Do R26 drželo pořadí jen tlačítko v prohlížeči. Server přijal odpověď na
// kterýkoli úkol hry kdykoli, takže se dala hra projít od konce a získat body
// bez cesty v terénu. Tenhle modul je proto čistý (bez databáze i bez klienta),
// aby ho mohl použít server při rozhodování i obrazovka při zobrazení, a aby se
// pravidlo nikdy nerozešlo do dvou různých implementací.
//
// Pravidlo (Q1): úkol je na řadě, jen když jsou VŠECHNY předchozí úkoly celé hry
// v této konkrétní výpravě uzavřené. Uzavřený = správně (correct) nebo Nevím
// (unknown), a to jak explicitní, tak automatické po třetí chybě. Nula bodů tedy
// hráče nikdy nezablokuje.
//
// Zastávka (Q3) nemá vlastní uložený stav: „dokončená“ znamená právě to, že jsou
// uzavřené všechny její úkoly v této výpravě. Žádná druhá pravda neexistuje.

export type OrderedTaskRow = {
  task_id: string;
  status: "correct" | "wrong" | "unknown";
};

export type OrderedEpisode = {
  id: string;
  name: string;
  transitionText?: string;
  tasks: Array<{ id: string }>;
};

export function isClosedStatus(status: string | null | undefined) {
  return status === "correct" || status === "unknown";
}

/** Úkoly celé hry v pořadí hraní: zastávka po zastávce, uvnitř podle pořadí úkolů. */
export function flattenTasks(episodes: OrderedEpisode[]) {
  const flat: Array<{ episodeIndex: number; taskIndex: number; id: string }> = [];
  episodes.forEach((episode, episodeIndex) => {
    episode.tasks.forEach((task, taskIndex) => {
      flat.push({ episodeIndex, taskIndex, id: task.id });
    });
  });
  return flat;
}

export function closedTaskIds(taskProgress: OrderedTaskRow[]) {
  return new Set(taskProgress.filter((row) => isClosedStatus(row.status)).map((row) => row.task_id));
}

/**
 * Úkol, který je právě na řadě. `null` = hráč má uzavřené všechno a hru už jen dokončí.
 */
export function resolveCurrentTask(episodes: OrderedEpisode[], taskProgress: OrderedTaskRow[]) {
  const closed = closedTaskIds(taskProgress);
  return flattenTasks(episodes).find((item) => !closed.has(item.id)) ?? null;
}

export type TaskAvailability =
  | { allowed: true }
  /** Úkol v téhle hře vůbec není. */
  | { allowed: false; reason: "unknown_task" }
  /** Úkol už je uzavřený; výsledek se nepřepisuje. */
  | { allowed: false; reason: "already_closed"; currentTaskId: string | null }
  /** Na řadě je jiný, dřívější úkol. */
  | { allowed: false; reason: "out_of_order"; currentTaskId: string | null };

/**
 * Smí hráč právě teď pracovat s tímhle úkolem? Používá server před KAŽDÝM
 * zápisem odpovědi i před vydáním nápovědy – nápověda k budoucímu úkolu je
 * stejné přeskočení pořadí jako odpověď.
 */
export function resolveTaskAvailability(
  episodes: OrderedEpisode[],
  taskProgress: OrderedTaskRow[],
  taskId: string
): TaskAvailability {
  const flat = flattenTasks(episodes);
  if (!flat.some((item) => item.id === taskId)) {
    return { allowed: false, reason: "unknown_task" };
  }

  const closed = closedTaskIds(taskProgress);
  const current = flat.find((item) => !closed.has(item.id)) ?? null;

  if (closed.has(taskId)) {
    return { allowed: false, reason: "already_closed", currentTaskId: current?.id ?? null };
  }
  if (!current || current.id !== taskId) {
    return { allowed: false, reason: "out_of_order", currentTaskId: current?.id ?? null };
  }
  return { allowed: true };
}

/** Zastávka je dokončená, právě když jsou uzavřené všechny její úkoly v této výpravě. */
export function isStopCompleted(episode: OrderedEpisode, taskProgress: OrderedTaskRow[]) {
  if (episode.tasks.length === 0) {
    return false;
  }
  const closed = closedTaskIds(taskProgress);
  return episode.tasks.every((task) => closed.has(task.id));
}

export type PendingStopTransition = {
  /** Zastávka, kterou hráč právě dokončil. */
  fromStopId: string;
  fromStopName: string;
  /** Pořadové číslo dokončené zastávky (1..stopCount) – ne index té následující. */
  fromStopNumber: number;
  toStopId: string;
  toStopName: string;
  toStopNumber: number;
  stopCount: number;
  /** Autorský text zastávky, kterou hráč dokončil; prázdný = použije se obecný. */
  transitionText: string;
};

/**
 * Přechod, který hráč ještě nepotvrdil (Q4).
 *
 * Odvozuje se ze stejných dat jako všechno ostatní: z uzavřených úkolů výpravy.
 * Jediné, co se doplňuje navíc, je seznam už potvrzených přechodů – bez něj by
 * obrazovka nešla zavřít, protože podmínka „zastávka je dokončená“ platí dál.
 * Ten seznam NENÍ zdroj pravdy o dokončení zastávky, jen o kliknutí hráče.
 */
export function resolvePendingStopTransition(args: {
  episodes: OrderedEpisode[];
  taskProgress: OrderedTaskRow[];
  confirmedStopIds: string[];
}): PendingStopTransition | null {
  const { episodes, taskProgress } = args;
  const confirmed = new Set(args.confirmedStopIds);
  const current = resolveCurrentTask(episodes, taskProgress);

  // Když je hotové úplně všechno, žádný přechod nezbývá – hra se dokončuje.
  if (!current) {
    return null;
  }
  // Přechod dává smysl jen na začátku další zastávky, tedy když hráč stojí na
  // jejím prvním úkolu a předchozí zastávka je celá uzavřená.
  if (current.episodeIndex === 0 || current.taskIndex !== 0) {
    return null;
  }

  const from = episodes[current.episodeIndex - 1];
  const to = episodes[current.episodeIndex];
  if (!from || !to || confirmed.has(from.id) || !isStopCompleted(from, taskProgress)) {
    return null;
  }

  return {
    fromStopId: from.id,
    fromStopName: from.name,
    fromStopNumber: current.episodeIndex,
    toStopId: to.id,
    toStopName: to.name,
    toStopNumber: current.episodeIndex + 1,
    stopCount: episodes.length,
    transitionText: (from.transitionText ?? "").trim()
  };
}

/** Obecný text přechodu pro zastávku, u které autor žádný nenapsal. */
export function fallbackTransitionText(fromStopName: string, toStopName: string) {
  return `Zastávku „${fromStopName}“ máš hotovou. Teď se přesuň na ${toStopName}.`;
}
