export function parseRequestedPlayStep(args: {
  episodeParam: string | null;
  taskParam: string | null;
  episodeCount: number;
  taskCountForEpisode: (episodeIndex: number) => number;
}) {
  const { episodeParam, taskParam, episodeCount, taskCountForEpisode } = args;

  if (!episodeParam) {
    return { episodeIndex: null as number | null, taskIndex: null as number | null };
  }

  const episodeNumber = Number(episodeParam);
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > episodeCount) {
    return { episodeIndex: null as number | null, taskIndex: null as number | null };
  }

  const episodeIndex = episodeNumber - 1;

  if (!taskParam) {
    return { episodeIndex, taskIndex: null as number | null };
  }

  const taskNumber = Number(taskParam);
  const taskCount = taskCountForEpisode(episodeIndex);
  if (!Number.isInteger(taskNumber) || taskNumber < 1 || taskNumber > taskCount) {
    return { episodeIndex, taskIndex: null as number | null };
  }

  return { episodeIndex, taskIndex: taskNumber - 1 };
}

// R24: rekonstrukce pozice v rozehrané výpravě.
//
// Pozice se NEUKLÁDÁ. Počítá se pokaždé znovu z uzavřených úkolů dané výpravy,
// takže reload i druhé zařízení dají stejný výsledek.
//
// Uzavřený úkol = správně zodpovězený, explicitní Nevím, nebo automatické Nevím
// po vyčerpání pokusů. Úkol s jedním nebo dvěma chybnými pokusy uzavřený NENÍ,
// takže se na něj hráč vrací.

export type ResumeTaskRow = {
  task_id: string;
  status: "correct" | "wrong" | "unknown";
};

export type ResumeTarget = {
  episodeIndex: number;
  taskIndex: number;
  /** requested = pozice z adresy, computed = první neuzavřený úkol, completed = vše hotové */
  source: "requested" | "computed" | "completed";
};

export function isClosedTaskStatus(status: string | null | undefined) {
  return status === "correct" || status === "unknown";
}

export function resolveResumeTarget(args: {
  episodes: Array<{ tasks: Array<{ id: string }> }>;
  taskProgress: ResumeTaskRow[];
  requestedEpisodeIndex?: number | null;
  requestedTaskIndex?: number | null;
}): ResumeTarget {
  const { episodes, taskProgress } = args;
  const closed = new Set(taskProgress.filter((row) => isClosedTaskStatus(row.status)).map((row) => row.task_id));

  const flat: Array<{ episodeIndex: number; taskIndex: number; id: string }> = [];
  episodes.forEach((episode, episodeIndex) => {
    episode.tasks.forEach((task, taskIndex) => {
      flat.push({ episodeIndex, taskIndex, id: task.id });
    });
  });

  if (flat.length === 0) {
    return { episodeIndex: 0, taskIndex: 0, source: "computed" };
  }

  const firstOpen = flat.find((item) => !closed.has(item.id));

  // R26/Q1: pozice z adresy nesmí hráče posunout dopředu. Respektuje se jen tehdy,
  // když ukazuje přesně na úkol, který je stejně na řadě – tedy nikdy jako zkratka.
  // Dřív stačilo, aby na požadované pozici ležel neuzavřený úkol, a šlo tak přeskočit
  // celé zastávky (?episode=5&task=1).
  const requestedEpisodeIndex = args.requestedEpisodeIndex ?? null;
  if (requestedEpisodeIndex !== null && firstOpen) {
    const requestedTaskIndex = args.requestedTaskIndex ?? 0;
    if (firstOpen.episodeIndex === requestedEpisodeIndex && firstOpen.taskIndex === requestedTaskIndex) {
      return { episodeIndex: firstOpen.episodeIndex, taskIndex: firstOpen.taskIndex, source: "requested" };
    }
  }

  if (firstOpen) {
    return { episodeIndex: firstOpen.episodeIndex, taskIndex: firstOpen.taskIndex, source: "computed" };
  }

  const last = flat[flat.length - 1];
  return { episodeIndex: last.episodeIndex, taskIndex: last.taskIndex, source: "completed" };
}
