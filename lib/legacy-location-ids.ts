// Stabilní identita historických her (oprava před R23, audit problém A).
//
// Historické hry (Klamovka, Budějovice) mají veřejnou adresu, postup hráčů i body
// uložené pod textovým locationId (slug). Dřív se slug odvozoval z dvojice
// město + název mise, takže přejmenování v Mozku měnilo identitu hry a odpojilo
// postup hráčů. Teď je jediným zdrojem mapa podle UUID mise, které Mozek nemění.
//
// Cílový datový model (missions.slug) patří do R38–R40; tato mapa je do té doby
// jediné místo, kde se historický slug určuje. Nové hry z Mozku v mapě nejsou
// a používají jako locationId přímo UUID mise.

export const LEGACY_LOCATION_ID_BY_MISSION_ID: Readonly<Record<string, string>> = {
  // Ztracený příběh Klamovky (Praha)
  "70b31e6d-6a24-4e3a-a48e-dfbc3dbd2b43": "klamovka",
  // Budějovický kód: Operace Žába (České Budějovice)
  "c81ee324-c315-41db-9777-b43c96759dee": "budejovice-zaba"
};

const MISSION_ID_BY_LEGACY_LOCATION_ID: ReadonlyMap<string, string> = new Map(
  Object.entries(LEGACY_LOCATION_ID_BY_MISSION_ID).map(([missionId, locationId]) => [locationId, missionId])
);

/** Historický locationId pro UUID mise; null = hra není historická (locationId = UUID). */
export function legacyLocationIdForMission(missionId: string | null | undefined) {
  if (!missionId) {
    return null;
  }
  return LEGACY_LOCATION_ID_BY_MISSION_ID[missionId.trim()] ?? null;
}

/** UUID mise pro historický locationId; null = nejde o historický slug. */
export function legacyMissionIdForLocation(locationId: string | null | undefined) {
  if (!locationId) {
    return null;
  }
  return MISSION_ID_BY_LEGACY_LOCATION_ID.get(locationId.trim()) ?? null;
}

/** UUID mise, pod kterým se v DB hledá obsah hry s daným locationId. */
export function resolveMissionIdForLocation(locationId: string) {
  return legacyMissionIdForLocation(locationId) ?? locationId;
}
