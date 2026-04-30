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

  const requirement = getUnlockRequirement(location, allLocations);
  if (!requirement) {
    return true;
  }

  return completedGameplayLocationIds.includes(requirement.id);
}
