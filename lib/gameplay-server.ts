import { getSupabaseServerClient } from "@/lib/supabase-server";
import { locations, nearbyMissions, type Episode, type MapLocation } from "@/lib/mock-data";
import { normalizeMissionTaskAnswersInDatabase } from "@/lib/mission-task-normalization";
import { getCanonicalCorrectAnswer } from "@/lib/mission-task-normalization";
import { taskAnswers } from "@/lib/task-answers";
import type { GameplayEpisode, GameplayTask } from "@/lib/gameplay-types";

type MissionStopDbRow = {
  id: string;
  mission_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  order: number;
};

type MissionTaskDbRow = {
  id: string;
  stop_id: string;
  type: "otevrena" | "vyber" | "ano-ne";
  question: string;
  correct_answer: string;
  options: unknown;
  order: number;
};

type MissionDbRow = {
  id: string;
  title: string;
  city: string;
  intro_text?: string;
  hero_image_url?: string;
  difficulty?: "lehka" | "stredni" | "tezka";
  duration_min?: number;
  points?: number;
  is_published?: boolean;
};

type DbBackedLocationSeed = {
  id: string;
  city: string;
  name: string;
  teaser: string;
  shortDescription?: string;
  unlockedByPlaceId?: string | null;
  subtitle: string;
  story: string;
  image: string;
  unlocked: boolean;
  difficulty: "Lehká" | "Střední" | "Vyšší";
  distance: string;
  duration: string;
  vibe: string[];
  lat: number;
  lng: number;
  map: {
    x: number;
    y: number;
  };
  introLabel: string;
  introStory: string;
  endingTitle: string;
  endingStory: string;
  playerMessage: string;
  interludes: string[];
};

function mapDifficultyLabel(value?: "lehka" | "stredni" | "tezka") {
  if (value === "lehka") {
    return "Lehká";
  }
  if (value === "tezka") {
    return "Vyšší";
  }
  if (value === "stredni") {
    return "Střední";
  }
  return undefined;
}

