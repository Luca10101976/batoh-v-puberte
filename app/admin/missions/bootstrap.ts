import { locations, nearbyMissions } from "@/lib/mock-data";
import { getCanonicalCorrectAnswer } from "@/lib/mission-task-normalization";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { taskAnswers } from "@/lib/task-answers";

function mapDifficulty(value: string): "lehka" | "stredni" | "tezka" {
  if (value === "Lehká") {
    return "lehka";
  }
  if (value === "Vyšší") {
    return "tezka";
  }
  return "stredni";
}

function parseDurationMinutes(value: string) {
  const numbers = value.match(/\d+/g) ?? [];
  if (numbers.length === 0) {
    return 45;
  }

  const parsed = numbers.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  if (parsed.length === 0) {
    return 45;
  }

  return Math.max(...parsed);
}

function parseMissionPoints(locationId: string) {
  const nearby = nearbyMissions.find((mission) => mission.locationId === locationId);
  const pointsMatch = nearby?.boost.match(/\d+/);
  return pointsMatch ? Number(pointsMatch[0]) : 120;
}

function mapTaskType(value: string): "otevrena" | "vyber" | "ano-ne" {
  if (value === "choice") {
    return "vyber";
  }
  return "otevrena";
}

function buildCanonicalTaskAnswer(taskType: "otevrena" | "vyber" | "ano-ne", question: string, rawAnswer: string, options: string[]) {
  if (taskType === "vyber" || taskType === "ano-ne") {
    return (
      getCanonicalCorrectAnswer({
        id: "",
        type: taskType,
        question,
        correct_answer: rawAnswer,
        options
      }) ?? rawAnswer
    );
  }

  return rawAnswer;
}

function buildLegacyAnswerRows() {
  return locations.flatMap((location) =>
    location.episodes.flatMap((episode, episodeIndex) =>
      episode.tasks.map((task, taskIndex) => ({
        city: location.city,
        missionTitle: nearbyMissions.find((mission) => mission.locationId === location.id)?.name ?? location.name,
        stopOrder: episodeIndex + 1,
        taskOrder: taskIndex + 1,
        correctAnswer: buildCanonicalTaskAnswer(
          mapTaskType(task.type),
          `${task.title}\n\n${task.content}`.trim(),
          (taskAnswers[task.id] ?? []).join("\n"),
          Array.isArray(task.options) ? task.options : []
        )
      }))
    )
  );
}

export async function syncExistingTaskAnswers() {
  const supabase = getSupabaseServerClient();
  const legacyRows = buildLegacyAnswerRows().filter((row) => row.correctAnswer);

  if (legacyRows.length === 0) {
    return { ok: true as const, updated: 0 };
  }

  const missionTitles = Array.from(new Set(legacyRows.map((row) => row.missionTitle)));
  const { data: missions, error: missionsError } = await supabase
    .from("missions")
    .select("id, title, city")
    .in("title", missionTitles);

  if (missionsError) {
    return { ok: false as const, reason: missionsError.message };
  }

  const missionIds = (missions ?? []).map((mission) => mission.id as string);
  if (missionIds.length === 0) {
    return { ok: true as const, updated: 0 };
  }

  const { data: stops, error: stopsError } = await supabase
    .from("mission_stops")
    .select("id, mission_id, order")
    .in("mission_id", missionIds);

  if (stopsError) {
    return { ok: false as const, reason: stopsError.message };
  }

  const stopIds = (stops ?? []).map((stop) => stop.id as string);
  if (stopIds.length === 0) {
    return { ok: true as const, updated: 0 };
  }

  const { data: tasks, error: tasksError } = await supabase
    .from("mission_tasks")
    .select("id, stop_id, order, correct_answer")
    .in("stop_id", stopIds);

  if (tasksError) {
    return { ok: false as const, reason: tasksError.message };
  }

  const missionByKey = new Map<string, string>();
  (missions ?? []).forEach((mission) => {
    missionByKey.set(`${String(mission.city).trim().toLowerCase()}::${String(mission.title).trim().toLowerCase()}`, String(mission.id));
  });

  const stopByMissionAndOrder = new Map<string, string>();
  (stops ?? []).forEach((stop) => {
    stopByMissionAndOrder.set(`${String(stop.mission_id)}::${Number(stop.order)}`, String(stop.id));
  });

  const taskByStopAndOrder = new Map<string, { id: string; correct_answer: string }>();
  (tasks ?? []).forEach((task) => {
    taskByStopAndOrder.set(`${String(task.stop_id)}::${Number(task.order)}`, {
      id: String(task.id),
      correct_answer: String(task.correct_answer ?? "")
    });
  });

  let updated = 0;
  for (const row of legacyRows) {
    const missionId = missionByKey.get(`${row.city.trim().toLowerCase()}::${row.missionTitle.trim().toLowerCase()}`);
    if (!missionId) {
      continue;
    }

    const stopId = stopByMissionAndOrder.get(`${missionId}::${row.stopOrder}`);
    if (!stopId) {
      continue;
    }

    const task = taskByStopAndOrder.get(`${stopId}::${row.taskOrder}`);
    if (!task || task.correct_answer.trim()) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("mission_tasks")
      .update({ correct_answer: row.correctAnswer })
      .eq("id", task.id);

    if (updateError) {
      return { ok: false as const, reason: updateError.message };
    }

    updated += 1;
  }

  return { ok: true as const, updated };
}

