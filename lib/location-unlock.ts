// R20/R26: zámek hry podle katalogu. Modul potřebuje jen identitu hry a její
// vazbu na předchozí hru, ne celý obsah – od R26 už veřejná podoba hry neobsahuje
// závěr, takže by tvar MapLocation ani nesedl.

export type UnlockableLocation = {
  id: string;
  name: string;
  unlockedByPlaceId?: string | null;
};

export function getUnlockRequirement<T extends UnlockableLocation>(location: UnlockableLocation, allLocations: T[]) {
  const requiredId = location.unlockedByPlaceId;
  if (!requiredId) {
    return null;
  }

  return allLocations.find((item) => item.id === requiredId) ?? null;
}

export function isLocationUnlockedByChain(
  location: UnlockableLocation,
  completedGameplayLocationIds: string[],
  allLocations: UnlockableLocation[],
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