function splitParagraphs(value: string | null | undefined) {
  return (value ?? "")
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitQuestion(value: string) {
  const parts = splitParagraphs(value);
  if (parts.length === 0) {
    return { title: "Úkol", content: "" };
  }
  if (parts.length === 1) {
    return { title: parts[0], content: "" };
  }
  return { title: parts[0], content: parts.slice(1).join("\n\n") };
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function mapTaskType(type: MissionTaskDbRow["type"]): GameplayTask["type"] {
  if (type === "vyber" || type === "ano-ne") {
    return "choice";
  }
  return "question";
}

function mapTaskTypeLabel(type: MissionTaskDbRow["type"]) {
  if (type === "vyber") {
    return "Výběr";
  }
  if (type === "ano-ne") {
    return "Ano / ne";
  }
  return "Otázka";
}

function parseTaskOptions(type: MissionTaskDbRow["type"], options: unknown) {
  if (Array.isArray(options)) {
    const parsed = options.map((item) => String(item).trim()).filter(Boolean);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  if (type === "ano-ne") {
    return ["Ano", "Ne"];
  }

  return undefined;
}

function parseCorrectAnswers(value: string | null | undefined) {
  return (value ?? "")
    .split(/\n|[|,;*•]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasDigit(value: string) {
  return /\d/.test(value);
}

function splitInlineVariantAnswers(value: string) {
  return value
    .split(/[,\s]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractMinimumMatchCount(question: string) {
  const normalizedQuestion = normalize(question).replace(/\s+/g, " ");
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

function parseTaskCorrectnessRule(question: string, rawCorrectAnswer: string | null | undefined) {
  const value = rawCorrectAnswer ?? "";
  const explicitMatch = value.match(/^\s*MIN\s*(\d+)\s*:\s*(.*)$/i);
  if (explicitMatch) {
    const minCorrectMatches = Number.parseInt(explicitMatch[1], 10);
    const payload = explicitMatch[2] ?? "";
    const parsedAnswers = parseCorrectAnswers(payload);
    const fallbackAnswers = parsedAnswers.length > 0 ? parsedAnswers : splitInlineVariantAnswers(payload);
    return {
      correctAnswers: fallbackAnswers,
      minCorrectMatches: Number.isFinite(minCorrectMatches) && minCorrectMatches > 0 ? minCorrectMatches : undefined
    };
  }

  const parsedAnswers = parseCorrectAnswers(value);
  const inferredMinimum = extractMinimumMatchCount(question);
  if (inferredMinimum && parsedAnswers.length <= 1) {
    const inlineAnswers = splitInlineVariantAnswers(value);

    if (inlineAnswers.length >= inferredMinimum) {
      return {
        correctAnswers: inlineAnswers,
        minCorrectMatches: inferredMinimum
      };
    }
  }

  if (inferredMinimum && parsedAnswers.length >= inferredMinimum) {
    return {
      correctAnswers: parsedAnswers,
      minCorrectMatches: inferredMinimum
    };
  }

  if (parsedAnswers.length <= 1 && hasDigit(value)) {
    const inlineAnswers = splitInlineVariantAnswers(value);
    if (inlineAnswers.length > 1) {
      return {
        correctAnswers: inlineAnswers,
        minCorrectMatches: undefined
      };
    }
  }

  return {
    correctAnswers: parsedAnswers,
    minCorrectMatches: undefined
  };
}

function firstSentence(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const sentenceMatch = trimmed.match(/^.+?[.!?](?:\s|$)/);
  return sentenceMatch ? sentenceMatch[0].trim() : trimmed;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function getCityAnchor(city: string) {
  return (
    locations.find((item) => normalize(item.city) === normalize(city)) ??
    locations[0] ??
    null
  );
}

function buildDbBackedLocationSeed(
  mission: MissionDbRow,
  episodes: GameplayEpisode[],
  fallbackImage?: string
): DbBackedLocationSeed {
  const anchor = getCityAnchor(mission.city);
  const introStory = (mission.intro_text ?? "").trim();
  const teaserSource = firstSentence(introStory) || `${mission.city} městská mise`;
  const teaser = truncateText(teaserSource, 96);
  const image =
    mission.hero_image_url?.trim() ||
    fallbackImage?.trim() ||
    anchor?.image ||
    "/images/klamovka-chramek.jpeg";

  return {
    id: mission.id,
    city: mission.city,
    name: mission.title,
    teaser,
    shortDescription: teaser,
    unlockedByPlaceId: null,
    subtitle: "Městská mise",
    story: introStory,
    image,
    unlocked: true,
    difficulty: mapDifficultyLabel(mission.difficulty) ?? "Lehká",
    distance: mission.city,
    duration:
      typeof mission.duration_min === "number" && Number.isFinite(mission.duration_min)
        ? `${mission.duration_min} min`
        : "",
    vibe: [],
    lat: anchor?.lat ?? 50.087,
    lng: anchor?.lng ?? 14.421,
    map: anchor?.map ?? { x: 50, y: 50 },
    introLabel: "Mise",
    introStory,
    endingTitle: "Mise dokončena",
    endingStory: "Projdi všechna zastavení, posbírej stopy a zadej odpovědi přímo v aplikaci.",
    playerMessage: "Skvělá práce. Tohle je oficiální výsledek tvé mise v aplikaci.",
    interludes: []
  };
}

async function fetchPublishedMissionByCanonical(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  canonical: { city: string; missionTitle: string }
) {
  const queryWithHero = await supabase
    .from("missions")
    .select("id, title, city, intro_text, hero_image_url, difficulty, duration_min, points, is_published, created_at")
    .eq("city", canonical.city)
    .eq("title", canonical.missionTitle)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(1);

  let missionRows = queryWithHero.data as MissionDbRow[] | null;

  if (queryWithHero.error?.message?.toLowerCase().includes("hero_image_url")) {
    const queryWithoutHero = await supabase
      .from("missions")
      .select("id, title, city, intro_text, difficulty, duration_min, points, is_published, created_at")
      .eq("city", canonical.city)
      .eq("title", canonical.missionTitle)
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(1);

    missionRows = queryWithoutHero.data as MissionDbRow[] | null;
  }

  return ((missionRows ?? [])[0] as MissionDbRow | undefined) ?? null;
}

async function fetchPublishedMissionById(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  missionId: string
) {
  const queryWithHero = await supabase
    .from("missions")
    .select("id, title, city, intro_text, hero_image_url, difficulty, duration_min, points, is_published")
    .eq("id", missionId)
    .eq("is_published", true)
    .maybeSingle<MissionDbRow>();

  if (!queryWithHero.error) {
    return queryWithHero.data ?? null;
  }

  if (!queryWithHero.error.message?.toLowerCase().includes("hero_image_url")) {
    return null;
  }

  const queryWithoutHero = await supabase
    .from("missions")
    .select("id, title, city, intro_text, difficulty, duration_min, points, is_published")
    .eq("id", missionId)
    .eq("is_published", true)
    .maybeSingle<MissionDbRow>();

  return queryWithoutHero.data ?? null;
}

function getCanonicalMission(locationId: string) {
  const location = locations.find((item) => item.id === locationId) ?? null;
  const nearbyMission = nearbyMissions.find((item) => item.locationId === locationId) ?? null;
  if (!location || !nearbyMission) {
    return null;
  }

  return {
    location,
    missionTitle: nearbyMission.name,
    city: location.city
  };
}

function getLegacyEpisode(location: MapLocation, stopOrder: number) {
  return location.episodes[stopOrder - 1] ?? null;
}

function buildTaskFromDb(
  location: MapLocation | null,
  stop: MissionStopDbRow,
  task: MissionTaskDbRow
): GameplayTask {
  const legacyEpisode = location ? getLegacyEpisode(location, stop.order) : null;
  const legacyTask = legacyEpisode?.tasks[task.order - 1];
  const questionParts = splitQuestion(task.question);
  const correctnessRule = parseTaskCorrectnessRule(task.question, task.correct_answer);
  const correctAnswers = correctnessRule.correctAnswers;
  const options = parseTaskOptions(task.type, task.options);
  const legacyFallbackAnswers = legacyTask ? taskAnswers[legacyTask.id] ?? [] : [];
  const canonicalDbAnswer =
    task.type === "otevrena"
      ? null
      : getCanonicalCorrectAnswer({
          id: task.id,
          type: task.type,
          question: task.question,
          correct_answer: task.correct_answer,
          options: task.options
        });
  const canonicalLegacyFallbackAnswer =
    task.type === "otevrena" || !legacyTask
      ? null
      : getCanonicalCorrectAnswer({
          id: legacyTask.id,
          type: task.type,
          question: task.question,
          correct_answer: legacyFallbackAnswers.join("\n"),
          options
        });
  const finalCorrectAnswers =
    task.type === "otevrena"
      ? correctAnswers.length > 0
        ? correctAnswers
        : legacyFallbackAnswers
      : canonicalDbAnswer
        ? [canonicalDbAnswer]
        : canonicalLegacyFallbackAnswer
          ? [canonicalLegacyFallbackAnswer]
          : [];

  return {
    id: task.id,
    type: mapTaskType(task.type),
    typeLabel: mapTaskTypeLabel(task.type),
    title: questionParts.title,
    content: questionParts.content,
    options,
    illustrationImage: legacyTask?.illustrationImage,
    illustrationImageAlt: legacyTask?.illustrationImageAlt,
    correctAnswers: finalCorrectAnswers,
    minCorrectMatches: correctnessRule.minCorrectMatches,
    legacyTaskId: legacyTask?.id
  };
}

function buildEpisodesFromDb(
  location: MapLocation | null,
  stops: MissionStopDbRow[],
  tasks: MissionTaskDbRow[]
): GameplayEpisode[] {
  const tasksByStopId = new Map<string, MissionTaskDbRow[]>();
  tasks.forEach((task) => {
    const current = tasksByStopId.get(task.stop_id) ?? [];
    current.push(task);
    tasksByStopId.set(task.stop_id, current);
  });

  return stops.map((stop) => {
    const legacyEpisode = location ? getLegacyEpisode(location, stop.order) : null;
    const [intro = "", ...backgroundParts] = splitParagraphs(stop.description);

    return {
      id: stop.id,
      name: stop.title,
      intro: intro || legacyEpisode?.intro || "",
      background: backgroundParts.join("\n\n") || legacyEpisode?.background || "",
      illustrationImage: stop.image_url || legacyEpisode?.illustrationImage,
      illustrationImageAlt: legacyEpisode?.illustrationImageAlt,
      clue: legacyEpisode?.clue ?? [],
      tasks: (tasksByStopId.get(stop.id) ?? [])
        .sort((a, b) => a.order - b.order)
        .map((task) => buildTaskFromDb(location, stop, task))
    };
  });
}

function buildEpisodesFromMock(episodes: Episode[]): GameplayEpisode[] {
  return episodes.map((episode) => ({
    id: episode.id,
    name: episode.name,
    intro: episode.intro,
    background: episode.background,
    illustrationImage: episode.illustrationImage,
    illustrationImageAlt: episode.illustrationImageAlt,
    clue: episode.clue,
    tasks: episode.tasks.map((task) => {
      const options = task.options;
      const rawAnswers = taskAnswers[task.id] ?? [];
      const mappedType = task.type === "choice" ? "vyber" : task.type === "photo" ? "otevrena" : "otevrena";
      const canonicalChoiceAnswer =
        task.type === "choice"
          ? getCanonicalCorrectAnswer({
              id: task.id,
              type: mappedType,
              question: `${task.title}\n\n${task.content}`.trim(),
              correct_answer: rawAnswers.join("\n"),
              options
            })
          : null;

      return {
        id: task.id,
        type: task.type === "choice" ? "choice" : task.type === "photo" ? "photo" : "question",
        typeLabel: task.typeLabel,
        title: task.title,
        content: task.content,
        options,
        illustrationImage: task.illustrationImage,
        illustrationImageAlt: task.illustrationImageAlt,
        correctAnswers: task.type === "choice" ? (canonicalChoiceAnswer ? [canonicalChoiceAnswer] : []) : rawAnswers,
        minCorrectMatches: undefined,
        legacyTaskId: task.id
      };
    })
  }));
}

export async function getGameplayEpisodes(locationId: string): Promise<GameplayEpisode[] | null> {
  const canonical = getCanonicalMission(locationId);

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return null;
  }

  const mission = canonical
    ? await fetchPublishedMissionByCanonical(supabase, canonical)
    : await fetchPublishedMissionById(supabase, locationId);

  if (!mission) {
    return null;
  }
  const [{ data: stopsData, error: stopsError }, { data: tasksData, error: tasksError }] = await Promise.all([
    supabase
      .from("mission_stops")
      .select("id, mission_id, title, description, image_url, order")
      .eq("mission_id", mission.id)
      .order("order", { ascending: true }),
    supabase
      .from("mission_tasks")
      .select("id, stop_id, type, question, correct_answer, options, order")
      .in(
        "stop_id",
        (
          await supabase
            .from("mission_stops")
            .select("id")
            .eq("mission_id", mission.id)
            .order("order", { ascending: true })
        ).data?.map((row) => row.id) ?? ["00000000-0000-0000-0000-000000000000"]
      )
      .order("order", { ascending: true })
  ]);

  if (stopsError || tasksError || !stopsData?.length) {
    return null;
  }

  const normalizedTasks = ((tasksData as MissionTaskDbRow[]) ?? []).map((task) => ({ ...task }));
  await normalizeMissionTaskAnswersInDatabase(supabase, normalizedTasks).catch(() => ({
    ok: false as const,
    updated: 0
  }));

  return buildEpisodesFromDb(
    canonical?.location ?? null,
    (stopsData as MissionStopDbRow[]) ?? [],
    normalizedTasks
  );
}

export async function getPublishedLocationIds() {
  const canonicalByKey = nearbyMissions.reduce((map, mission) => {
    const location = locations.find((item) => item.id === mission.locationId);
    if (!location) {
      return map;
    }
    map.set(`${location.city.trim().toLowerCase()}::${mission.name.trim().toLowerCase()}`, mission.locationId);
    return map;
  }, new Map<string, string>());

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return nearbyMissions.map((mission) => mission.locationId);
  }

  const { data, error } = await supabase
    .from("missions")
    .select("id, title, city, is_published")
    .eq("is_published", true);

  if (error || !data) {
    return nearbyMissions.map((mission) => mission.locationId);
  }

  const ids = new Set<string>();
  data.forEach((mission) => {
    const locationId = canonicalByKey.get(
      `${String(mission.city).trim().toLowerCase()}::${String(mission.title).trim().toLowerCase()}`
    );
    ids.add(locationId ?? String((mission as { id?: string }).id ?? ""));
  });

  return Array.from(ids).filter(Boolean);
}

export async function getGameplayLocation(locationId: string) {
  const location = locations.find((item) => item.id === locationId) ?? null;
  const canonical = getCanonicalMission(locationId);
  if (canonical) {
    const publishedLocationIds = await getPublishedLocationIds();
    if (!publishedLocationIds.includes(locationId)) {
      return null;
    }
  }

  let mission: MissionDbRow | null = null;
  if (canonical || !location) {
    try {
      const supabase = getSupabaseServerClient();
      mission = canonical
        ? await fetchPublishedMissionByCanonical(supabase, canonical)
        : await fetchPublishedMissionById(supabase, locationId);
    } catch {
      mission = null;
    }
  }

  const episodes = await getGameplayEpisodes(locationId);
  if (!location) {
    if (!mission || !episodes) {
      return null;
    }

    const fallbackImage = episodes.find((episode) => episode.illustrationImage)?.illustrationImage;
    return {
      ...buildDbBackedLocationSeed(mission, episodes, fallbackImage),
      episodes
    };
  }

  return {
    ...location,
    subtitle: mission?.title ?? location.subtitle,
    introStory: mission?.intro_text ?? location.introStory,
    story: mission?.intro_text ? "" : location.story,
    image: mission?.hero_image_url?.trim() ? mission.hero_image_url : location.image,
    duration:
      typeof mission?.duration_min === "number" && Number.isFinite(mission.duration_min)
        ? `${mission.duration_min} min`
        : location.duration,
    difficulty: mapDifficultyLabel(mission?.difficulty) ?? location.difficulty,
    episodes: episodes ?? buildEpisodesFromMock(location.episodes)
  };
}

export async function getGameplayTask(locationId: string, taskId: string) {
  const canonical = getCanonicalMission(locationId);
  if (canonical) {
    const publishedLocationIds = await getPublishedLocationIds();
    if (!publishedLocationIds.includes(locationId)) {
      return null;
    }
  }

  const episodes = await getGameplayEpisodes(locationId);
  const sourceEpisodes = episodes ?? buildEpisodesFromMock(locations.find((item) => item.id === locationId)?.episodes ?? []);

  for (const episode of sourceEpisodes) {
    const found = episode.tasks.find((task) => task.id === taskId);
    if (found) {
      return found;
    }
  }

  return null;
}

export async function getGameplayTaskIds(locationId: string) {
  const canonical = getCanonicalMission(locationId);
  if (canonical) {
    const publishedLocationIds = await getPublishedLocationIds();
    if (!publishedLocationIds.includes(locationId)) {
      return [];
    }
  }

  const episodes = await getGameplayEpisodes(locationId);
  const sourceEpisodes = episodes ?? buildEpisodesFromMock(locations.find((item) => item.id === locationId)?.episodes ?? []);
  return sourceEpisodes.flatMap((episode) => episode.tasks.map((task) => task.id));
}
