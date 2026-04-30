"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EMPTY_FORM_STATE, FormState, MissionTaskType } from "@/app/admin/types";
import { validateAndCanonicalizeCorrectAnswer } from "@/lib/mission-task-normalization";
import { deleteMissionImageByPath, getMissionImageStoragePath, uploadMissionImage, validateMissionImageFile } from "@/lib/mission-images";
import { getSupabaseServerClient } from "@/lib/supabase-server";

function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNonNegativeInt(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor(parsed));
}

const TASK_TYPES = new Set<MissionTaskType>(["otevrena", "vyber", "ano-ne"]);

function parseTaskOptions(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildStoredTaskOptions(type: MissionTaskType, options: string[]) {
  if (type === "ano-ne") {
    return ["Ano", "Ne"];
  }
  return options;
}

function rethrowIfRedirectError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }
}

export async function createStopAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const missionId = normalizeText(formData.get("mission_id"));
  const title = normalizeText(formData.get("title"));
  const description = normalizeText(formData.get("description"));
  const imageUrl = normalizeText(formData.get("image_url"));
  const imageFileValue = formData.get("image_file");
  const orderRaw = normalizeText(formData.get("order"));
  const order = parseNonNegativeInt(orderRaw);

  const fieldErrors: Record<string, string> = {};
  if (!missionId) fieldErrors.mission_id = "Chybí missionId.";
  if (!title) fieldErrors.title = "Název zastavení je povinný.";
  if (order === null) fieldErrors.order = "Pořadí musí být číslo.";

  let imageFile: File | null = null;
  try {
    imageFile = validateMissionImageFile(imageFileValue);
  } catch (error: any) {
    fieldErrors.image_file = String(error?.message || error);
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ...EMPTY_FORM_STATE, error: "Zkontroluj formulář.", fieldErrors };
  }

  const stopId = crypto.randomUUID();
  let uploadedPath: string | null = null;

  try {
    const supabase = getSupabaseServerClient();
    let resolvedImageUrl = imageUrl;

    if (imageFile) {
      const uploaded = await uploadMissionImage({
        supabase,
        missionId,
        stopId,
        file: imageFile
      });
      uploadedPath = uploaded.path;
      resolvedImageUrl = uploaded.publicUrl;
    }

    const { error } = await supabase.from("mission_stops").insert({
      id: stopId,
      mission_id: missionId,
      title,
      description,
      image_url: resolvedImageUrl,
      order
    });

    if (error) {
      if (uploadedPath) {
        await deleteMissionImageByPath(supabase, uploadedPath).catch(() => undefined);
      }
      return { ...EMPTY_FORM_STATE, error: `Vytvoření zastavení selhalo: ${error.message}` };
    }
  } catch (error: any) {
    rethrowIfRedirectError(error);
    return { ...EMPTY_FORM_STATE, error: `Vytvoření zastavení selhalo: ${String(error?.message || error)}` };
  }

  revalidatePath(`/mozek/missions/${missionId}`);
  return { ...EMPTY_FORM_STATE, success: "Zastavení bylo vytvořené." };
}

