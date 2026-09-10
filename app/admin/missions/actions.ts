"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EMPTY_FORM_STATE, FormState, MissionDifficulty } from "@/app/admin/types";
import {
  findMissionPublishBlockers,
  type PublishTaskInput,
  type PublishIssue
} from "@/lib/mission-publish-validation";
import { getMissionUsage } from "@/lib/mission-usage-server";
import { guardMissionDelete, guardReorder } from "@/lib/mission-usage";
import { getSupabaseServerClient } from "@/lib/supabase-server";
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

function isMissingHeroImageColumnError(error: { message?: string } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes("hero_image_url"));
}

/**
 * R37: formulář hry už neobsahuje zaškrtávátko „Publikovat". Publikace má jedinou
 * cestu (toggleMissionPublishAction), která vždy spustí kontrolu hratelnosti.
 * Uložení hry proto nikdy nesahá na is_published.
 */
async function parseMission(formData: FormData) {
  const title = normalizeText(formData.get("title"));
  const cityId = normalizeText(formData.get("city_id"));
  const introText = normalizeText(formData.get("intro_text"));
  const shortDescription = normalizeText(formData.get("short_description"));
  const difficultyRaw = normalizeText(formData.get("difficulty")) as MissionDifficulty;
  const duration = parsePositiveInt(normalizeText(formData.get("duration_min")));
  const catalogOrder = parsePositiveInt(normalizeText(formData.get("catalog_order")));
  const unlockAfter = normalizeText(formData.get("unlock_after_mission_id"));
  const endingTitle = normalizeText(formData.get("ending_title"));
  const endingText = normalizeText(formData.get("ending_text"));
  const endingPlayerMessage = normalizeText(formData.get("ending_player_message"));

  const fieldErrors: Record<string, string> = {};
  if (!title) fieldErrors.title = "Název hry je povinný.";
  if (!cityId) fieldErrors.city_id = "Vyber město.";
  if (!introText) fieldErrors.intro_text = "Úvodní text je povinný.";
  if (!DIFFICULTIES.has(difficultyRaw)) fieldErrors.difficulty = "Vyber platnou obtížnost.";
  if (duration === null) fieldErrors.duration_min = "Délka musí být číslo.";
  if (catalogOrder === null) fieldErrors.catalog_order = "Pořadí musí být číslo.";

  let cityName = "";
  if (cityId) {
    const supabase = getSupabaseServerClient();
    const { data: city } = await supabase
      .from("cities")
      .select("id, name, is_active")
      .eq("id", cityId)
      .maybeSingle<{ id: string; name: string; is_active: boolean }>();
    if (!city) {
      fieldErrors.city_id = "Tohle město už neexistuje.";
    } else {
      cityName = city.name;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      title,
      city: cityName,
      city_id: cityId,
      intro_text: introText,
      short_description: shortDescription,
      difficulty: difficultyRaw,
      duration_min: duration as number,
      catalog_order: catalogOrder as number,
      unlock_after_mission_id: unlockAfter || null,
      ending_title: endingTitle,
      ending_text: endingText,
      ending_player_message: endingPlayerMessage
    }
  };
}

export async function createMissionAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = await parseMission(formData);
  if ("fieldErrors" in parsed) {
    return { ...EMPTY_FORM_STATE, error: "Zkontroluj formulář.", fieldErrors: parsed.fieldErrors };
  }

  try {
    const supabase = getSupabaseServerClient();
    // Nová hra vzniká vždy jako koncept.
    const { data, error } = await supabase
      .from("missions")
      .insert({ ...parsed.data, is_published: false })
      .select("id")
      .single<{ id: string }>();

    if (error) {
      return { ...EMPTY_FORM_STATE, error: `Uložení hry selhalo: ${error.message}` };
    }
    if (!data?.id) {
      return { ...EMPTY_FORM_STATE, error: "Hra byla vytvořena, ale nepodařilo se získat její ID." };
    }

    revalidatePath("/mozek");
    redirect(`/mozek/missions/${data.id}?status=created`);
  } catch (error: any) {
    rethrowIfRedirectError(error);
    return { ...EMPTY_FORM_STATE, error: `Uložení hry selhalo: ${String(error?.message || error)}` };
  }
}

