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
  /** R25: autorský závěr hry. */
  ending_title?: string | null;
  ending_text?: string | null;
  ending_player_message?: string | null;
  created_at: string;
};

export type MissionStopRow = {
  id: string;
  mission_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  order: number;
  /** R26: autorský text po dokončení téhle zastávky. Prázdný = obecný text. */
  transition_text?: string | null;
};

export type MissionTaskRow = {
  id: string;
  stop_id: string;
  type: MissionTaskType;
  question: string;
  correct_answer: string;
  options: unknown;
  order: number;
  /** R25: autorská nápověda; prázdná = hráč tlačítko neuvidí. */
  hint_text?: string | null;
  /** R25: kolik uznávaných odpovědí stačí ke splnění. */
  min_correct_matches?: number | null;
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
