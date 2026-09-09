import type { TaskProgressLike } from "@/lib/task-validation";

// Oprava před R23 (audit problém B): výchozí skóre výpravy se už neodvozuje z mock
// obsahu, ale z úkolů hry v DB. Funkce je čistá – dostane seznam ID úkolů hry
// a údaje z klienta a vrátí "postup", ze kterého existující DB výpočet
// (computeScoreFromTaskProgress) spočítá body stejně jako u sólo hry.
//
// Sémantika odpovídá dřívějšímu computeMissionScore:
//   - unknownTaskIds: konkrétní úkoly označené „Nevím“ (cizí ID se ignorují),
//   - unknownCount: jen počet – označí prvních N úkolů,
//   - penaltyPoints: legacy – ztracené body přepočtené na počet úkolů.

export type ExpeditionScoreInput = {
  unknownTaskIds?: unknown;
  unknownCount?: unknown;
  penaltyPoints?: unknown;
};

function toSafeInteger(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.floor(numeric));
}

export function buildTaskProgressFromClientInput(
  taskIds: string[],
  input: ExpeditionScoreInput,
  pointsPerTask: number
): TaskProgressLike[] {
  const validTaskIds = Array.from(new Set(taskIds.filter((id) => typeof id === "string" && id.length > 0)));
  if (validTaskIds.length === 0) {
    return [];
  }

  const unknown = new Set<string>();
  const rawUnknownTaskIds = Array.isArray(input.unknownTaskIds) ? input.unknownTaskIds : [];
  if (rawUnknownTaskIds.length > 0) {
    rawUnknownTaskIds
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => validTaskIds.includes(item))
      .forEach((item) => unknown.add(item));
  } else {
    let unknownCount = 0;
    if (typeof input.unknownCount === "number") {
      unknownCount = toSafeInteger(input.unknownCount);
    } else if (typeof input.penaltyPoints === "number" && pointsPerTask > 0) {
      unknownCount = Math.floor(toSafeInteger(input.penaltyPoints) / pointsPerTask);
    }
    validTaskIds.slice(0, Math.min(validTaskIds.length, unknownCount)).forEach((id) => unknown.add(id));
  }

  return validTaskIds.map((task_id) => ({ task_id, status: unknown.has(task_id) ? "unknown" : "correct" }));
}
