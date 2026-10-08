// R54: průchod hrou v Mozku – pořadí obrazovek tak, jak je uvidí hráč.
// Úvod → u každého zastavení jeho úkoly (první s příchodem na místo) →
// přechod na další zastavení → … → závěr. Modul je čistý, aby šel otestovat.

export type WalkthroughStep =
  | { kind: "intro" }
  | { kind: "task"; stopIndex: number; taskIndex: number; firstOfStop: boolean }
  | { kind: "empty-stop"; stopIndex: number }
  | { kind: "transition"; fromStopIndex: number; toStopIndex: number }
  | { kind: "ending" };

export function buildWalkthroughSteps(stops: ReadonlyArray<{ tasks: ReadonlyArray<unknown> }>): WalkthroughStep[] {
  const steps: WalkthroughStep[] = [{ kind: "intro" }];
  stops.forEach((stop, stopIndex) => {
    if (stop.tasks.length === 0) {
      // Hráč by tu uvízl – publikace to nepustí, náhled to ale musí ukázat.
      steps.push({ kind: "empty-stop", stopIndex });
    } else {
      stop.tasks.forEach((_, taskIndex) => steps.push({ kind: "task", stopIndex, taskIndex, firstOfStop: taskIndex === 0 }));
    }
    if (stopIndex < stops.length - 1) {
      steps.push({ kind: "transition", fromStopIndex: stopIndex, toStopIndex: stopIndex + 1 });
    }
  });
  steps.push({ kind: "ending" });
  return steps;
}

export function describeStep(
  step: WalkthroughStep,
  stops: Array<{ name: string; tasks: Array<{ title: string }> }>
): string {
  switch (step.kind) {
    case "intro":
      return "Úvod hry";
    case "task":
      return `${stops[step.stopIndex].name} · ${step.taskIndex + 1}. ${stops[step.stopIndex].tasks[step.taskIndex].title}`;
    case "empty-stop":
      return `${stops[step.stopIndex].name} · bez úkolu`;
    case "transition":
      return `Přechod → ${stops[step.toStopIndex].name}`;
    case "ending":
      return "Závěr hry";
  }
}
