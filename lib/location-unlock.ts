import type { MapLocation } from "@/lib/mock-data";

export function getUnlockRequirement(location: MapLocation, allLocations: MapLocation[]) {
  const requiredId = location.unlockedByPlaceId;
  if (!requiredId) {
    return null;
  }

  return allLocations.find((item) => item.id === requiredId) ?? null;
}

export function isLocationUnlockedByChain(
  location: MapLocation,
  completedGameplayLocationIds: string[],
  allLocations: MapLocation[],
  defaultUnlocked = false
) {
  if (defaultUnlocked) {
    return true;
  }

  // FAIL-CLOSED (R20): je-li vazba nastavená, odemyká výhradně dokončení vyžadované hry.
  // Když vyžadovanou hru nelze najít v seznamu (nepublikovaná, smazaná, neplatné ID),
  // hra zůstává zamčená – nikdy se neodemkne omylem.
  const requiredId = location.unlockedByPlaceId;
  if (!requiredId) {
    return true;
  }

  return completedGameplayLocationIds.includes(requiredId);
}
