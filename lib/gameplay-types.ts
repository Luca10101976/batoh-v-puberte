export type GameplayTaskType = "question" | "photo" | "choice";

export type GameplayTask = {
  id: string;
  type: GameplayTaskType;
  typeLabel: string;
  title: string;
  content: string;
  options?: string[];
  illustrationImage?: string;
  illustrationImageAlt?: string;
  correctAnswers: string[];
  minCorrectMatches?: number;
  legacyTaskId?: string;
};

export type GameplayEpisode = {
  id: string;
  name: string;
  intro: string;
  background: string;
  illustrationImage?: string;
  illustrationImageAlt?: string;
  tasks: GameplayTask[];
  clue: string[];
};
