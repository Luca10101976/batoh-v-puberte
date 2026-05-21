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