export async function bootstrapMozekContent() {
  const supabase = getSupabaseServerClient();

  const { count: existingMissionCount, error: existingMissionError } = await supabase
    .from("missions")
    .select("id", { count: "exact", head: true });

  if (existingMissionError) {
    return { ok: false as const, reason: existingMissionError.message };
  }

  if ((existingMissionCount ?? 0) > 0) {
    return { ok: true as const, alreadyReady: true as const };
  }

  const missionRows = locations.map((location) => {
    const nearby = nearbyMissions.find((mission) => mission.locationId === location.id);
    return {
      title: nearby?.name ?? location.name,
      city: location.city,
      intro_text: location.introStory || location.story || location.teaser,
      hero_image_url: location.image,
      difficulty: mapDifficulty(location.difficulty),
      duration_min: parseDurationMinutes(location.duration),
      points: parseMissionPoints(location.id),
      is_published: true
    };
  });

  let missionInsert = await supabase.from("missions").insert(missionRows).select("id, city, title");

  if (missionInsert.error?.message?.toLowerCase().includes("hero_image_url")) {
    missionInsert = await supabase
      .from("missions")
      .insert(
        missionRows.map(({ hero_image_url, ...mission }) => mission)
      )
      .select("id, city, title");
  }

  const { data: insertedMissions, error: missionInsertError } = missionInsert;

  if (missionInsertError || !insertedMissions?.length) {
    return { ok: false as const, reason: missionInsertError?.message ?? "Nepodařilo se vytvořit mise." };
  }

  const missionIdByLocationId = new Map<string, string>();
  locations.forEach((location) => {
    const nearby = nearbyMissions.find((mission) => mission.locationId === location.id);
    const matchingMission = insertedMissions.find(
      (mission) => mission.city === location.city && mission.title === (nearby?.name ?? location.name)
    );

    if (matchingMission?.id) {
      missionIdByLocationId.set(location.id, matchingMission.id);
    }
  });

  const stopRows = locations.flatMap((location) => {
    const missionId = missionIdByLocationId.get(location.id);
    if (!missionId) {
      return [];
    }

    return location.episodes.map((episode, index) => ({
      locationId: location.id,
      episodeId: episode.id,
      mission_id: missionId,
      title: episode.name,
      description: [episode.intro, episode.background].filter(Boolean).join("\n\n"),
      image_url: episode.illustrationImage || location.image,
      order: index + 1
    }));
  });

  const { data: insertedStops, error: stopInsertError } = await supabase
    .from("mission_stops")
    .insert(
      stopRows.map(({ mission_id, title, description, image_url, order }) => ({
        mission_id,
        title,
        description,
        image_url,
        order
      }))
    )
    .select("id, mission_id, title, order");

  if (stopInsertError || !insertedStops) {
    return { ok: false as const, reason: stopInsertError?.message ?? "Nepodařilo se vytvořit zastavení." };
  }

  const stopIdByKey = new Map<string, string>();
  stopRows.forEach((row) => {
    const matchingStop = insertedStops.find(
      (stop) => stop.mission_id === row.mission_id && stop.title === row.title && stop.order === row.order
    );

    if (matchingStop?.id) {
      stopIdByKey.set(`${row.locationId}:${row.episodeId}`, matchingStop.id);
    }
  });

  const taskRows = locations.flatMap((location) =>
    location.episodes.flatMap((episode) => {
      const stopId = stopIdByKey.get(`${location.id}:${episode.id}`);
      if (!stopId) {
        return [];
      }

      return episode.tasks.map((task, index) => ({
        type: mapTaskType(task.type),
        question: `${task.title}\n\n${task.content}`.trim(),
        rawAnswer: (taskAnswers[task.id] ?? []).join("\n"),
        options: Array.isArray(task.options) ? task.options : [],
        stop_id: stopId,
        order: index + 1
      })).map((row) => ({
        stop_id: row.stop_id,
        type: row.type,
        question: row.question,
        correct_answer: buildCanonicalTaskAnswer(row.type, row.question, row.rawAnswer, row.options),
        options: row.options,
        order: row.order
      }));
    })
  );

  if (taskRows.length > 0) {
    const { error: taskInsertError } = await supabase.from("mission_tasks").insert(taskRows);
    if (taskInsertError) {
      return { ok: false as const, reason: taskInsertError.message };
    }
  }

  return { ok: true as const, alreadyReady: false as const };
}