export async function updateMissionAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const missionId = normalizeText(formData.get("mission_id"));
  if (!missionId) {
    return { ...EMPTY_FORM_STATE, error: "Chybí ID hry." };
  }

  const parsed = await parseMission(formData);
  if ("fieldErrors" in parsed) {
    return { ...EMPTY_FORM_STATE, error: "Zkontroluj formulář.", fieldErrors: parsed.fieldErrors };
  }

  const imageUrl = normalizeText(formData.get("hero_image_url"));
  const existingImageUrl = normalizeText(formData.get("existing_hero_image_url"));
  const imageFileValue = formData.get("hero_image_file");
  const intent = normalizeText(formData.get("intent"));

  let imageFile: File | null = null;
  try {
    imageFile = validateMissionImageFile(imageFileValue);
  } catch (error: any) {
    return {
      ...EMPTY_FORM_STATE,
      error: "Zkontroluj formulář.",
      fieldErrors: { hero_image_file: String(error?.message || error) }
    };
  }

  try {
    const supabase = getSupabaseServerClient();
    const existingStoragePath = getMissionImageStoragePath(existingImageUrl);

    if (intent === "delete_hero_image") {
      const { error } = await supabase.from("missions").update({ hero_image_url: "" }).eq("id", missionId);
      if (error) {
        if (isMissingHeroImageColumnError(error)) {
          return { ...EMPTY_FORM_STATE, error: "V databázi ještě chybí migrace pro titulní obrázek hry." };
        }
        return { ...EMPTY_FORM_STATE, error: `Smazání obrázku selhalo: ${error.message}` };
      }
      if (existingStoragePath) {
        await deleteMissionImageByPath(supabase, existingStoragePath).catch(() => undefined);
      }
    } else {
      let resolvedImageUrl = imageUrl;
      let uploadedPath: string | null = null;

      if (imageFile) {
        const uploaded = await uploadMissionHeroImage({ supabase, missionId, file: imageFile });
        uploadedPath = uploaded.path;
        resolvedImageUrl = uploaded.publicUrl;
      }

      const { error } = await supabase
        .from("missions")
        .update({ ...parsed.data, hero_image_url: resolvedImageUrl })
        .eq("id", missionId);

      if (error) {
        if (uploadedPath) {
          await deleteMissionImageByPath(supabase, uploadedPath).catch(() => undefined);
        }
        return { ...EMPTY_FORM_STATE, error: `Uložení hry selhalo: ${error.message}` };
      }

      if (imageFile && existingStoragePath && resolvedImageUrl !== existingImageUrl) {
        await deleteMissionImageByPath(supabase, existingStoragePath).catch(() => undefined);
      }
    }
  } catch (error: any) {
    rethrowIfRedirectError(error);
    return { ...EMPTY_FORM_STATE, error: `Uložení hry selhalo: ${String(error?.message || error)}` };
  }

  revalidatePath("/mozek");
  revalidatePath(`/mozek/missions/${missionId}`);
  revalidatePath("/");
  return { ...EMPTY_FORM_STATE, success: "Hra byla uložená." };
}

/**
 * R25 + R37: hra se nesmí publikovat, dokud ji nejde dohrát a zobrazit. Kontrola
 * je serverová a je součástí jediné publikační cesty, takže ji nejde obejít.
 */
