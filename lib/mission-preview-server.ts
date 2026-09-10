/**
 * R37: podklad pro náhled hry v Mozku.
 *
 * Obsah se čte STEJNOU cestou jako pro hráče (getGameplayEpisodes), jen bez
 * podmínky „hra musí být publikovaná“ – náhled je právě pro koncept. Nevzniká
 * tím druhá interpretace dat: mapování zastávek, úkolů, možností, nápověd
 * i přechodů dělá pořád jediný modul lib/gameplay-server.ts.
 *
 * Náhled je čistě čtecí. Nezakládá výpravu, nezapisuje postup, nepřidává body
 * ani neodemyká hry – v tomhle souboru není jediný zápis do databáze.
 */

import { getGameplayEpisodes } from "./gameplay-server.ts";
import type { GameplayEpisode } from "./gameplay-types.ts";
import { legacyLocationIdForMission } from "./legacy-location-ids.ts";

export type MissionPreview = {
  id: string;
  locationId: string;
  title: string;
  city: string;
  cityLocative: string;
  shortDescription: string;
  introStory: string;
  heroImageUrl: string;
  difficulty: string;
  durationMin: number | null;
  isPublished: boolean;
  endingTitle: string;
  endingText: string;
  endingPlayerMessage: string;
  episodes: GameplayEpisode[];
};

type MissionRow = {
  id: string;
  title: string;
  city: string;
  city_id: string | null;
  intro_text: string | null;
  short_description: string | null;
  hero_image_url: string | null;
  difficulty: string | null;
  duration_min: number | null;
  is_published: boolean;
  ending_title: string | null;
  ending_text: string | null;
  ending_player_message: string | null;
};

const DIFFICULTY_LABEL: Record<string, string> = {
  lehka: "Lehká",
  stredni: "Střední",
  tezka: "Vyšší"
};

export async function loadMissionPreview(admin: any, missionId: string): Promise<MissionPreview | null> {
  const { data: mission } = (await admin
    .from("missions")
    .select(
      "id, title, city, city_id, intro_text, short_description, hero_image_url, difficulty, duration_min, is_published, ending_title, ending_text, ending_player_message"
    )
    .eq("id", missionId)
    .maybeSingle()) as { data: MissionRow | null };

  if (!mission) {
    return null;
  }

  const locationId = legacyLocationIdForMission(mission.id) ?? mission.id;
  const episodes = (await getGameplayEpisodes(locationId, { includeUnpublished: true })) ?? [];

  let cityLocative = mission.city;
  if (mission.city_id) {
    const { data: city } = (await admin
      .from("cities")
      .select("name, name_locative")
      .eq("id", mission.city_id)
      .maybeSingle()) as { data: { name: string; name_locative: string | null } | null };
    cityLocative = (city?.name_locative ?? "").trim() || city?.name || mission.city;
  }

  return {
    id: mission.id,
    locationId,
    title: mission.title,
    city: mission.city,
    cityLocative,
    shortDescription: (mission.short_description ?? "").trim(),
    introStory: (mission.intro_text ?? "").trim(),
    heroImageUrl: (mission.hero_image_url ?? "").trim(),
    difficulty: DIFFICULTY_LABEL[mission.difficulty ?? ""] ?? "Lehká",
    durationMin: typeof mission.duration_min === "number" ? mission.duration_min : null,
    isPublished: mission.is_published,
    endingTitle: (mission.ending_title ?? "").trim(),
    endingText: (mission.ending_text ?? "").trim(),
    endingPlayerMessage: (mission.ending_player_message ?? "").trim(),
    episodes
  };
}
