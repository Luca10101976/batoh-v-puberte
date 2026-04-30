import { getGameplayTask, getGameplayTaskIds } from "@/lib/gameplay-server";

export const MAX_TASK_ATTEMPTS = 3;
export const UNKNOWN_TASK_PENALTY = 15;
const MULTI_WORD_RULES: Record<string, { minMatches: number }> = {
  "klamovka-cassel-5": { minMatches: 3 }
};

export type MissionTaskStatus = "correct" | "wrong" | "unknown";

export type TaskProgressLike = {
  task_id: string;
  status: MissionTaskStatus;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function splitToNormalizedWords(value: string) {
  return normalize(value)
    .split(/[^a-z0-9]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractMinimumMatchCountFromTaskText(...values: Array<string | undefined>) {
  const normalizedText = values
    .map((value) => normalize(value ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");

  const match = normalizedText.match(/aspon\s+(\d+)/);
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function buildAcceptedWordSet(acceptedAnswers: string[]) {
  const acceptedWords = new Set<string>();

  acceptedAnswers.forEach((value) => {
    const normalizedValue = normalize(value);
    if (normalizedValue) {
      acceptedWords.add(normalizedValue);
    }

    splitToNormalizedWords(value).forEach((word) => {
      acceptedWords.add(word);
    });
  });

  return acceptedWords;
}

function expandChoiceAcceptedAnswers(acceptedAnswers: string[], options?: string[]) {
  const expanded = new Set<string>();
  const normalizedOptions = (options ?? [])
    .map((option) => normalize(option))
    .filter(Boolean);

  acceptedAnswers.forEach((value) => {
    const normalized = normalize(value);
    if (!normalized) {
      return;
    }

    expanded.add(normalized);

    normalizedOptions.forEach((option) => {
      if (option.length < 6) {
        return;
      }

      if (normalized.endsWith(option) && normalized !== option) {
        expanded.add(option);
      }
    });

    const containingOptions = normalizedOptions.filter((option) => {
      if (option.length < 6) {
        return false;
      }

      return normalized.includes(option);
    });

    if (containingOptions.length === 1) {
      expanded.add(containingOptions[0]);
    }

    const index = Number.parseInt(normalized, 10);
    if (!Number.isFinite(index) || !options?.length) {
      return;
    }

    const oneBasedOption = options[index - 1];
    if (oneBasedOption) {
      expanded.add(normalize(oneBasedOption));
    }

    const zeroBasedOption = options[index];
    if (zeroBasedOption) {
      expanded.add(normalize(zeroBasedOption));
    }
  });

  return Array.from(expanded);
}

export async function getTaskByLocationAndId(locationId: string, taskId: string) {
  return getGameplayTask(locationId, taskId);
}

export async function getLocationTaskIds(locationId: string) {
  return getGameplayTaskIds(locationId);
}

export async function isAnswerCorrect(locationId: string, taskId: string, answer: string) {
  const task = await getGameplayTask(locationId, taskId);
  const acceptedAnswers =
    task?.type === "choice"
      ? expandChoiceAcceptedAnswers(task.correctAnswers ?? [], task.options)
      : task?.correctAnswers ?? [];
  const multiWordRule = task?.legacyTaskId ? MULTI_WORD_RULES[task.legacyTaskId] : undefined;
  const inferredMinimumMatches =
    task?.type === "question"
      ? task.minCorrectMatches ?? extractMinimumMatchCountFromTaskText(task.title, task.content)
      : undefined;

  if (multiWordRule) {
    const acceptedSet = buildAcceptedWordSet(acceptedAnswers);
    if (acceptedSet.size === 0) {
      return false;
    }

    const uniqueWords = Array.from(new Set(splitToNormalizedWords(answer)));
    const matchedWords = uniqueWords.filter((word) => acceptedSet.has(word));
    return matchedWords.length >= multiWordRule.minMatches;
  }

  if (task?.type === "question" && inferredMinimumMatches) {
    const acceptedSet = buildAcceptedWordSet(acceptedAnswers);
    if (acceptedSet.size === 0) {
      return false;
    }

    const uniqueWords = Array.from(new Set(splitToNormalizedWords(answer)));
    const matchedWords = uniqueWords.filter((word) => acceptedSet.has(word));
    return matchedWords.length >= inferredMinimumMatches;
  }

  const normalizedInput = normalize(answer);
  if (!normalizedInput) {
    return false;
  }

  return acceptedAnswers.some((value) => normalize(value) === normalizedInput);
}

export async function computePenaltyFromTaskProgress(locationId: string, rows: TaskProgressLike[]) {
  const taskIds = await getLocationTaskIds(locationId);
  const totalTasks = taskIds.length;
  if (totalTasks === 0) {
    return {
      totalTasks: 0,
      resolvedTasks: 0,
      unknownTasks: 0,
      missingTasks: 0,
      penaltyPoints: 0
    };
  }

  const validTaskIds = new Set(taskIds);
  const finalByTask = new Map<string, MissionTaskStatus>();
  rows.forEach((row) => {
    if (!validTaskIds.has(row.task_id)) {
      return;
    }
    finalByTask.set(row.task_id, row.status);
  });

  let resolvedTasks = 0;
  let unknownTasks = 0;
  for (const taskId of taskIds) {
    const status = finalByTask.get(taskId);
    if (status === "correct") {
      resolvedTasks += 1;
      continue;
    }
    if (status === "unknown") {
      resolvedTasks += 1;
      unknownTasks += 1;
    }
  }

  const missingTasks = Math.max(0, totalTasks - resolvedTasks);
  const finalUnknownTasks = unknownTasks + missingTasks;

  return {
    totalTasks,
    resolvedTasks,
    unknownTasks: finalUnknownTasks,
    missingTasks,
    penaltyPoints: finalUnknownTasks * UNKNOWN_TASK_PENALTY
  };
}