async function collectPublishBlockers(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  missionId: string
): Promise<PublishIssue[]> {
  const { data: mission, error: missionError } = await supabase
    .from("missions")
    .select("id, title, city, hero_image_url, ending_title, ending_text, unlock_after_mission_id")
    .eq("id", missionId)
    .maybeSingle<{
      id: string;
      title: string;
      city: string;
      hero_image_url: string | null;
      ending_title: string | null;
      ending_text: string | null;
      unlock_after_mission_id: string | null;
    }>();
  if (missionError || !mission) {
    return [{ code: "no_stops", message: "Hru se nepodařilo načíst, zkus to prosím znovu." }];
  }

  const { data: stopRows, error: stopsError } = await supabase
    .from("mission_stops")
    .select("id, title, order")
    .eq("mission_id", missionId)
    .order("order", { ascending: true });
  if (stopsError) {
    return [{ code: "no_stops", message: "Zastávky hry se nepodařilo načíst, zkus to prosím znovu." }];
  }

  const stops = stopRows ?? [];
  const stopIds = stops.map((stop) => stop.id);

  const { data: taskRows, error: tasksError } = await supabase
    .from("mission_tasks")
    .select("id, stop_id, type, question, correct_answer, options, order, min_correct_matches")
    .in("stop_id", stopIds.length > 0 ? stopIds : ["00000000-0000-0000-0000-000000000000"]);
  if (tasksError) {
    return [{ code: "no_tasks", message: "Úkoly hry se nepodařilo načíst, zkus to prosím znovu." }];
  }

  const { data: catalogRows } = await supabase.from("missions").select("id, title, city, is_published");

  const byStop = new Map<string, PublishTaskInput[]>();
  (taskRows ?? []).forEach((task: any) => {
    const stop = stops.find((item) => item.id === task.stop_id);
    const list = byStop.get(String(task.stop_id)) ?? [];
    list.push({
      id: String(task.id),
      stopTitle: String(stop?.title ?? ""),
      taskOrder: Number(task.order ?? 0),
      type: String(task.type ?? ""),
      question: String(task.question ?? ""),
      correctAnswer: String(task.correct_answer ?? ""),
      options: task.options,
      minCorrectMatches: (task.min_correct_matches as number | null | undefined) ?? null
    });
    byStop.set(String(task.stop_id), list);
  });

  return findMissionPublishBlockers({
    mission: {
      id: mission.id,
      title: mission.title,
      city: mission.city,
      heroImageUrl: mission.hero_image_url,
      endingTitle: mission.ending_title,
      endingText: mission.ending_text,
      unlockAfterMissionId: mission.unlock_after_mission_id
    },
    stops: stops.map((stop) => ({
      id: stop.id,
      title: stop.title,
      order: stop.order,
      tasks: (byStop.get(stop.id) ?? []).sort((a, b) => a.taskOrder - b.taskOrder)
    })),
    catalog: ((catalogRows as Array<{ id: string; title: string; city: string; is_published: boolean }> | null) ?? []).map(
      (row) => ({ id: row.id, title: row.title, city: row.city, isPublished: row.is_published })
    )
  });
}

function encodePublishIssues(issues: Array<{ message: string }>) {
  return encodeURIComponent(issues.map((issue) => issue.message).join(" | ").slice(0, 2000));
}

export async function toggleMissionPublishAction(formData: FormData) {
  const missionId = normalizeText(formData.get("mission_id"));
  const nextPublished = formData.get("next_published") === "true";

  if (!missionId) {
    redirect("/mozek?status=error");
  }

  let blockers: PublishIssue[] = [];
  try {
    const supabase = getSupabaseServerClient();

    if (nextPublished) {
      blockers = await collectPublishBlockers(supabase, missionId);
    }

    if (blockers.length === 0) {
      const update: Record<string, unknown> = { is_published: nextPublished };
      if (nextPublished) {
        // R37: první publikace se zaznamená natrvalo. Podle toho se pozná hra,
        // která legitimně vyšla ven, takže její body zůstávají hráčům i po
        // pozdějším odpublikování.
        const { data: current } = await supabase
          .from("missions")
          .select("first_published_at")
          .eq("id", missionId)
          .maybeSingle<{ first_published_at: string | null }>();
        if (!current?.first_published_at) {
          update.first_published_at = new Date().toISOString();
        }
      }

      const { error } = await supabase.from("missions").update(update).eq("id", missionId);
      if (error) {
        redirect("/mozek?status=error");
      }
    }
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect("/mozek?status=error");
  }

  if (blockers.length > 0) {
    redirect(`/mozek/missions/${missionId}?status=publish_blocked&issues=${encodePublishIssues(blockers)}`);
  }

  revalidatePath("/mozek");
  revalidatePath(`/mozek/missions/${missionId}`);
  revalidatePath("/");
  redirect(`/mozek/missions/${missionId}?status=${nextPublished ? "published" : "unpublished"}`);
}

/**
 * R37: smazat jde jen hra, kterou nikdo nikdy nerozehrál. Kontrola je serverová –
 * potvrzení v prohlížeči je jen zdvořilost, rozhodnutí dělá server.
 */
