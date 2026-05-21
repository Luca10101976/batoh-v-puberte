export type ProgressCompletionState = {
  status?: "in_progress" | "completed" | null;
  first_completed_at?: string | null;
  completed_at?: string | null;
};

function hasValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isActiveInProgressLocation(row: ProgressCompletionState | null | undefined) {
  return row?.status === "in_progress";
}

// Historical completion matters for score/history/unlocks.
// A replay can still be active later on the same row.
export function hasHistoricalLocationCompletion(row: ProgressCompletionState | null | undefined) {
  if (!row) {
    return false;
  }

  if (row.status === "completed") {
    return true;
  }

  return hasValue(row.first_completed_at);
}

// completed_at is historically overloaded in this project and can exist
// even on in-progress rows. Only explicit completed markers may lock resume
// into replay mode.
export function isCompletedLocationProgress(row: ProgressCompletionState | null | undefined) {
  if (!row) {
    return false;
  }

  if (isActiveInProgressLocation(row)) {
    return false;
  }

  return hasHistoricalLocationCompletion(row);
}
