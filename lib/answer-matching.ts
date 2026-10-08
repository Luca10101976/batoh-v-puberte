// R25: rozhodnutí, jestli je odpověď správná.
//
// Pravidlo je jedno a je celé v datech úkolu:
//   - uznávané odpovědi = seznam u úkolu,
//   - minCorrectMatches = kolik jich stačí (prázdné = musí sedět celá odpověď).
//
// Dřív se počet potřebných shod hádal z formulace zadání („alespoň N", „aspoň N"),
// z prefixu „MIN n:" v odpovědi a z výjimky napsané natvrdo pro jeden úkol Klamovky.
// Autor tak nikdy neviděl, podle čeho se jeho úkol vyhodnocuje.
//
// Modul je čistý, aby šel testovat bez databáze.

export type AnswerRule = {
  type?: string;
  correctAnswers?: string[];
  minCorrectMatches?: number;
};

/** R46: položky pořadí. Čárka nedělí – může být uvnitř názvu položky. */
export function splitOrderedLines(value: string) {
  return String(value ?? "")
    .split(/\n|[|;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function splitToNormalizedWords(value: string) {
  return normalizeAnswer(value)
    .split(/[^a-z0-9]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildAcceptedWordSet(acceptedAnswers: string[]) {
  const acceptedWords = new Set<string>();

  acceptedAnswers.forEach((value) => {
    const normalizedValue = normalizeAnswer(value);
    if (normalizedValue) {
      acceptedWords.add(normalizedValue);
    }

    splitToNormalizedWords(value).forEach((word) => {
      acceptedWords.add(word);
    });
  });

  return acceptedWords;
}

export function isTaskAnswerCorrect(task: AnswerRule | null | undefined, answer: string) {
  const acceptedAnswers = task?.correctAnswers ?? [];
  const minimumMatches = task?.type === "question" ? task.minCorrectMatches : undefined;

  if (minimumMatches && minimumMatches > 0) {
    const acceptedSet = buildAcceptedWordSet(acceptedAnswers);
    if (acceptedSet.size === 0) {
      return false;
    }

    const uniqueWords = Array.from(new Set(splitToNormalizedWords(answer)));
    const matchedWords = uniqueWords.filter((word) => acceptedSet.has(word));
    return matchedWords.length >= minimumMatches;
  }

  // R46: u seřazení se neporovnává text jako celek, ale posloupnost položek.
  // Hráč posílá své pořadí po řádcích; musí sedět položka po položce.
  if (task?.type === "order") {
    const spravne = splitOrderedLines(acceptedAnswers[0] ?? "");
    const hracovo = splitOrderedLines(answer);
    if (spravne.length === 0 || spravne.length !== hracovo.length) {
      return false;
    }
    return spravne.every((item, index) => normalizeAnswer(item) === normalizeAnswer(hracovo[index]));
  }

  const normalizedInput = normalizeAnswer(answer);
  if (!normalizedInput) {
    return false;
  }

  return acceptedAnswers.some((value) => normalizeAnswer(value) === normalizedInput);
}