export async function deleteMissionAction(formData: FormData) {
  const missionId = normalizeText(formData.get("mission_id"));
  const confirmed = normalizeText(formData.get("confirm")) === "smazat";
  if (!missionId) {
    redirect("/mozek?status=error");
  }
  if (!confirmed) {
    redirect(`/mozek/missions/${missionId}?status=delete_not_confirmed`);
  }

  try {
    const supabase = getSupabaseServerClient();
    const usage = await getMissionUsage(supabase, missionId);
    const guard = guardMissionDelete(usage);
    if (!guard.allowed) {
      redirect(`/mozek/missions/${missionId}?status=delete_blocked&issues=${encodeURIComponent(guard.reason)}`);
    }

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

/**
 * R37: pořadí se mění šipkami a přečíslovává se samo. Ruční přepisování čísel
 * dokázalo dvěma zastávkám přiřadit stejné pořadí a řazení pak bylo náhodné.
 *
 * Prohození jde přes dočasnou zápornou hodnotu, aby neporušilo unikátní index.
 */
export async function moveStopAction(formData: FormData) {
  const missionId = normalizeText(formData.get("mission_id"));
  const stopId = normalizeText(formData.get("stop_id"));
  const direction = normalizeText(formData.get("direction")) === "up" ? "up" : "down";

  if (!missionId || !stopId) {
    redirect("/mozek?status=error");
  }

  try {
    const supabase = getSupabaseServerClient();
    const usage = await getMissionUsage(supabase, missionId);
    const guard = guardReorder(usage);
    if (!guard.allowed) {
      redirect(`/mozek/missions/${missionId}?status=reorder_blocked&issues=${encodeURIComponent(guard.reason)}`);
    }

    const { data: stopRows, error } = await supabase
      .from("mission_stops")
      .select("id, order")
      .eq("mission_id", missionId)
      .order("order", { ascending: true });
    if (error || !stopRows) {
      redirect(`/mozek/missions/${missionId}?status=error`);
    }

    const ordered = (stopRows as Array<{ id: string; order: number }>).slice();
    const index = ordered.findIndex((row) => row.id === stopId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
      redirect(`/mozek/missions/${missionId}?status=reorder_edge`);
    }

    const current = ordered[index];
    const target = ordered[targetIndex];

    await supabase.from("mission_stops").update({ order: -1 }).eq("id", current.id);
    await supabase.from("mission_stops").update({ order: current.order }).eq("id", target.id);
    await supabase.from("mission_stops").update({ order: target.order }).eq("id", current.id);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/mozek/missions/${missionId}?status=error`);
  }

  revalidatePath(`/mozek/missions/${missionId}`);
  redirect(`/mozek/missions/${missionId}?status=reordered`);
}

export async function deleteStopAction(formData: FormData) {
  const missionId = normalizeText(formData.get("mission_id"));
  const stopId = normalizeText(formData.get("stop_id"));
  const confirmed = normalizeText(formData.get("confirm")) === "smazat";
  if (!missionId || !stopId) {
    redirect("/mozek?status=error");
  }
  if (!confirmed) {
    redirect(`/mozek/missions/${missionId}?status=delete_not_confirmed`);
  }

  try {
    const supabase = getSupabaseServerClient();
    const usage = await getMissionUsage(supabase, missionId);
    if (usage.activeRuns > 0 || usage.answers > 0 || usage.playersWithResult > 0) {
      const { guardContentDelete } = await import("@/lib/mission-usage");
      const guard = guardContentDelete(usage, "stop");
      if (!guard.allowed) {
        redirect(`/mozek/missions/${missionId}?status=delete_blocked&issues=${encodeURIComponent(guard.reason)}`);
      }
    }

    const { error: tasksError } = await supabase.from("mission_tasks").delete().eq("stop_id", stopId);
    if (tasksError) {
      redirect(`/mozek/missions/${missionId}?status=error`);
    }

    const { error: stopError } = await supabase.from("mission_stops").delete().eq("id", stopId);
    if (stopError) {
      redirect(`/mozek/missions/${missionId}?status=error`);
    }

    // Po smazání se pořadí srovná, ať v něm nezůstane díra.
    const { data: remaining } = await supabase
      .from("mission_stops")
      .select("id, order")
      .eq("mission_id", missionId)
      .order("order", { ascending: true });
    let position = 1;
    for (const row of (remaining as Array<{ id: string; order: number }> | null) ?? []) {
      if (row.order !== position) {
        await supabase.from("mission_stops").update({ order: position }).eq("id", row.id);
      }
      position += 1;
    }
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/mozek/missions/${missionId}?status=error`);
  }

  revalidatePath(`/mozek/missions/${missionId}`);
  redirect(`/mozek/missions/${missionId}?status=stop_deleted`);
}
