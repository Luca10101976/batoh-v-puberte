"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { CitySelector } from "@/components/city-selector";
import { HeroCard } from "@/components/hero-card";
import { useAppState } from "@/components/app-state-provider";
import { locations, type MapLocation } from "@/lib/mock-data";
import { getUnlockRequirement } from "@/lib/location-unlock";
import type { GameplayEpisode } from "@/lib/gameplay-types";

type HomeLocation = Omit<MapLocation, "episodes"> & { episodes: GameplayEpisode[] };

function isExternalImage(src: string) {
  return /^https?:\/\//i.test(src);
}

function formatStopCount(count: number) {
  if (count === 1) {
    return "1 zastavení";
  }
  if (count >= 2 && count <= 4) {
    return `${count} zastavení`;
  }
  return `${count} zastavení`;
}

function formatTaskCount(count: number) {
  if (count === 1) {
    return "1 úkol";
  }
  if (count >= 2 && count <= 4) {
    return `${count} úkoly`;
  }
  return `${count} úkolů`;
}

export function HomeScreen({ publishedLocations }: { publishedLocations: HomeLocation[] }) {
  const { state, isLocationUnlocked, setCity } = useAppState();
  const publishedCities = useMemo(
    () => Array.from(new Set(publishedLocations.map((location) => location.city))).sort((a, b) => a.localeCompare(b, "cs")),
    [publishedLocations]
  );
  const cityLocations = useMemo(
    () =>
      publishedLocations
        .filter((location) => location.city === state.city)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "cs")),
    [publishedLocations, state.city]
  );
  const primaryLocation = cityLocations[0] ?? publishedLocations[0] ?? null;

  useEffect(() => {
    if (publishedCities.length === 0) {
      return;
    }
    if (!publishedCities.includes(state.city)) {
      setCity(publishedCities[0]);
    }
  }, [publishedCities, setCity, state.city]);

  return (
    <main className="flex flex-1 flex-col gap-6 pb-24">
      <HeroCard />

      <section className="glass-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Vybrané město</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight">{state.city}</h2>
              <span className="rounded-full bg-lime/12 px-3 py-2 text-xs font-semibold text-lime">
                {cityLocations.length} {cityLocations.length === 1 ? "hra" : cityLocations.length >= 2 && cityLocations.length <= 4 ? "hry" : "her"}
              </span>
            </div>
            <p className="mt-2 text-sm text-mist">
              Vyber město a hned pod ním uvidíš všechny dostupné hry v dané lokalitě.
            </p>
          </div>
          <CitySelector cities={publishedCities} />
        </div>
      </section>

      {primaryLocation ? (
        <section className="glass-card overflow-hidden p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-lime">Doporučená hra v městě</p>
              <h2 className="mt-2 text-xl font-semibold">Začni tady</h2>
            </div>
            <span className="rounded-full bg-white/8 px-3 py-2 text-xs font-semibold text-mist">
              {state.city}
            </span>
          </div>

          <div className="relative min-h-[320px] overflow-hidden rounded-[24px] border border-white/10 bg-ink">
            {isExternalImage(primaryLocation.image) ? (
              <img src={primaryLocation.image} alt={primaryLocation.name} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <Image
                src={primaryLocation.image}
                alt={primaryLocation.name}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 896px"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-night via-night/70 to-night/25" />
            <div className="relative z-10 flex min-h-[320px] flex-col justify-end p-5 md:max-w-[55%]">
              <p className="text-xs uppercase tracking-[0.24em] text-lime">Vybraná mise</p>
              <h3 className="mt-2 text-3xl font-bold tracking-tight">{primaryLocation.name}</h3>
              <p className="mt-2 text-sm leading-6 text-mist">{primaryLocation.teaser}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-mist">
                <span className="rounded-full bg-white/10 px-3 py-2">{primaryLocation.distance}</span>
                <span className="rounded-full bg-white/10 px-3 py-2">{formatStopCount(primaryLocation.episodes.length)}</span>
                <span className="rounded-full bg-white/10 px-3 py-2">
                  {formatTaskCount(primaryLocation.episodes.reduce((sum, episode) => sum + episode.tasks.length, 0))}
                </span>
              </div>
              <div className="mt-5">
                <Link
                  href={`/locations/${primaryLocation.id}`}
                  className="inline-flex rounded-[22px] bg-lime px-5 py-3 text-sm font-bold text-night"
                >
                  Otevřít startovní místo
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="glass-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-coral">Všechny hry ve městě</p>
            <h2 className="mt-2 text-xl font-semibold">{state.city}</h2>
            <p className="mt-2 text-sm leading-6 text-mist">
              Tady je kompletní přehled všech her v tomhle městě. Žádná není schovaná mimo výběr.
            </p>
          </div>
          <div className="rounded-full bg-coral/12 px-3 py-2 text-xs font-semibold text-coral">
            {cityLocations.length === 0
              ? "0 her"
              : cityLocations.length === 1
                ? "1 hra"
                : cityLocations.length >= 2 && cityLocations.length <= 4
                  ? `${cityLocations.length} hry`
                  : `${cityLocations.length} her`}
          </div>
        </div>

        {!state.registrationCompleted ? (
          <p className="mt-3 text-sm leading-6 text-mist">
            Místa si můžeš projít hned. Přihlášení hráče se otevře až ve chvíli, kdy budeš chtít misi opravdu hrát.
          </p>
        ) : null}

        {cityLocations.length === 0 ? (
          <div className="mt-5 rounded-2xl bg-white/5 p-4 text-sm text-mist">
            Pro tohle město zatím nemáme připravenou žádnou hru.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {cityLocations.map((missionLocation) => {
              const missionUnlocked = isLocationUnlocked(missionLocation.id, missionLocation.unlocked);
              const unlockRequirement = getUnlockRequirement(missionLocation, locations);
              const taskCount = missionLocation.episodes.reduce((sum, episode) => sum + episode.tasks.length, 0);

              return (
                <Link
                  key={missionLocation.id}
                  href={`/locations/${missionLocation.id}`}
                  className="group overflow-hidden rounded-[24px] border border-white/10 bg-white/5 transition hover:border-lime/30 hover:bg-white/10"
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    {isExternalImage(missionLocation.image) ? (
                      <img
                        src={missionLocation.image}
                        alt={missionLocation.name}
                        className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <Image
                        src={missionLocation.image}
                        alt={missionLocation.name}
                        fill
                        className="object-cover transition duration-300 group-hover:scale-[1.03]"
                        sizes="(max-width: 768px) 100vw, 50vw"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-night via-night/45 to-transparent" />
                    <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
                      <span className="rounded-full bg-night/70 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-sky backdrop-blur">
                        {missionLocation.distance}
                      </span>
                      <span
                        className={`rounded-full px-3 py-2 text-[10px] uppercase tracking-[0.2em] backdrop-blur ${
                          missionUnlocked ? "bg-lime/20 text-lime" : "bg-white/10 text-white/75"
                        }`}
                      >
                        {missionUnlocked ? "Odemčeno" : "Zamčeno"}
                      </span>
                    </div>
                    <div className="absolute inset-x-4 bottom-4">
                      <h3 className="text-2xl font-bold tracking-tight text-white">{missionLocation.name}</h3>
                      <p className="mt-2 text-sm leading-6 text-white/80">{missionLocation.teaser}</p>
                    </div>
                  </div>

                  <div className="space-y-4 p-4">
                    <div className="flex flex-wrap gap-2 text-[11px] text-mist">
                      <span className="rounded-full bg-white/5 px-3 py-2">{formatStopCount(missionLocation.episodes.length)}</span>
                      <span className="rounded-full bg-white/5 px-3 py-2">{formatTaskCount(taskCount)}</span>
                    </div>

                    {!missionUnlocked ? (
                      <p className="text-sm leading-6 text-mist">
                        Odemkneš po dokončení: {unlockRequirement?.name ?? "předchozího místa"}
                      </p>
                    ) : null}

                    <div className="inline-flex rounded-[18px] bg-lime px-4 py-3 text-sm font-semibold text-night">
                      Otevřít detail hry
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
