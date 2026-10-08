"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EMPTY_FORM_STATE, FormState } from "@/app/admin/types";
import {
  deleteMissionImageByPath,
  getMissionImageStoragePath,
  uploadMissionCharacterImage,
  validateMissionImageFile
} from "@/lib/mission-images";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// R51: postavy hry. Patří ke konkrétní hře a mluví v bublinách při příchodu
// na zastavení. Jméno je povinné, obrázek ne – bez něj se v bublině ukáže jen jméno.

const MAX_NAME = 60;

function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
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

/** Založí novou postavu (bez character_id) nebo upraví existující. */
export async function saveCharacterAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const missionId = normalizeText(formData.get("mission_id"));
  const existingId = normalizeText(formData.get("character_id"));
  const name = normalizeText(formData.get("name"));
  const imageUrl = normalizeText(formData.get("image_url"));
  const existingImageUrl = normalizeText(formData.get("existing_image_url"));

  const fieldErrors: Record<string, string> = {};
  if (!missionId) fieldErrors.mission_id = "Chybí hra.";
  if (!name) fieldErrors.name = "Napiš jméno postavy.";
  else if (name.length > MAX_NAME) fieldErrors.name = `Jméno může mít nejvýš ${MAX_NAME} znaků.`;

  let imageFile: File | null = null;
  try {
    imageFile = validateMissionImageFile(formData.get("image_file"));
  } catch (error: any) {
    fieldErrors.image_file = String(error?.message || error);
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ...EMPTY_FORM_STATE, error: "Zkontroluj formulář.", fieldErrors };
  }

  const characterId = existingId || crypto.randomUUID();
  let uploadedPath: string | null = null;

  try {
    const supabase = getSupabaseServerClient();
    let resolvedImageUrl = imageUrl || existingImageUrl || null;

    if (imageFile) {
      const uploaded = await uploadMissionCharacterImage({ supabase, missionId, characterId, file: imageFile });
      uploadedPath = uploaded.path;
      resolvedImageUrl = uploaded.publicUrl;
    }

    const { error } = existingId
      ? await supabase
          .from("mission_characters")
          .update({ name, image_url: resolvedImageUrl })
          .eq("id", existingId)
          .eq("mission_id", missionId)
      : await supabase
          .from("mission_characters")
          .insert({ id: characterId, mission_id: missionId, name, image_url: resolvedImageUrl });

    if (error) {
      if (uploadedPath) await deleteMissionImageByPath(supabase, uploadedPath).catch(() => undefined);
      return { ...EMPTY_FORM_STATE, error: `Uložení postavy selhalo: ${error.message}` };
    }

    // Nahrazený obrázek po sobě uklidit, ať nezůstávají osiřelé soubory.
    const staraCesta = getMissionImageStoragePath(existingImageUrl);
    if (imageFile && staraCesta && resolvedImageUrl !== existingImageUrl) {
      await deleteMissionImageByPath(supabase, staraCesta).catch(() => undefined);
    }
  } catch (error: any) {
    rethrowIfRedirectError(error);
    return { ...EMPTY_FORM_STATE, error: `Uložení postavy selhalo: ${String(error?.message || error)}` };
  }

  revalidatePath(`/mozek/missions/${missionId}`);
  return { ...EMPTY_FORM_STATE, success: existingId ? "Postava byla uložená." : "Postava byla přidaná." };
}

/**
 * Smazání postavy. Když v některém zastavení mluví, smazání se zastaví a řekne
 * kde – bublina by jinak potichu přišla o mluvčího.
 */
export async function deleteCharacterAction(formData: FormData) {
  const missionId = normalizeText(formData.get("mission_id"));
  const characterId = normalizeText(formData.get("character_id"));
  if (!missionId || !characterId) {
    redirect("/mozek?status=error");
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data: pouzito } = await supabase
      .from("mission_stops")
      .select("title")
      .eq("mission_id", missionId)
      .eq("bubble_character_id", characterId);
    const zastaveni = ((pouzito as Array<{ title: string }> | null) ?? []).map((row) => `„${row.title}“`);
    if (zastaveni.length > 0) {
      const duvod = `Postava mluví v bublině u zastavení ${zastaveni.join(", ")}. Nejdřív tam bublinu změň nebo vymaž.`;
      redirect(`/mozek/missions/${missionId}?status=delete_blocked&issues=${encodeURIComponent(duvod)}`);
    }

    const { data: postava } = await supabase
      .from("mission_characters")
      .select("image_url")
      .eq("id", characterId)
      .eq("mission_id", missionId)
      .maybeSingle<{ image_url: string | null }>();

    const { error } = await supabase.from("mission_characters").delete().eq("id", characterId).eq("mission_id", missionId);
    if (error) {
      redirect(`/mozek/missions/${missionId}?status=error`);
    }

    const cesta = getMissionImageStoragePath(postava?.image_url);
    if (cesta) await deleteMissionImageByPath(supabase, cesta).catch(() => undefined);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/mozek/missions/${missionId}?status=error`);
  }

  revalidatePath(`/mozek/missions/${missionId}`);
  redirect(`/mozek/missions/${missionId}?status=character_deleted`);
}
