"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { CitySelector } from "@/components/city-selector";
import { useAppState } from "@/components/app-state-provider";
import { buildResumeMissionCard, type ResumeMissionCard } from "@/lib/home-resume";
import type { MapLocation } from "@/lib/mock-data";
import { getUnlockRequirement, isLocationUnlockedByChain } from "@/lib/location-unlock";
import type { PublicGameplayEpisode } from "@/lib/gameplay-types";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { illustrationSrc } from "@/lib/illustrations";

type HomeLocation = Omit<MapLocation, "episodes"> & { episodes: PublicGameplayEpisode[]; catalogOrder?: number };

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

// Lokativ (6. pád) názvu města pro spojení „v <město>".
// Známá města mají ruční tvar, ostatní se nechají beze změny.
const CITY_LOCATIVE: Record<string, string> = {
  Praha: "Praze",
  Brno: "Brně",
  Ostrava: "Ostravě",
  Plzeň: "Plzni",
  Olomouc: "Olomouci",
  "České Budějovice": "Českých Budějovicích",
  Liberec: "Liberci",
  "Hradec Králové": "Hradci Králové",
  "Ústí nad Labem": "Ústí nad Labem",
  Pardubice: "Pardubicích",
  Zlín: "Zlíně"
};

function cityLocative(city: string) {
  return CITY_LOCATIVE[city] ?? city;
}

