"use client";

import { useMemo } from "react";
import { useAppState } from "@/components/app-state-provider";
import { locations } from "@/lib/mock-data";

export function CitySelector() {
  const { state, setCity } = useAppState();
  const cities = useMemo(() => Array.from(new Set(locations.map((location) => location.city))), []);

  return (
    <select
      value={state.city}
      onChange={(event) => setCity(event.target.value)}
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
