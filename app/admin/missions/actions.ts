"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { EMPTY_FORM_STATE, FormState, MissionDifficulty } from "@/app/admin/types";
import { bootstrapMozekContent } from "@/app/admin/missions/bootstrap";
import {
  deleteMissionImageByPath,
  getMissionImageStoragePath,
  uploadMissionHeroImage,
  validateMissionImageFile
} from "@/lib/mission-images";

const DIFFICULTIES = new Set<MissionDifficulty>(["lehka", "stredni", "tezka"]);

function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveInt(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor(parsed));
}

function parseMission(formData: FormData) {
  const title = normalizeText(formData.get("title"));
  const city = normalizeText(formData.get("city"));
  const introText = normalizeText(formData.get("intro_text"));
  const difficultyRaw = normalizeText(formData.get("difficulty")) as MissionDifficulty;
  const durationRaw = normalizeText(formData.get("duration_min"));
  const pointsRaw = normalizeText(formData.get("points"));
  const isPublished = formData.get("is_published") === "on";

  const duration = parsePositiveInt(durationRaw);
  const points = parsePositiveInt(pointsRaw);

  const fieldErrors: Record<string, string> = {};
  if (!title) fieldErrors.title = "Název mise je povinný.";
  if (!city) fieldErrors.city = "Město je povinné.";
  if (!introText) fieldErrors.intro_text = "Úvodní text je povinný.";
  if (!DIFFICULTIES.has(difficultyRaw)) fieldErrors.difficulty = "Vyber platnou obtížnost.";
  if (duration === null) fieldErrors.duration_min = "Délka musí být číslo.";
  if (points === null) fieldErrors.points = "Body musí být číslo.";

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      title,
      city,
      intro_text: introText,
      difficulty: difficultyRaw,
      duration_min: duration,
      points,
      is_published: isPublished
    }
  };
}

function isMissingHeroImageColumnError(error: { message?: string } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes("hero_image_url"));
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

export async function createMissionAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseMission(formData);
  if ("fieldErrors" in parsed) {
    return { ...EMPTY_FORM_STATE, error: "Zkontroluj formulář.", fieldErrors: parsed.fieldErrors };
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("missions").insert(parsed.data).select("id").single<{ id: string }>();

    if (error) {
      return { ...EMPTY_FORM_STATE, error: `Uložení mise selhalo: ${error.message}` };
    }

    if (!data?.id) {
      return { ...EMPTY_FORM_STATE, error: "Mise byla vytvořena, ale nepodařilo se získat její ID." };
    }

    revalidatePath("/mozek");
    redirect(`/mozek/missions/${data.id}?status=created`);
  } catch (error: any) {
    rethrowIfRedirectError(error);
    return { ...EMPTY_FORM_STATE, error: `Uložení mise selhalo: ${String(error?.message || error)}` };
  }
}

export async function updateMissionAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const missionId = normalizeText(formData.get("mission_id"));
  if (!missionId) {
    return { ...EMPTY_FORM_STATE, error: "Chybí ID mise." };
  }

  const parsed = parseMission(formData);
  if ("fieldErrors" in parsed) {
    return { ...EMPTY_FORM_STATE, error: "Zkontroluj formulář.", fieldErrors: parsed.fieldErrors };
  }

  const imageUrl = normalizeText(formData.get("hero_image_url"));
  const existingImageUrl = normalizeText(formData.get("existing_hero_image_url"));
  const imageFileValue = formData.get("hero_image_file");
  const intent = normalizeText(formData.get("intent"));
  const fieldErrors: Record<string, string> = {};

  let imageFile: File | null = null;
  try {
    imageFile = validateMissionImageFile(imageFileValue);
  } catch (error: any) {
    fieldErrors.hero_image_file = String(error?.message || error);
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ...EMPTY_FORM_STATE, error: "Zkontroluj formulář.", fieldErrors };
  }

  try {
    const supabase = getSupabaseServerClient();
    const existingStoragePath = getMissionImageStoragePath(existingImageUrl);

    if (intent === "delete_hero_image") {
      const { error } = await supabase.from("missions").update({ hero_image_url: "" }).eq("id", missionId);

      if (error) {
        if (isMissingHeroImageColumnError(error)) {
          return { ...EMPTY_FORM_STATE, error: "V databázi ještě chybí migrace pro hlavní fotku mise." };
        }
        return { ...EMPTY_FORM_STATE, error: `Smazání fotky mise selhalo: ${error.message}` };
      }

      if (existingStoragePath) {
        await deleteMissionImageByPath(supabase, existingStoragePath).catch(() => undefined);
      }
    } else {
      let resolvedImageUrl = imageUrl;
      let uploadedPath: string | null = null;

      if (imageFile) {
        const uploaded = await uploadMissionHeroImage({
          supabase,
          missionId,
          file: imageFile
        });
        uploadedPath = uploaded.path;
        resolvedImageUrl = uploaded.publicUrl;
      }

      const wantsHeroImageChange = Boolean(imageFile) || resolvedImageUrl !== existingImageUrl;
      const { error } = await supabase
        .from("missions")
        .update({
          ...parsed.data,
          hero_image_url: resolvedImageUrl
        })
        .eq("id", missionId);

      if (error) {
        if (uploadedPath) {
          await deleteMissionImageByPath(supabase, uploadedPath).catch(() => undefined);
        }
        if (isMissingHeroImageColumnError(error)) {
          if (!wantsHeroImageChange) {
            const { error: fallbackError } = await supabase.from("missions").update(parsed.data).eq("id", missionId);
            if (fallbackError) {
              return { ...EMPTY_FORM_STATE, error: `Aktualizace mise selhala: ${fallbackError.message}` };
            }
          } else {
            return { ...EMPTY_FORM_STATE, error: "V databázi ještě chybí migrace pro hlavní fotku mise." };
          }
        } else {
          return { ...EMPTY_FORM_STATE, error: `Aktualizace mise selhala: ${error.message}` };
        }
      } else if (imageFile && existingStoragePath && resolvedImageUrl !== existingImageUrl) {
        await deleteMissionImageByPath(supabase, existingStoragePath).catch(() => undefined);
      }
    }
  } catch (error: any) {
    rethrowIfRedirectError(error);
    return {
      ...EMPTY_FORM_STATE,
      error:
        intent === "delete_hero_image"
          ? `Smazání fotky mise selhalo: ${String(error?.message || error)}`
          : `Aktualizace mise selhala: ${String(error?.message || error)}`
    };
  }

  revalidatePath("/mozek");
  revalidatePath(`/mozek/missions/${missionId}`);
  return { ...EMPTY_FORM_STATE, success: "Mise byla uložená." };
}

