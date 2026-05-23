type ActiveMissionRow = {
  location_id: string;
  completed_at: string;
  updated_at?: string;
  status?: "in_progress" | "completed" | null;
};

type ActiveMissionSummary = {
  locationId: string;
  updatedAt: string;
} | null;

type ResumeTaskProgressRow = {
  task_id: string;
  status: "correct" | "wrong" | "unknown";
  attempts: number;
};

type ResumeMissionLocation = {
  id: string;
  name: string;
  episodes: Array<{
    name: string;
    tasks: Array<{
      id: string;
      title: string;
    }>;
  }>;
};

type ResumeMissionPayload = {
  task_progress?: ResumeTaskProgressRow[];
  location?: { status?: "in_progress" | "completed" | null };
} | null;

export type ResumeMissionCard = {
  locationId: string;
  missionName: string;
  stopName: string;
  taskLabel: string;
  progressText: string;
  href: string;
};

type ResumeFetchPayload = {
  task_progress?: Array<{ task_id: string; status: "correct" | "wrong" | "unknown"; attempts: number }>;
  location?: { status?: "in_progress" | "completed" | null };
} | null;

export function pickLatestActiveMission(progressRows: ActiveMissionRow[]): ActiveMissionSummary {
  const getActivityAt = (row: ActiveMissionRow) => row.updated_at?.trim() || row.completed_at?.trim() || "";
  const latestRow =
    progressRows
      .filter((row) => row.status === "in_progress" && row.location_id?.trim() && getActivityAt(row))
      .slice()
      .sort((a, b) => getActivityAt(b).localeCompare(getActivityAt(a)))[0] ?? null;

  if (!latestRow) {
    return null;
  }

  return {
    locationId: latestRow.location_id,
    updatedAt: getActivityAt(latestRow)
  };
}

export function buildResumeMissionCard(
  location: ResumeMissionLocation,
  payload: ResumeMissionPayload
): ResumeMissionCard | null {
  const taskRows = payload?.task_progress ?? [];
  if (payload?.location?.status !== "in_progress" && taskRows.length === 0) {
    return null;
  }

  const taskPositions = location.episodes.flatMap((episode, episodeIndex) =>
    episode.tasks.map((task, taskIndex) => ({
      task,
      episode,
      episodeIndex,
      taskIndex
    }))
  );

  if (taskPositions.length === 0) {
    return null;
  }

  const lockedTaskIds = new Set(
    taskRows.filter((row) => row.status === "correct" || row.status === "unknown").map((row) => row.task_id)
  );
  const firstOpenTask = taskPositions.find(({ task }) => !lockedTaskIds.has(task.id));
  const currentPosition = firstOpenTask ?? taskPositions[taskPositions.length - 1] ?? null;

  if (!currentPosition) {
    return null;
  }

  return {
    locationId: location.id,
    missionName: location.name,
    stopName: currentPosition.episode.name,
    taskLabel:
      firstOpenTask?.task.title?.trim() ||
      (payload?.location?.status === "in_progress" && taskRows.length > 0 ? "Připraveno k dalšímu kroku" : "Pokračování ve hře"),
    progressText: `Zastavení ${currentPosition.episodeIndex + 1}/${location.episodes.length} • Úkol ${Math.min(
      currentPosition.taskIndex + 1,
      currentPosition.episode.tasks.length
    )}/${currentPosition.episode.tasks.length}`,
    href: `/play/${location.id}?episode=${currentPosition.episodeIndex + 1}&task=${currentPosition.taskIndex + 1}`
  };
}

export async function resolveResumeMissionCard(args: {
  accessToken: string;
  profileCode: string;
  location: ResumeMissionLocation;
  fetchImpl?: typeof fetch;
}): Promise<ResumeMissionCard | null> {
  const accessToken = args.accessToken.trim();
  const profileCode = args.profileCode.trim();
  if (!accessToken || !profileCode) {
    return null;
  }

  const response = await (args.fetchImpl ?? fetch)("/api/game/location-progress", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      profileCode,
      locationId: args.location.id
    })
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as ResumeFetchPayload;
  return buildResumeMissionCard(args.location, payload);
}