export async function updateStopAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const stopId = normalizeText(formData.get("stop_id"));
  const missionId = normalizeText(formData.get("mission_id"));
  const title = normalizeText(formData.get("title"));
  const description = normalizeText(formData.get("description"));
  const imageUrl = normalizeText(formData.get("image_url"));
  const existingImageUrl = normalizeText(formData.get("existing_image_url"));
  const imageFileValue = formData.get("image_file");
  const orderRaw = normalizeText(formData.get("order"));
  const order = parseNonNegativeInt(orderRaw);
  const intent = normalizeText(formData.get("intent"));

  const fieldErrors: Record<string, string> = {};
  if (!stopId) fieldErrors.stop_id = "Chybí stop_id.";
  if (!missionId) fieldErrors.mission_id = "Chybí mission_id.";
  if (intent !== "delete_image") {
    if (!title) fieldErrors.title = "Název zastavení je povinný.";
    if (order === null) fieldErrors.order = "Pořadí musí být číslo.";
  }

  let imageFile: File | null = null;
  try {
    imageFile = validateMissionImageFile(imageFileValue);
  } catch (error: any) {
    fieldErrors.image_file = String(error?.message || error);
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ...EMPTY_FORM_STATE, error: "Zkontroluj formulář.", fieldErrors };
  }

  try {
    const supabase = getSupabaseServerClient();
    const existingStoragePath = getMissionImageStoragePath(existingImageUrl);

    if (intent === "delete_image") {
      const { error } = await supabase
        .from("mission_stops")
        .update({ image_url: "" })
        .eq("id", stopId)
        .eq("mission_id", missionId);

      if (error) {
        return { ...EMPTY_FORM_STATE, error: `Smazání fotky selhalo: ${error.message}` };
      }

      if (existingStoragePath) {
        await deleteMissionImageByPath(supabase, existingStoragePath);
      }
    } else {
      let resolvedImageUrl = imageUrl;
      let uploadedPath: string | null = null;

      if (imageFile) {
        const uploaded = await uploadMissionImage({
          supabase,
          missionId,
          stopId,
          file: imageFile
        });
        uploadedPath = uploaded.path;
        resolvedImageUrl = uploaded.publicUrl;
      }

      const { error } = await supabase
        .from("mission_stops")
        .update({
          title,
          description,
          image_url: resolvedImageUrl,
          order
        })
        .eq("id", stopId)
        .eq("mission_id", missionId);

      if (error) {
        if (uploadedPath) {
          await deleteMissionImageByPath(supabase, uploadedPath).catch(() => undefined);
        }
        return { ...EMPTY_FORM_STATE, error: `Uložení zastavení selhalo: ${error.message}` };
      }

      if (imageFile && existingStoragePath && resolvedImageUrl !== existingImageUrl) {
        await deleteMissionImageByPath(supabase, existingStoragePath).catch(() => undefined);
      }
    }
  } catch (error: any) {
    rethrowIfRedirectError(error);
    return {
      ...EMPTY_FORM_STATE,
      error:
        intent === "delete_image"
          ? `Smazání fotky selhalo: ${String(error?.message || error)}`
          : `Uložení zastavení selhalo: ${String(error?.message || error)}`
    };
  }

  revalidatePath(`/mozek/stops/${stopId}`);
  revalidatePath(`/mozek/missions/${missionId}`);
  return {
    ...EMPTY_FORM_STATE,
    success: intent === "delete_image" ? "Fotografie byla smazaná." : "Zastavení bylo uložené."
  };
}

export async function createTaskAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const stopId = normalizeText(formData.get("stop_id"));
  const missionId = normalizeText(formData.get("mission_id"));
  const type = normalizeText(formData.get("type")) as MissionTaskType;
  const question = normalizeText(formData.get("question"));
  const correctAnswer = normalizeText(formData.get("correct_answer"));
  const optionsRaw = normalizeText(formData.get("options"));
  const orderRaw = normalizeText(formData.get("order"));
  const order = parseNonNegativeInt(orderRaw);
  const options = parseTaskOptions(optionsRaw);
  const storedOptions = buildStoredTaskOptions(type, options);

  const fieldErrors: Record<string, string> = {};
  if (!stopId) fieldErrors.stop_id = "Chybí stop_id.";
  if (!missionId) fieldErrors.mission_id = "Chybí mission_id.";
  if (!TASK_TYPES.has(type)) fieldErrors.type = "Vyber platný typ úkolu.";
  if (!question) fieldErrors.question = "Zadání úkolu je povinné.";
  if (!correctAnswer) fieldErrors.correct_answer = "Správná odpověď je povinná.";
  if (order === null) fieldErrors.order = "Pořadí musí být číslo.";
  if (type === "vyber" && options.length < 2) fieldErrors.options = "Pro výběr zadej aspoň 2 možnosti.";
  const resolvedCorrectAnswer =
    TASK_TYPES.has(type) && correctAnswer
      ? validateAndCanonicalizeCorrectAnswer({
          id: "new-task",
          type,
          question,
          correct_answer: correctAnswer,
          options: storedOptions
        })
      : { value: correctAnswer };
  if ("error" in resolvedCorrectAnswer && !fieldErrors.correct_answer) {
    fieldErrors.correct_answer = resolvedCorrectAnswer.error;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ...EMPTY_FORM_STATE, error: "Zkontroluj formulář úkolu.", fieldErrors };
  }

  const storedCorrectAnswer = "value" in resolvedCorrectAnswer ? resolvedCorrectAnswer.value : correctAnswer;

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("mission_tasks").insert({
      stop_id: stopId,
      type,
      question,
      correct_answer: storedCorrectAnswer,
      options: storedOptions,
      order
    });

    if (error) {
      return { ...EMPTY_FORM_STATE, error: `Vytvoření úkolu selhalo: ${error.message}` };
    }
  } catch (error: any) {
    rethrowIfRedirectError(error);
    return { ...EMPTY_FORM_STATE, error: `Vytvoření úkolu selhalo: ${String(error?.message || error)}` };
  }

  revalidatePath(`/mozek/stops/${stopId}`);
  revalidatePath(`/mozek/missions/${missionId}`);
  return { ...EMPTY_FORM_STATE, success: "Úkol byl přidaný." };
}

