"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EMPTY_FORM_STATE, type FormState } from "@/app/admin/types";
import { CITY_NAME_TAKEN_MESSAGE, CITY_SLUG_TAKEN_MESSAGE, validateCity } from "@/lib/cities";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// R37: města spravuje Mozek. Dřív město neexistovalo jako entita – bylo jen
// textem u mise, takže nové město nešlo založit vůbec a jeho souřadnice
// i skloňování byly zadrátované v kódu.

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
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

function conflictMessage(error: { code?: string; message?: string } | null) {
  if (error?.code !== "23505") {
    return null;
  }
  return (error.message ?? "").includes("cities_slug_key") ? CITY_SLUG_TAKEN_MESSAGE : CITY_NAME_TAKEN_MESSAGE;
}

function parseCityForm(formData: FormData) {
  return validateCity({
    name: text(formData.get("name")),
    slug: text(formData.get("slug")),
    nameLocative: text(formData.get("name_locative")),
    displayOrder: text(formData.get("display_order")),
    isActive: formData.get("is_active") === "on",
    lat: text(formData.get("lat")),
    lng: text(formData.get("lng"))
  });
}

export async function createCityAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseCityForm(formData);
  if (!parsed.ok) {
    return { ...EMPTY_FORM_STATE, error: "Zkontroluj formulář.", fieldErrors: parsed.fieldErrors };
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("cities")
      .insert({
        name: parsed.value.name,
        slug: parsed.value.slug,
        name_locative: parsed.value.nameLocative,
        display_order: parsed.value.displayOrder,
        is_active: parsed.value.isActive,
        lat: parsed.value.lat,
        lng: parsed.value.lng
      })
      .select("id")
      .single<{ id: string }>();

    const conflict = conflictMessage(error);
    if (conflict) {
      return { ...EMPTY_FORM_STATE, error: conflict };
    }
    if (error || !data?.id) {
      return { ...EMPTY_FORM_STATE, error: `Uložení města selhalo: ${error?.message ?? "neznámá chyba"}` };
    }

    revalidatePath("/mozek/cities");
    redirect(`/mozek/cities/${data.id}?status=created`);
  } catch (error: any) {
    rethrowIfRedirectError(error);
    return { ...EMPTY_FORM_STATE, error: `Uložení města selhalo: ${String(error?.message || error)}` };
  }
}

export async function updateCityAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const cityId = text(formData.get("city_id")).trim();
  if (!cityId) {
    return { ...EMPTY_FORM_STATE, error: "Chybí ID města." };
  }

  const parsed = parseCityForm(formData);
  if (!parsed.ok) {
    return { ...EMPTY_FORM_STATE, error: "Zkontroluj formulář.", fieldErrors: parsed.fieldErrors };
  }

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("cities")
      .update({
        name: parsed.value.name,
        slug: parsed.value.slug,
        name_locative: parsed.value.nameLocative,
        display_order: parsed.value.displayOrder,
        is_active: parsed.value.isActive,
        lat: parsed.value.lat,
        lng: parsed.value.lng,
        updated_at: new Date().toISOString()
      })
      .eq("id", cityId);

    const conflict = conflictMessage(error);
    if (conflict) {
      return { ...EMPTY_FORM_STATE, error: conflict };
    }
    if (error) {
      return { ...EMPTY_FORM_STATE, error: `Uložení města selhalo: ${error.message}` };
    }

    // Název města drží aplikace v missions.city. Přejmenování se proto musí
    // promítnout do všech her toho města, jinak by se katalog rozpadl na dvě
    // města se stejnými hrami.
    const { error: missionsError } = await supabase
      .from("missions")
      .update({ city: parsed.value.name })
      .eq("city_id", cityId);
    if (missionsError) {
      return {
        ...EMPTY_FORM_STATE,
        error: `Město se uložilo, ale hry se nepodařilo srovnat: ${missionsError.message}`
      };
    }
  } catch (error: any) {
    rethrowIfRedirectError(error);
    return { ...EMPTY_FORM_STATE, error: `Uložení města selhalo: ${String(error?.message || error)}` };
  }

  revalidatePath("/mozek/cities");
  revalidatePath(`/mozek/cities/${cityId}`);
  revalidatePath("/");
  return { ...EMPTY_FORM_STATE, success: "Město bylo uložené." };
}

export async function toggleCityActiveAction(formData: FormData) {
  const cityId = text(formData.get("city_id")).trim();
  const nextActive = formData.get("next_active") === "true";
  if (!cityId) {
    redirect("/mozek/cities?status=error");
  }

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("cities")
      .update({ is_active: nextActive, updated_at: new Date().toISOString() })
      .eq("id", cityId);
    if (error) {
      redirect("/mozek/cities?status=error");
    }
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect("/mozek/cities?status=error");
  }

  revalidatePath("/mozek/cities");
  redirect(`/mozek/cities?status=${nextActive ? "activated" : "deactivated"}`);
}

/**
 * Smazat jde jen město bez jediné hry. Město s hrami se vypíná, ne maže –
 * jinak by hry zůstaly viset u neexistujícího města.
 */
export async function deleteCityAction(formData: FormData) {
  const cityId = text(formData.get("city_id")).trim();
  if (!cityId) {
    redirect("/mozek/cities?status=error");
  }

  try {
    const supabase = getSupabaseServerClient();
    const { count, error: countError } = await supabase
      .from("missions")
      .select("*", { count: "exact", head: true })
      .eq("city_id", cityId);
    if (countError) {
      redirect("/mozek/cities?status=error");
    }
    if ((count ?? 0) > 0) {
      redirect("/mozek/cities?status=city_has_missions");
    }

    const { error } = await supabase.from("cities").delete().eq("id", cityId);
    if (error) {
      redirect("/mozek/cities?status=error");
    }
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect("/mozek/cities?status=error");
  }

  revalidatePath("/mozek/cities");
  redirect("/mozek/cities?status=deleted");
}
