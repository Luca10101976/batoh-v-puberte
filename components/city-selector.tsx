"use client";

import { useMemo } from "react";
import { useAppState } from "@/components/app-state-provider";

export function CitySelector({ cities: allowedCities }: { cities?: string[] }) {
  const { state, setCity } = useAppState();
  // R20: seznam měst přichází výhradně z DB katalogu (jen města s publikovanou hrou)
  const cities = useMemo(() => allowedCities ?? [], [allowedCities]);

  return (
    <select
      value={state.city}
      onChange={(event) => setCity(event.target.value)}
      aria-label="Vyber město ručně"
      title="Vyber město ručně"
      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none"
    >
      {cities.map((city) => (
        <option key={city} value={city} className="bg-night text-white">
          {city}
        </option>
      ))}
    </select>
  );
}