export async function updateTaskAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const taskId = normalizeText(formData.get("task_id"));
  const stopId = normalizeText(formData.get("stop_id"));
  const missionId = normalizeText(formData.get("mission_id"));
  const type = normalizeText(formData.get("type")) as MissionTaskType;
  const question = normalizeText(formData.get("question"));
  const correctAnswer = normalizeText(formData.get("correct_answer"));
  const optionsRaw = normalizeText(formData.get("options"));
  const orderRaw = normalizeText(formData.get("order"));
  const order = parseNonNegativeInt(orderRaw);
  const options = parseTaskOptions(optionsRaw);
  const storedOptions = buildStoredTaskOptions(type, options);

  const fieldErrors: Record<string, string> = {};
  if (!taskId) fieldErrors.task_id = "Chybí task_id.";
  if (!stopId) fieldErrors.stop_id = "Chybí stop_id.";
  if (!missionId) fieldErrors.mission_id = "Chybí mission_id.";
  if (!TASK_TYPES.has(type)) fieldErrors.type = "Vyber platný typ úkolu.";
  if (!question) fieldErrors.question = "Zadání úkolu je povinné.";
  if (!correctAnswer) fieldErrors.correct_answer = "Správná odpověď je povinná.";
  if (order === null) fieldErrors.order = "Pořadí musí být číslo.";
  if (type === "vyber" && options.length < 2) fieldErrors.options = "Pro výběr zadej aspoň 2 možnosti.";
  const resolvedCorrectAnswer =
    TASK_TYPES.has(type) && correctAnswer
      ? validateAndCanonicalizeCorrectAnswer({
          id: taskId || "existing-task",
          type,
          question,
          correct_answer: correctAnswer,
          options: storedOptions
        })
      : { value: correctAnswer };
  if ("error" in resolvedCorrectAnswer && !fieldErrors.correct_answer) {
    fieldErrors.correct_answer = resolvedCorrectAnswer.error;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ...EMPTY_FORM_STATE, error: "Zkontroluj formulář úkolu.", fieldErrors };
  }

  const storedCorrectAnswer = "value" in resolvedCorrectAnswer ? resolvedCorrectAnswer.value : correctAnswer;

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("mission_tasks")
      .update({
        type,
        question,
        correct_answer: storedCorrectAnswer,
        options: storedOptions,
        order
      })
      .eq("id", taskId)
      .eq("stop_id", stopId);

    if (error) {
      return { ...EMPTY_FORM_STATE, error: `Uložení úkolu selhalo: ${error.message}` };
    }
  } catch (error: any) {
    rethrowIfRedirectError(error);
    return { ...EMPTY_FORM_STATE, error: `Uložení úkolu selhalo: ${String(error?.message || error)}` };
  }

  revalidatePath(`/mozek/stops/${stopId}`);
  revalidatePath(`/mozek/missions/${missionId}`);
  return { ...EMPTY_FORM_STATE, success: "Úkol byl uložený." };
}

export async function deleteTaskAction(formData: FormData) {
  const taskId = normalizeText(formData.get("task_id"));
  const stopId = normalizeText(formData.get("stop_id"));
  const missionId = normalizeText(formData.get("mission_id"));

  if (!taskId || !stopId || !missionId) {
    redirect("/mozek?status=error");
  }

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("mission_tasks").delete().eq("id", taskId).eq("stop_id", stopId);

    if (error) {
      redirect(`/mozek/stops/${stopId}?status=error`);
    }
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/mozek/stops/${stopId}?status=error`);
  }

  revalidatePath(`/mozek/stops/${stopId}`);
  revalidatePath(`/mozek/missions/${missionId}`);
  redirect(`/mozek/stops/${stopId}?status=task_deleted`);
}
