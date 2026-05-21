type MissionTaskType = "otevrena" | "vyber" | "ano-ne";

export type MissionTaskAnswerRow = {
  id: string;
  type: MissionTaskType;
  question: string;
  correct_answer: string;
  options: unknown;
};

export type MissionTaskAnswerValidationResult =
  | { value: string }
  | { error: string };

function normalizeForCompare(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitDelimitedAnswers(value: string) {
  return value
    .split(/\n|[|,;*•]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitWhitespaceAnswers(value: string) {
  return value
    .split(/\s+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractMinimumMatchCount(question: string) {
  const normalizedQuestion = normalizeForCompare(question).replace(/\s+/g, " ");
  const match = normalizedQuestion.match(/alespon\s+(\d+)/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function dedupeAnswers(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const key = normalizeForCompare(value);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(value.trim());
  });

  return result;
}

function parseTaskOptions(type: MissionTaskType, options: unknown) {
  if (Array.isArray(options)) {
    const parsed = options.map((item) => String(item).trim()).filter(Boolean);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  if (type === "ano-ne") {
    return ["Ano", "Ne"];
  }

  return [];
}

export function getCanonicalCorrectAnswer(row: MissionTaskAnswerRow): string | null {
  const current = String(row.correct_answer ?? "").trim();
  if (!current) {
    return null;
  }

  if (row.type === "otevrena") {
    const minimumMatchCount = extractMinimumMatchCount(row.question);
    if (!minimumMatchCount) {
      return null;
    }

    const delimitedAnswers = dedupeAnswers(splitDelimitedAnswers(current));
    if (delimitedAnswers.length >= minimumMatchCount) {
      return delimitedAnswers.join("\n");
    }

    if (!/[\n,;|*•]/.test(current)) {
      const whitespaceAnswers = dedupeAnswers(splitWhitespaceAnswers(current));
      if (whitespaceAnswers.length >= minimumMatchCount) {
        return whitespaceAnswers.join("\n");
      }
    }

    return null;
  }

  const options = parseTaskOptions(row.type, row.options);
  const normalizedCurrent = normalizeForCompare(current);

  if (row.type === "ano-ne") {
    if (normalizedCurrent === "ano") {
      return "Ano";
    }
    if (normalizedCurrent === "ne") {
      return "Ne";
    }
  }

  if (options.length === 0) {
    return null;
  }

  if (/^\d+$/.test(normalizedCurrent)) {
    const index = Number.parseInt(normalizedCurrent, 10);
    if (index >= 1 && index <= options.length) {
      return options[index - 1];
    }
  }

  const exactMatch = options.find((option) => normalizeForCompare(option) === normalizedCurrent);
  if (exactMatch) {
    return exactMatch;
  }

  const containingMatches = options.filter((option) => {
    const normalizedOption = normalizeForCompare(option);
    return normalizedOption.length >= 2 && normalizedCurrent.includes(normalizedOption);
  });

  if (containingMatches.length === 1) {
    return containingMatches[0];
  }

  return null;
}

export function validateAndCanonicalizeCorrectAnswer(row: MissionTaskAnswerRow): MissionTaskAnswerValidationResult {
  const current = String(row.correct_answer ?? "").trim();
  if (!current) {
    return { error: "Správná odpověď je povinná." } as const;
  }

  if (row.type === "vyber" || row.type === "ano-ne") {
    const canonical = getCanonicalCorrectAnswer(row);
    if (canonical) {
      return { value: canonical } as const;
    }

    if (row.type === "ano-ne") {
      return { error: "Pro typ Ano / ne zadej odpověď Ano nebo Ne." } as const;
    }

    return { error: "Správná odpověď musí být číslo možnosti nebo přesný text jedné z možností." } as const;
  }

  const minimumMatchCount = extractMinimumMatchCount(row.question);
  if (!minimumMatchCount) {
    return { value: current } as const;
  }

  const delimitedAnswers = dedupeAnswers(splitDelimitedAnswers(current));
  if (delimitedAnswers.length >= minimumMatchCount) {
    return { value: delimitedAnswers.join("\n") } as const;
  }

  if (!/[\n,;|*•]/.test(current)) {
    const whitespaceAnswers = dedupeAnswers(splitWhitespaceAnswers(current));
    if (whitespaceAnswers.length >= minimumMatchCount) {
      return { value: whitespaceAnswers.join("\n") } as const;
    }
  }

  return {
    error: `U whitelist úkolu typu „napiš aspoň ${minimumMatchCount}...” odděl položky čárkou, středníkem nebo novým řádkem a zadej aspoň ${minimumMatchCount} povolené odpovědi.`
  } as const;
}

// Používej jen v explicitní admin/save nebo maintenance cestě.
// Nikdy nevolej z runtime read pathu hry ani z běžného načtení mise.
export async function normalizeMissionTaskAnswersInDatabase(
  supabase: any,
  rows: MissionTaskAnswerRow[]
) {
  let updated = 0;

  for (const row of rows) {
    const canonical = getCanonicalCorrectAnswer(row);
    if (!canonical || canonical === row.correct_answer) {
      continue;
    }

    const { error } = await supabase
      .from("mission_tasks")
      .update({ correct_answer: canonical })
      .eq("id", row.id);

    if (error) {
      return { ok: false as const, reason: error.message, updated };
    }

    row.correct_answer = canonical;
    updated += 1;
  }

  return { ok: true as const, updated };
}
