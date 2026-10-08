"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EMPTY_FORM_STATE, FormState } from "@/app/admin/types";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// R52: bubliny postav. Jedna tabulka pro zastavení, úkoly i závěr hry.
// Mluvčí: postava hry, nebo Traki (prázdná volba = NULL v databázi).

const MAX_TEXT = 1000;
type TargetType = "stop" | "task" | "ending";

function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

/** Návrat jen do Mozku – nikam jinam (žádný otevřený redirect). */
function safeReturnTo(value: string, fallback: string) {
  return /^\/mozek\/[a-z0-9/_-]*$/i.test(value) ? value : fallback;
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

/** Ověří, že zastavení/úkol patří k dané hře. Cizí ID z formuláře nesmí projít. */
async function targetBelongsToMission(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  missionId: string,
  targetType: TargetType,
  stopId: string,
  taskId: string
) {
  if (targetType === "ending") return true;
  if (targetType === "stop") {
    const { data } = await supabase.from("mission_stops").select("id").eq("id", stopId).eq("mission_id", missionId).maybeSingle();
    return Boolean(data);
  }
  const { data } = await supabase
    .from("mission_tasks")
    .select("id, mission_stops!inner(mission_id)")
    .eq("id", taskId)
    .eq("mission_stops.mission_id", missionId)
    .maybeSingle();
  return Boolean(data);
}

export async function saveBubbleAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const missionId = normalizeText(formData.get("mission_id"));
  const bubbleId = normalizeText(formData.get("bubble_id"));
  const targetType = normalizeText(formData.get("target_type")) as TargetType;
  const stopId = normalizeText(formData.get("stop_id"));
  const taskId = normalizeText(formData.get("task_id"));
  const characterId = normalizeText(formData.get("character_id"));
  const text = normalizeText(formData.get("text"));

  const fieldErrors: Record<string, string> = {};
  if (!missionId) fieldErrors.mission_id = "Chybí hra.";
  if (!["stop", "task", "ending"].includes(targetType)) fieldErrors.target_type = "Neznámé umístění bubliny.";
  if (!text) fieldErrors.text = "Napiš, co postava říká.";
  else if (text.length > MAX_TEXT) fieldErrors.text = `Bublina může mít nejvýš ${MAX_TEXT} znaků.`;
  if (Object.keys(fieldErrors).length > 0) {
    return { ...EMPTY_FORM_STATE, error: "Zkontroluj bublinu.", fieldErrors };
  }

  try {
    const supabase = getSupabaseServerClient();
    if (!(await targetBelongsToMission(supabase, missionId, targetType, stopId, taskId))) {
      return { ...EMPTY_FORM_STATE, error: "Zastavení nebo úkol nepatří k téhle hře." };
    }

    const payload = {
      character_id: characterId || null,
      text
    };

    if (bubbleId) {
      const { error } = await supabase.from("mission_bubbles").update(payload).eq("id", bubbleId).eq("mission_id", missionId);
      if (error) return { ...EMPTY_FORM_STATE, error: `Uložení bubliny selhalo: ${error.message}` };
    } else {
      let query = supabase.from("mission_bubbles").select("order").eq("mission_id", missionId).eq("target_type", targetType);
      if (targetType === "stop") query = query.eq("stop_id", stopId);
      if (targetType === "task") query = query.eq("task_id", taskId);
      const { data: last } = await query.order("order", { ascending: false }).limit(1).maybeSingle<{ order: number }>();
      const { error } = await supabase.from("mission_bubbles").insert({
        mission_id: missionId,
        target_type: targetType,
        stop_id: targetType === "stop" ? stopId : null,
        task_id: targetType === "task" ? taskId : null,
        order: (last?.order ?? 0) + 1,
        ...payload
      });
      if (error) return { ...EMPTY_FORM_STATE, error: `Přidání bubliny selhalo: ${error.message}` };
    }
  } catch (error: any) {
    rethrowIfRedirectError(error);
    return { ...EMPTY_FORM_STATE, error: `Uložení bubliny selhalo: ${String(error?.message || error)}` };
  }

  revalidatePath(`/mozek/missions/${missionId}`);
  if (stopId) revalidatePath(`/mozek/stops/${stopId}`);
  return { ...EMPTY_FORM_STATE, success: bubbleId ? "Bublina byla uložená." : "Bublina byla přidaná." };
}

export async function deleteBubbleAction(formData: FormData) {
  const missionId = normalizeText(formData.get("mission_id"));
  const bubbleId = normalizeText(formData.get("bubble_id"));
  const returnTo = safeReturnTo(normalizeText(formData.get("return_to")), `/mozek/missions/${missionId}`);
  if (!missionId || !bubbleId) redirect("/mozek?status=error");

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("mission_bubbles").delete().eq("id", bubbleId).eq("mission_id", missionId);
    if (error) redirect(`${returnTo}?status=error`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`${returnTo}?status=error`);
  }
  revalidatePath(returnTo);
  redirect(`${returnTo}?status=bubble_deleted`);
}

/** Posun o jedno místo v rámci téhož zastavení / úkolu / závěru. */
export async function moveBubbleAction(formData: FormData) {
  const missionId = normalizeText(formData.get("mission_id"));
  const bubbleId = normalizeText(formData.get("bubble_id"));
  const direction = normalizeText(formData.get("direction"));
  const returnTo = safeReturnTo(normalizeText(formData.get("return_to")), `/mozek/missions/${missionId}`);
  if (!missionId || !bubbleId || !["up", "down"].includes(direction)) redirect("/mozek?status=error");

  try {
    const supabase = getSupabaseServerClient();
    const { data: current } = await supabase
      .from("mission_bubbles")
      .select("id, target_type, stop_id, task_id, order")
      .eq("id", bubbleId)
      .eq("mission_id", missionId)
      .maybeSingle<{ id: string; target_type: TargetType; stop_id: string | null; task_id: string | null; order: number }>();
    if (!current) redirect(`${returnTo}?status=error`);

    let siblings = supabase.from("mission_bubbles").select("id, order").eq("mission_id", missionId).eq("target_type", current.target_type);
    if (current.stop_id) siblings = siblings.eq("stop_id", current.stop_id);
    if (current.task_id) siblings = siblings.eq("task_id", current.task_id);
    const { data: rows } = await siblings.order("order", { ascending: true });
    const list = (rows as Array<{ id: string; order: number }> | null) ?? [];
    const index = list.findIndex((row) => row.id === bubbleId);
    const swapWith = direction === "up" ? list[index - 1] : list[index + 1];
    if (!swapWith) redirect(`${returnTo}?status=reorder_edge`);

    // Pořadí se přepíše podle pozice v seznamu, takže ani případné duplicity nevadí.
    const reordered = [...list];
    [reordered[index], reordered[list.indexOf(swapWith)]] = [reordered[list.indexOf(swapWith)], reordered[index]];
    for (const [position, row] of reordered.entries()) {
      await supabase.from("mission_bubbles").update({ order: position + 1 }).eq("id", row.id).eq("mission_id", missionId);
    }
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`${returnTo}?status=error`);
  }
  revalidatePath(returnTo);
  redirect(`${returnTo}?status=reordered`);
}