export async function toggleMissionPublishAction(formData: FormData) {
  const missionId = normalizeText(formData.get("mission_id"));
  const nextPublished = formData.get("next_published") === "true";

  if (!missionId) {
    redirect("/mozek?status=error");
  }

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("missions").update({ is_published: nextPublished }).eq("id", missionId);

    if (error) {
      redirect("/mozek?status=error");
    }
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect("/mozek?status=error");
  }

  revalidatePath("/mozek");
  revalidatePath(`/mozek/missions/${missionId}`);
  redirect(`/mozek/missions/${missionId}?status=${nextPublished ? "published" : "unpublished"}`);
}

export async function deleteMissionAction(formData: FormData) {
  const missionId = normalizeText(formData.get("mission_id"));
  if (!missionId) {
    redirect("/mozek?status=error");
  }

  try {
    const supabase = getSupabaseServerClient();

    const { data: stopIdsRows, error: stopsError } = await supabase
      .from("mission_stops")
      .select("id")
      .eq("mission_id", missionId);

    if (stopsError) {
      redirect("/mozek?status=error");
    }

    const stopIds = (stopIdsRows ?? []).map((row) => row.id as string);
    if (stopIds.length > 0) {
      const { error: tasksError } = await supabase.from("mission_tasks").delete().in("stop_id", stopIds);
      if (tasksError) {
        redirect("/mozek?status=error");
      }
    }

    const { error: deleteStopsError } = await supabase.from("mission_stops").delete().eq("mission_id", missionId);
    if (deleteStopsError) {
      redirect("/mozek?status=error");
    }

    const { error: deleteMissionError } = await supabase.from("missions").delete().eq("id", missionId);
    if (deleteMissionError) {
      redirect("/mozek?status=error");
    }
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect("/mozek?status=error");
  }

  revalidatePath("/mozek");
  redirect("/mozek?status=deleted");
}

export async function createStopAction(formData: FormData) {
  const missionId = normalizeText(formData.get("mission_id"));
  if (!missionId) {
    redirect("/mozek?status=error");
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data: lastStop } = await supabase
      .from("mission_stops")
      .select("order")
      .eq("mission_id", missionId)
      .order("order", { ascending: false })
      .limit(1)
      .maybeSingle<{ order: number }>();

    const nextOrder = (lastStop?.order ?? 0) + 1;
    const { data: inserted, error } = await supabase
      .from("mission_stops")
      .insert({
        mission_id: missionId,
        title: `Zastavení ${nextOrder}`,
        description: "",
        image_url: "",
        order: nextOrder
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !inserted?.id) {
      redirect(`/mozek/missions/${missionId}?status=error`);
    }

    revalidatePath(`/mozek/missions/${missionId}`);
    redirect(`/mozek/stops/${inserted.id}?status=created`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/mozek/missions/${missionId}?status=error`);
  }
}

export async function deleteStopAction(formData: FormData) {
  const missionId = normalizeText(formData.get("mission_id"));
  const stopId = normalizeText(formData.get("stop_id"));
  if (!missionId || !stopId) {
    redirect("/mozek?status=error");
  }

  try {
    const supabase = getSupabaseServerClient();
    const { error: tasksError } = await supabase.from("mission_tasks").delete().eq("stop_id", stopId);
    if (tasksError) {
      redirect(`/mozek/missions/${missionId}?status=error`);
    }

    const { error: stopError } = await supabase.from("mission_stops").delete().eq("id", stopId);
    if (stopError) {
      redirect(`/mozek/missions/${missionId}?status=error`);
    }
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/mozek/missions/${missionId}?status=error`);
  }

  revalidatePath(`/mozek/missions/${missionId}`);
  redirect(`/mozek/missions/${missionId}?status=stop_deleted`);
}

export async function enableMozekEditingAction() {
  const result = await bootstrapMozekContent();

  if (!result.ok) {
    redirect("/mozek?status=import_failed");
  }

  revalidatePath("/mozek");
  redirect(`/mozek?status=${result.alreadyReady ? "already_ready" : "import_enabled"}`);
}
