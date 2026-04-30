"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { locations } from "@/lib/mock-data";

export function PaperScoreScreen({ availableLocationIds }: { availableLocationIds: string[] }) {
  const searchParams = useSearchParams();
  const availableLocations = locations.filter((location) => availableLocationIds.includes(location.id));
  const [selectedLocationId, setSelectedLocationId] = useState(availableLocations[0]?.id ?? "");
  const selectedLocation = availableLocations.find((location) => location.id === selectedLocationId) ?? availableLocations[0];

  useEffect(() => {
    const locationId = searchParams.get("locationId");
    if (!locationId) {
      return;
    }

    const exists = availableLocations.some((location) => location.id === locationId);
    if (exists) {
      setSelectedLocationId(locationId);
    }
  }, [availableLocations, searchParams]);

  if (availableLocations.length === 0 || !selectedLocation) {
    return (
      <main className="flex flex-1 flex-col gap-5 pb-24">
        <section className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-coral">Papírová hra</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Tisková verze teď není dostupná</h1>
          <p className="mt-3 text-sm leading-6 text-mist">
            Jakmile bude některá mise zveřejněná, objeví se tady její tisková verze i odkaz na vyhodnocení v aplikaci.
          </p>
        </section>
        <Link href="/profile" className="text-sm text-mist underline">
          Zpět na profil
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <section className="glass-card p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-coral">Papírová hra</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Vytiskni ven, vyhodnoť v aplikaci</h1>
        <p className="mt-3 text-sm leading-6 text-mist">
          Tisková verze je jen pracovní sešit do terénu. Skutečný výsledek, body i odemčení dalších míst vzniknou až ve
          chvíli, kdy stejné odpovědi zadáš do aplikace.
        </p>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">1) Vyber misi</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-sm text-mist">Mise</label>
          <select
            value={selectedLocationId}
            onChange={(event) => {
              setSelectedLocationId(event.target.value);
            }}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none"
          >
            {availableLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name} ({location.city})
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">2) Stáhni tiskovou verzi</h2>
        <p className="mt-2 text-sm text-mist">
          Stáhne se vždy jen vybraná mise a otázky v ní kopírují živou hru 1:1. Na počítači si ji můžeš uložit i jako
          PDF přes systémový dialog tisku.
        </p>
        <div className="mt-4">
          <a
            href={`/api/export/game-content?format=print&locationId=${selectedLocationId}`}
            className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold"
          >
            Stáhnout / vytisknout vybranou misi
          </a>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">3) Doma zadej stejné odpovědi do aplikace</h2>
        <p className="mt-2 text-sm leading-6 text-mist">
          Až se vrátíš z terénu, otevři stejnou misi v aplikaci a zadej odpovědi tam. Jen tak dostaneš skutečný
          výsledek, body i případné odemčení dalšího místa.
        </p>
        <div className="mt-4 rounded-2xl border border-lime/20 bg-lime/10 p-4 text-sm leading-6 text-white/90">
          Papír sám o sobě nic nevyhodnocuje. Slouží jen jako offline zápisník ke stejné hře, kterou pak dokončíš v
          aplikaci.
        </div>
        <div className="mt-4">
          <Link
            href={`/play/${selectedLocationId}?mode=solo`}
            className="inline-flex rounded-[20px] bg-lime px-4 py-3 text-sm font-semibold text-night"
          >
            Otevřít misi v aplikaci
          </Link>
        </div>
      </section>

      <Link href="/profile" className="text-sm text-mist underline">
        Zpět na profil
      </Link>
    </main>
  );
}
