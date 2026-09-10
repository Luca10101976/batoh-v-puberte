// R25: hranice mezi serverovými daty hry a tím, co smí do prohlížeče.
//
// Do R25 se celý objekt hry včetně správných odpovědí předával herní obrazovce
// jako vlastnost komponenty, takže se odpovědi serializovaly do HTML stránky.
// Klient je nepotřebuje: o správnosti rozhoduje výhradně server.
//
// Modul je čistý (žádná databáze, žádné aliasy v importech), aby se dal přímo
// otestovat – test tak dokazuje, že odstranění odpovědí opravdu proběhne.

export type SecretTaskFields = {
  correctAnswers?: string[];
  hintText?: string;
};

/** Pole, která nikdy nesmí opustit server. */
export const SERVER_ONLY_TASK_FIELDS = ["correctAnswers", "hintText"] as const;

export function toPublicTask<T extends SecretTaskFields>(task: T): Omit<T, "correctAnswers" | "hintText"> {
  const { correctAnswers: _answers, hintText: _hint, ...publicTask } = task;
  return publicTask;
}

export function toPublicEpisode<T extends { tasks: SecretTaskFields[] }>(episode: T) {
  return {
    ...episode,
    tasks: episode.tasks.map((task) => toPublicTask(task))
  };
}

/** R26: závěr hry je spoiler. Do prohlížeče smí až po dokončení výpravy. */
export const SERVER_ONLY_LOCATION_FIELDS = ["endingTitle", "endingStory", "playerMessage"] as const;

export type EndingFields = {
  endingTitle?: string;
  endingStory?: string;
  playerMessage?: string;
};

export function toPublicLocation<L extends EndingFields & { episodes: { tasks: SecretTaskFields[] }[] }>(location: L) {
  const {
    endingTitle: _endingTitle,
    endingStory: _endingStory,
    playerMessage: _playerMessage,
    ...rest
  } = location;
  return {
    ...rest,
    episodes: location.episodes.map((episode) => toPublicEpisode(episode))
  };
}
