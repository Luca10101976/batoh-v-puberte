export type MissionDifficulty = "lehka" | "stredni" | "tezka";
export type MissionTaskType = "otevrena" | "vyber" | "ano-ne";

export type MissionRow = {
  id: string;
  title: string;
  city: string;
  intro_text: string;
  hero_image_url?: string | null;
  difficulty: MissionDifficulty;
  duration_min: number;
  points: number;
  is_published: boolean;
  created_at: string;
};

export type MissionStopRow = {
  id: string;
  mission_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  order: number;
};

export type MissionTaskRow = {
  id: string;
  stop_id: string;
  type: MissionTaskType;
  question: string;
  correct_answer: string;
  options: unknown;
  order: number;
};

export type FormState = {
  error: string | null;
  success: string | null;
  fieldErrors?: Record<string, string>;
};

export const EMPTY_FORM_STATE: FormState = {
  error: null,
  success: null
};
