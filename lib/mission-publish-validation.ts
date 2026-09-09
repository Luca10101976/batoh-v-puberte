// R25: kontrola hratelnosti hry před publikací.
//
// Publikace byla dosud pouhé přepnutí příznaku. Nekontrolovala, jestli má hra
// zastávky, úkoly ani jestli mají vyplněné odpovědi. Proto by dnes šlo jedním
// kliknutím zveřejnit hru, kterou nelze dohrát – například Budějovice, kde má
// všech třináct úkolů prázdnou správnou odpověď.
//
// Pravidla jsou čistá a testovatelná; načítání dat dělá volající.

export type PublishTaskInput = {
  id: string;
  stopTitle: string;
  taskOrder: number;
  type: string;
  question: string;
  correctAnswer: string;
  options: unknown;
  minCorrectMatches?: number | null;
};

export type PublishStopInput = {
  id: string;
  title: string;
  order: number;
  tasks: PublishTaskInput[];
};

export type PublishIssue = {
  /** Strojový kód problému, ať se dá později lokalizovat nebo testovat. */
  code:
    | "no_stops"
    | "no_tasks"
    | "stop_without_tasks"
    | "missing_answer"
    | "missing_question"
    | "choice_without_options"
    | "choice_answer_not_in_options"
    | "invalid_min_matches";
  /** Věta pro autora, konkrétní a bez technického žargonu. */
  message: string;
  stopTitle?: string;
  taskOrder?: number;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Uznávané odpovědi = řádky nebo běžné oddělovače. Stejné dělení jako herní vrstva. */
export function splitAcceptedAnswers(value: string | null | undefined) {
  return (value ?? "")
    .split(/\n|[|,;*•]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptions(options: unknown) {
  if (Array.isArray(options)) {
    return options.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof options === "string") {
    try {
      const parsed = JSON.parse(options);
      return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function describeTask(stopTitle: string, taskOrder: number) {
  return `Zastávka „${stopTitle}“, úkol ${taskOrder}`;
}

/**
 * Vrátí seznam konkrétních důvodů, proč hru nelze publikovat.
 * Prázdný seznam znamená, že je hra hratelná.
 */
export function findPublishBlockers(stops: PublishStopInput[]): PublishIssue[] {
  const issues: PublishIssue[] = [];

  if (stops.length === 0) {
    issues.push({ code: "no_stops", message: "Hra nemá žádnou zastávku." });
    return issues;
  }

  const totalTasks = stops.reduce((sum, stop) => sum + stop.tasks.length, 0);
  if (totalTasks === 0) {
    issues.push({ code: "no_tasks", message: "Hra nemá žádný úkol." });
    return issues;
  }

  stops.forEach((stop) => {
    if (stop.tasks.length === 0) {
      issues.push({
        code: "stop_without_tasks",
        message: `Zastávka „${stop.title}“ nemá žádný úkol.`,
        stopTitle: stop.title
      });
    }

    stop.tasks.forEach((task) => {
      const where = describeTask(stop.title, task.taskOrder);

      if (!task.question.trim()) {
        issues.push({
          code: "missing_question",
          message: `${where}: chybí zadání.`,
          stopTitle: stop.title,
          taskOrder: task.taskOrder
        });
      }

      const answers = splitAcceptedAnswers(task.correctAnswer);
      if (answers.length === 0) {
        issues.push({
          code: "missing_answer",
          message: `${where}: chybí správná odpověď, takže úkol nejde vyřešit.`,
          stopTitle: stop.title,
          taskOrder: task.taskOrder
        });
      }

      if (task.type === "vyber" || task.type === "ano-ne") {
        const options = parseOptions(task.options);
        if (options.length < 2) {
          issues.push({
            code: "choice_without_options",
            message: `${where}: výběr z možností potřebuje aspoň dvě možnosti.`,
            stopTitle: stop.title,
            taskOrder: task.taskOrder
          });
        } else if (answers.length > 0) {
          const normalizedOptions = options.map(normalize);
          const everyAnswerIsAnOption = answers.every((answer) => normalizedOptions.includes(normalize(answer)));
          if (!everyAnswerIsAnOption) {
            issues.push({
              code: "choice_answer_not_in_options",
              message: `${where}: správná odpověď není mezi nabízenými možnostmi.`,
              stopTitle: stop.title,
              taskOrder: task.taskOrder
            });
          }
        }
      }

      const min = task.minCorrectMatches;
      if (typeof min === "number" && Number.isFinite(min)) {
        if (min < 1 || (answers.length > 0 && min > answers.length)) {
          issues.push({
            code: "invalid_min_matches",
            message: `${where}: „pro splnění stačí ${min}“ nedává smysl, uznávaných odpovědí je ${answers.length}.`,
            stopTitle: stop.title,
            taskOrder: task.taskOrder
          });
        }
      }
    });
  });

  return issues;
}
