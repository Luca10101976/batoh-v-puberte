"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CitySelector } from "@/components/city-selector";
import { HeroCard } from "@/components/hero-card";
import { useAppState } from "@/components/app-state-provider";
import { locations, type MapLocation } from "@/lib/mock-data";
import { getUnlockRequirement } from "@/lib/location-unlock";
import type { GameplayEpisode } from "@/lib/gameplay-types";

type HomeLocation = Omit<MapLocation, "episodes"> & { episodes: GameplayEpisode[] };

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

type FriendActivityRow = {
  friend_profile_code: string;
  friend_display_name: string;
  created_at: string;
};

type IncomingFriendshipRow = {
  child_profile_id: string;
  created_at: string;
};

export function HomeScreen({ publishedLocations }: { publishedLocations: HomeLocation[] }) {
  const { state, isLocationUnlocked, setCity } = useAppState();
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const publishedCities = useMemo(
    () => Array.from(new Set(publishedLocations.map((location) => location.city))),
    [publishedLocations]
  );
  const cityLocations = useMemo(
    () => publishedLocations.filter((location) => location.city === state.city),
    [publishedLocations, state.city]
  );
  const primaryLocation = cityLocations[0] ?? publishedLocations[0] ?? null;
  const unlockedInCity = cityLocations.filter((location) => isLocationUnlocked(location.id, location.unlocked)).length;
  const cityScore = unlockedInCity * 120;
  const mapUrl = useMemo(() => {
    if (!primaryLocation) {
      return "";
    }

    const mapDelta = 0.0075;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${primaryLocation.lng - mapDelta}%2C${
      primaryLocation.lat - mapDelta
    }%2C${primaryLocation.lng + mapDelta}%2C${primaryLocation.lat + mapDelta}&layer=mapnik&marker=${
      primaryLocation.lat
    }%2C${primaryLocation.lng}`;
  }, [primaryLocation]);
  const openStreetMapUrl = useMemo(() => {
    if (!primaryLocation) {
      return "";
    }
    return `https://www.openstreetmap.org/?mlat=${primaryLocation.lat}&mlon=${primaryLocation.lng}#map=16/${primaryLocation.lat}/${primaryLocation.lng}`;
  }, [primaryLocation]);

  useEffect(() => {
    setIsMapLoaded(false);
  }, [primaryLocation?.id]);

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

      <section className="glass-card overflow-hidden p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Vybrané město</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">{state.city}</h2>
            <p className="mt-2 text-sm text-mist">Město vybíráš ručně podle toho, kde chceš hrát.</p>
          </div>
          <CitySelector cities={publishedCities} />
        </div>

        <div className="relative h-[360px] overflow-hidden rounded-[24px] border border-white/10 bg-ink">
          {primaryLocation && isMapLoaded ? (
            <iframe
              title="Mapa lokace"
              src={mapUrl}
              className="h-full w-full"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(82,200,255,0.18),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(180,255,98,0.18),transparent_38%),linear-gradient(180deg,#07111f_0%,#091526_100%)]">
              <div className="rounded-2xl border border-white/10 bg-night/80 px-4 py-3 text-center backdrop-blur">
                <p className="text-xs uppercase tracking-[0.2em] text-mist">Mapa</p>
                <p className="mt-1 text-sm text-white">Načti mapu pro přesnou orientaci</p>
              </div>
            </div>
          )}

          {primaryLocation ? (
            <Link
              href={`/locations/${primaryLocation.id}`}
              className="absolute left-4 top-4 z-10 rounded-full border border-white/10 bg-night/90 px-4 py-2 text-sm font-semibold text-white backdrop-blur"
            >
              {primaryLocation.name}
            </Link>
          ) : null}

          {!isMapLoaded && primaryLocation ? (
            <div className="absolute right-4 top-4 z-10 flex gap-2">
              <button
                onClick={() => setIsMapLoaded(true)}
                className="rounded-full border border-lime/40 bg-lime/20 px-4 py-2 text-xs font-semibold text-lime backdrop-blur"
              >
                Načíst mapu
              </button>
              <a
                href={openStreetMapUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/10 bg-night/90 px-4 py-2 text-xs font-semibold text-white backdrop-blur"
              >
                Otevřít OSM
              </a>
            </div>
          ) : null}

        </div>
      </section>

      <section className="glass-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-coral">Mise ve městě</p>
            <h2 className="mt-2 text-xl font-semibold">{state.city}</h2>
          </div>
          <div className="rounded-full bg-coral/12 px-3 py-2 text-xs font-semibold text-coral">Vyber si misi</div>
        </div>
        {!state.registrationCompleted ? (
          <p className="mt-3 text-sm leading-6 text-mist">
            Místa si můžeš projít hned. Přihlášení hráče se otevře až ve chvíli, kdy budeš chtít misi opravdu hrát.
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          {cityLocations.length === 0 ? (
            <div className="rounded-2xl bg-white/5 p-4 text-sm text-mist">
              Pro tohle město zatím nemáme připravenou misi.
            </div>
          ) : (
            cityLocations.map((missionLocation) => {
              const missionUnlocked = isLocationUnlocked(missionLocation.id, missionLocation.unlocked);
              const unlockRequirement = getUnlockRequirement(missionLocation, locations);
              const taskCount = missionLocation.episodes.reduce((sum, episode) => sum + episode.tasks.length, 0);
              return (
                <Link
                  key={missionLocation.id}
                  href={`/locations/${missionLocation.id}`}
                  className="block rounded-[24px] border border-white/10 bg-white/5 p-4 transition hover:border-lime/40 hover:bg-white/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{missionLocation.name}</h3>
                      <p className="mt-1 text-sm text-mist">
                        {missionUnlocked
                          ? missionLocation.teaser
                          : `Odemkneš po dokončení: ${unlockRequirement?.name ?? "předchozího místa"}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-lime">{formatStopCount(missionLocation.episodes.length)}</div>
                      <div className="text-xs text-mist">{missionUnlocked ? formatTaskCount(taskCount) : "Zamčeno"}</div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Dnes doporučené lokace</h2>
          <Link href="/leaderboard" className="text-sm text-lime">
            Žebříček
          </Link>
        </div>

        {cityLocations.length === 0 ? (
          <div className="rounded-2xl bg-white/5 p-4 text-sm text-mist">V tomhle městě zatím není dostupná žádná lokace.</div>
        ) : (
          cityLocations.map((location) => {
            const unlocked = isLocationUnlocked(location.id, location.unlocked);
            const unlockRequirement = getUnlockRequirement(location, locations);
            const taskCount = location.episodes.reduce((sum, episode) => sum + episode.tasks.length, 0);

            return (
              <Link
                key={location.id}
                href={`/locations/${location.id}`}
                className="glass-card flex items-center gap-4 p-3"
              >
                <div className="relative h-20 w-20 overflow-hidden rounded-[20px]">
                  <Image src={location.image} alt={location.name} fill className="object-cover" sizes="80px" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{location.name}</h3>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                        unlocked ? "bg-lime/15 text-lime" : "bg-white/8 text-mist"
                      }`}
                    >
                      {unlocked ? "Odemčeno" : "Zamčeno"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-mist">{location.teaser}</p>
                  {!unlocked ? (
                    <p className="mt-2 text-xs text-mist">
                      Odemkneš po dokončení: {unlockRequirement?.name ?? "předchozího místa"}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-mist">
                    <span className="rounded-full bg-white/5 px-2 py-1">{location.distance}</span>
                    <span className="rounded-full bg-white/5 px-2 py-1">{formatStopCount(location.episodes.length)}</span>
                    <span className="rounded-full bg-white/5 px-2 py-1">{formatTaskCount(taskCount)}</span>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </section>

    </main>
  );
}