export function HomeScreen({ publishedLocations }: { publishedLocations: HomeLocation[] }) {
  const { state, setCity, activeRuns } = useAppState();
  const publishedCities = useMemo(
    () => Array.from(new Set(publishedLocations.map((location) => location.city))).sort((a, b) => a.localeCompare(b, "cs")),
    [publishedLocations]
  );
  const cityLocations = useMemo(
    () =>
      publishedLocations
        .filter((location) => location.city === state.city)
        .slice()
        // R20: pořadí v katalogu = catalog_order z DB, při shodě název
        .sort((a, b) => (a.catalogOrder ?? 0) - (b.catalogOrder ?? 0) || a.name.localeCompare(b.name, "cs")),
    [publishedLocations, state.city]
  );
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (publishedCities.length === 0) {
      return;
    }
    if (!publishedCities.includes(state.city)) {
      setCity(publishedCities[0]);
    }
  }, [publishedCities, setCity, state.city]);

  // R24: rozehrané hry se berou z BĚŽÍCÍCH VÝPRAV. Hráč jich může mít víc,
  // proto se zobrazují všechny, ne jen naposledy hraná.
  const resumeCards = useMemo(() => {
    return activeRuns
      .map((run) => {
        const location = publishedLocations.find((item) => item.id === run.locationId);
        if (!location) {
          return null;
        }
        return buildResumeMissionCard(location, {
          task_progress: run.taskProgress,
          location: { status: "in_progress" }
        });
      })
      .filter((card): card is ResumeMissionCard => Boolean(card));
  }, [activeRuns, publishedLocations]);

  return (
    <main className="flex flex-1 flex-col gap-6 pb-24">
      <header className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.24em] text-lime">Traki na stopě tajemství</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight">
            V každém městě jsou skrytá tajemství, která je třeba odhalit.
          </h1>
          <p className="mt-2 text-xs uppercase tracking-[0.24em] text-lime">Které tajemství odhalíš dnes?</p>
        </div>
        <Image
          src="/icons/traki-transparent.png"
          alt="Traki"
          width={112}
          height={112}
          priority
          className="pointer-events-none h-24 w-24 flex-none -scale-x-100 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.35)] sm:h-28 sm:w-28"
        />
      </header>

      {resumeCards.length === 1 ? (
        <section className="glass-card border-lime/30 bg-lime/10 p-4 sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex max-w-3xl items-start gap-4">
              <Image
                src={illustrationSrc("bezici")}
                alt=""
                width={88}
                height={88}
                className="h-16 w-16 shrink-0 object-contain sm:h-[88px] sm:w-[88px]"
              />
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-lime">Pokračovat ve hře</p>
                <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{resumeCards[0].missionName}</h2>
                <p className="mt-2 text-base font-semibold text-white">{resumeCards[0].stopName}</p>
                <p className="mt-1 text-sm leading-6 text-mist">{resumeCards[0].taskLabel}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-mist">
                  <span className="rounded-full bg-white/8 px-3 py-2">{resumeCards[0].progressText}</span>
                </div>
              </div>
            </div>
            <Link
              href={resumeCards[0].href}
              className="inline-flex min-h-12 items-center justify-center rounded-[22px] bg-lime px-6 py-3 text-base font-bold text-night"
            >
              Pokračovat
            </Link>
          </div>
        </section>
      ) : null}

      {resumeCards.length > 1 ? (
        <section className="glass-card border-lime/30 bg-lime/10 p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <Image
              src={illustrationSrc("bezici")}
              alt=""
              width={88}
              height={88}
              className="h-16 w-16 shrink-0 object-contain sm:h-[88px] sm:w-[88px]"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.24em] text-lime">Rozehrané hry</p>
              <ul className="mt-3 flex flex-col gap-2">
                {resumeCards.map((card) => (
                  <li
                    key={card.locationId}
                    className="flex flex-col gap-2 rounded-2xl bg-white/8 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white">{card.missionName}</p>
                      <p className="mt-1 truncate text-sm text-mist">{card.stopName}</p>
                      <p className="mt-1 text-xs font-semibold text-mist">{card.progressText}</p>
                    </div>
                    <Link
                      href={card.href}
                      className="inline-flex min-h-11 flex-none items-center justify-center rounded-[20px] bg-lime px-5 py-2 text-sm font-bold text-night"
                    >
                      Pokračovat
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <section className="glass-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <Image
              src={illustrationSrc("mapa")}
              alt=""
              width={80}
              height={80}
              className="h-14 w-14 shrink-0 object-contain sm:h-20 sm:w-20"
            />
            <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Vybrané město</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">{state.city}</h2>
            <p className="mt-2 text-sm text-mist">Vyber si hru, která tě láká nejvíc. Zamčené hry se odemykají postupně.</p>
            </div>
          </div>
          <CitySelector cities={publishedCities} />
        </div>
      </section>

      <section className="glass-card p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-coral">Přehled všech her</p>
          <h2 className="mt-2 text-xl font-semibold">
            {cityLocations.length === 0
              ? `Hry v ${cityLocative(state.city)}`
              : cityLocations.length === 1
                ? `1 hra v ${cityLocative(state.city)}`
                : cityLocations.length >= 2 && cityLocations.length <= 4
                  ? `${cityLocations.length} hry v ${cityLocative(state.city)}`
                  : `${cityLocations.length} her v ${cityLocative(state.city)}`}
          </h2>
          <p className="mt-2 text-sm leading-6 text-mist">
            Tady je celý katalog her v tomhle městě. Nic dalšího není schované mimo tenhle výběr.
          </p>
        </div>

        {cityLocations.length === 0 ? (
          <div className="mt-5 flex items-center gap-4 rounded-2xl bg-white/5 p-4">
            <Image
              src={illustrationSrc("pin")}
              alt=""
              width={80}
              height={80}
              className="h-20 w-20 shrink-0 object-contain"
            />
            <p className="text-sm text-mist">Pro tohle město zatím nemáme připravenou žádnou hru.</p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4">
            {cityLocations.map((missionLocation) => {
              // R20: zámek podle DB (unlock_after_mission_id) nad publikovaným katalogem, ne podle mocku
              const missionUnlocked = isLocationUnlockedByChain(
                missionLocation,
                state.completedGameplayLocationIds,
                publishedLocations,
                missionLocation.unlocked
              );
              const unlockRequirement = getUnlockRequirement(missionLocation, publishedLocations);
              const taskCount = missionLocation.episodes.reduce((sum, episode) => sum + episode.tasks.length, 0);

              return (
                <article
                  key={missionLocation.id}
                  className={`overflow-hidden rounded-[24px] border border-white/10 bg-white/5 ${
                    missionUnlocked ? "" : "opacity-80"
                  }`}
                >
                  <div className="flex gap-4 p-4">
                    <div className="relative h-28 w-28 flex-none overflow-hidden rounded-[20px] border border-white/10 bg-ink sm:h-32 sm:w-32">
                    {isExternalImage(missionLocation.image) ? (
                      <img
                        src={missionLocation.image}
                        alt={missionLocation.name}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <Image
                        src={missionLocation.image}
                        alt={missionLocation.name}
                        fill
                        className="object-cover"
                        sizes="128px"
                      />
                    )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-xl font-bold tracking-tight text-white">{missionLocation.name}</h3>
                          <p className="mt-2 text-sm leading-6 text-white/80">{missionLocation.teaser}</p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-2 text-[10px] uppercase tracking-[0.2em] ${
                            missionUnlocked ? "bg-lime/20 text-lime" : "bg-white/10 text-white/75"
                          }`}
                        >
                          {missionUnlocked ? "Odemčeno" : "Zamčeno"}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-mist">
                        <span className="rounded-full bg-white/5 px-3 py-2">{missionLocation.subtitle}</span>
                        <span className="rounded-full bg-white/5 px-3 py-2">{missionLocation.distance}</span>
                        <span className="rounded-full bg-white/5 px-3 py-2">{formatStopCount(missionLocation.episodes.length)}</span>
                        <span className="rounded-full bg-white/5 px-3 py-2">{formatTaskCount(taskCount)}</span>
                      </div>

                      {!missionUnlocked ? (
                        <p className="mt-3 text-sm leading-6 text-mist">
                          Odemkneš po dokončení: <span className="font-semibold text-white">{unlockRequirement?.name ?? "předchozí hry"}</span>
                        </p>
                      ) : null}

                      <div className="mt-4">
                        <Link
                          href={`/locations/${missionLocation.id}`}
                          className={`inline-flex rounded-[20px] px-4 py-3 text-sm font-semibold ${
                            missionUnlocked ? "bg-lime text-night" : "border border-white/10 bg-white/5 text-mist"
                          }`}
                        >
                          {activeRuns.some((run) => run.locationId === missionLocation.id) ? "Pokračovat" : "Otevřít hru"}
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
