// R25: kontrola hratelnosti hry před publikací.
//
// Publikace byla dosud pouhé přepnutí příznaku. Nekontrolovala, jestli má hra
// zastávky, úkoly ani jestli mají vyplněné odpovědi. Proto by dnes šlo jedním
// kliknutím zveřejnit hru, kterou nelze dohrát – například Budějovice, kde má
// všech třináct úkolů prázdnou správnou odpověď.
//
// Pravidla jsou čistá a testovatelná; načítání dat dělá volající.

import { getCanonicalCorrectAnswer } from "./mission-task-normalization.ts";

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
    | "invalid_min_matches"
    // R37: kontroly na úrovni celé hry, ne jednotlivého úkolu.
    | "missing_hero_image"
    | "missing_ending"
    | "duplicate_stop_order"
    | "duplicate_task_order"
    | "invalid_unlock"
    | "missing_city";
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
        } else if (task.correctAnswer.trim()) {
          // R45: u výběru je správná odpověď JEDNA celá nabízená možnost, takže
          // čárka uvnitř textu možnosti není oddělovač. Dřív se odpověď dělila
          // stejně jako u otevřených úkolů, a možnost jako „Vlci, medvědi, kůň
          // a brazilský ptáček" se rozpadla na kusy, které mezi možnostmi nejsou.
          // Používá se přímo tatáž funkce, podle které správnou odpověď určuje
          // herní logika – aby validace a hraní nemohly říkat něco jiného.
          const canonical = getCanonicalCorrectAnswer({
            id: task.id,
            type: task.type as "otevrena" | "vyber" | "ano-ne",
            question: task.question,
            correct_answer: task.correctAnswer,
            options: task.options
          });
          if (!canonical) {
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


// ---------------------------------------------------------------------------
// R37: kontroly celé hry
// ---------------------------------------------------------------------------
//
// Koncept smí být jakkoli nehotový. Publikovaná hra musí být dohratelná a
// zobrazitelná, proto se kromě úkolů kontroluje i to, co uvidí hráč kolem nich:
// titulní obrázek v katalogu, závěrečná obrazovka, jednoznačné pořadí a platná
// návaznost „nejdřív dohraj".

export type PublishMissionInput = {
  id: string;
  title: string;
  city: string;
  heroImageUrl: string | null | undefined;
  endingTitle: string | null | undefined;
  endingText: string | null | undefined;
  unlockAfterMissionId: string | null | undefined;
};

export type PublishCatalogMission = {
  id: string;
  title: string;
  city: string;
  isPublished: boolean;
};

function duplicates(values: number[]) {
  const seen = new Set<number>();
  const repeated = new Set<number>();
  for (const value of values) {
    if (seen.has(value)) {
      repeated.add(value);
    }
    seen.add(value);
  }
  return [...repeated];
}

export function findMissionPublishBlockers(args: {
  mission: PublishMissionInput;
  stops: PublishStopInput[];
  /** Ostatní hry v katalogu – kvůli kontrole návaznosti. */
  catalog?: PublishCatalogMission[];
}): PublishIssue[] {
  const { mission, stops, catalog = [] } = args;
  const issues: PublishIssue[] = [...findPublishBlockers(stops)];

  if (!(mission.city ?? "").trim()) {
    issues.push({ code: "missing_city", message: "Hra nemá město, takže by se v katalogu neobjevila." });
  }

  if (!(mission.heroImageUrl ?? "").trim()) {
    issues.push({
      code: "missing_hero_image",
      message: "Hra nemá titulní obrázek, se kterým se ukazuje v katalogu."
    });
  }

  const hasEnding = Boolean((mission.endingTitle ?? "").trim()) && Boolean((mission.endingText ?? "").trim());
  if (!hasEnding) {
    issues.push({
      code: "missing_ending",
      message: "Hra nemá závěr (titulek a text), který hráč uvidí po dohrání."
    });
  }

  for (const order of duplicates(stops.map((stop) => stop.order))) {
    issues.push({
      code: "duplicate_stop_order",
      message: `Dvě zastávky mají stejné pořadí (${order}), takže by se hra nedala projít v daném sledu.`
    });
  }

  stops.forEach((stop) => {
    for (const order of duplicates(stop.tasks.map((task) => task.taskOrder))) {
      issues.push({
        code: "duplicate_task_order",
        message: `Zastávka „${stop.title}": dva úkoly mají stejné pořadí (${order}).`,
        stopTitle: stop.title
      });
    }
  });

  const unlockId = (mission.unlockAfterMissionId ?? "").trim();
  if (unlockId) {
    const target = catalog.find((entry) => entry.id === unlockId);
    if (!target) {
      issues.push({
        code: "invalid_unlock",
        message: "Hra se má odemykat po jiné hře, ale ta v katalogu není."
      });
    } else if (target.id === mission.id) {
      issues.push({
        code: "invalid_unlock",
        message: "Hra se nemůže odemykat sama po sobě."
      });
    } else if (!target.isPublished) {
      issues.push({
        code: "invalid_unlock",
        message: `Hra se má odemykat po hře „${target.title}", ta ale zatím není publikovaná, takže by zůstala trvale zamčená.`
      });
    } else if (target.city.trim() !== mission.city.trim()) {
      issues.push({
        code: "invalid_unlock",
        message: `Hra se má odemykat po hře „${target.title}" z jiného města, což hráč nemá jak splnit.`
      });
    }
  }

  return issues;
}
