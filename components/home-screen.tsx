"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CitySelector } from "@/components/city-selector";
import { useAppState } from "@/components/app-state-provider";
import { buildResumeMissionCard, type ResumeMissionCard } from "@/lib/home-resume";
import { locations, type MapLocation } from "@/lib/mock-data";
import { getUnlockRequirement } from "@/lib/location-unlock";
import type { GameplayEpisode } from "@/lib/gameplay-types";
import { getSupabaseBrowserClient } from "@/lib/supabase";

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
  const [resumeCard, setResumeCard] = useState<ResumeMissionCard | null>(null);
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

  useEffect(() => {
    let cancelled = false;

    async function hydrateResumeMission() {
      const activeMission = state.activeMission;
      if (!supabase || !state.registrationCompleted || !state.profileCode || !activeMission?.locationId) {
        if (!cancelled) {
          setResumeCard(null);
        }
        return;
      }

      const location = publishedLocations.find((item) => item.id === activeMission.locationId);
      if (!location) {
        if (!cancelled) {
          setResumeCard(null);
        }
        return;
      }

      const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      if (!accessToken) {
        if (!cancelled) {
          setResumeCard(null);
        }
        return;
      }

      const response = await fetch("/api/game/location-progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          profileCode: state.profileCode,
          locationId: location.id
        })
      }).catch(() => null);

      if (!response?.ok) {
        if (!cancelled) {
          setResumeCard(null);
        }
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | {
            task_progress?: Array<{ task_id: string; status: "correct" | "wrong" | "unknown"; attempts: number }>;
            location?: { status?: "in_progress" | "completed" | null };
          }
        | null;

      const nextResumeCard = buildResumeMissionCard(location, payload);
      if (!cancelled) {
        setResumeCard(nextResumeCard);
      }
    }

    void hydrateResumeMission();

    return () => {
      cancelled = true;
    };
  }, [publishedLocations, state.activeMission, state.profileCode, state.registrationCompleted, supabase]);

  return (
    <main className="flex flex-1 flex-col gap-6 pb-24">
      {resumeCard ? (
        <section className="glass-card border-lime/30 bg-lime/10 p-4 sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.24em] text-lime">Pokračovat ve hře</p>
              <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{resumeCard.missionName}</h2>
              <p className="mt-2 text-base font-semibold text-white">{resumeCard.stopName}</p>
              <p className="mt-1 text-sm leading-6 text-mist">{resumeCard.taskLabel}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-mist">
                <span className="rounded-full bg-white/8 px-3 py-2">{resumeCard.progressText}</span>
                <span className="rounded-full bg-lime/14 px-3 py-2 text-lime">{resumeCard.progressPercent}% hotovo</span>
              </div>
            </div>
            <Link
              href={resumeCard.href}
              className="inline-flex min-h-12 items-center justify-center rounded-[22px] bg-lime px-6 py-3 text-base font-bold text-night"
            >
              Pokračovat
            </Link>
          </div>
        </section>
      ) : null}

      <section className="glass-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Vybrané město</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">{state.city}</h2>
            <p className="mt-2 text-sm font-semibold text-lime">
              {state.city} · {cityLocations.length}{" "}
              {cityLocations.length === 1 ? "hra" : cityLocations.length >= 2 && cityLocations.length <= 4 ? "hry" : "her"}
            </p>
            <p className="mt-2 text-sm text-mist">Vyber si hru, která tě láká nejvíc. Zamčené hry se odemykají postupně.</p>
          </div>
          <CitySelector cities={publishedCities} />
        </div>
      </section>

      <section className="glass-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-coral">Přehled všech her</p>
            <h2 className="mt-2 text-xl font-semibold">
              {cityLocations.length === 0
                ? `Hry v ${state.city}`
                : cityLocations.length === 1
                  ? `1 hra v ${state.city}`
                  : cityLocations.length >= 2 && cityLocations.length <= 4
                    ? `${cityLocations.length} hry v ${state.city}`
                    : `${cityLocations.length} her v ${state.city}`}
            </h2>
            <p className="mt-2 text-sm leading-6 text-mist">
              Tady je celý katalog her v tomhle městě. Nic dalšího není schované mimo tenhle výběr.
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
            Hry si můžeš projít hned. Přihlášení hráče se otevře až ve chvíli, kdy budeš chtít opravdu hrát.
          </p>
        ) : null}

        {cityLocations.length === 0 ? (
          <div className="mt-5 rounded-2xl bg-white/5 p-4 text-sm text-mist">
            Pro tohle město zatím nemáme připravenou žádnou hru.
          </div>
        ) : (
          <div className="mt-5 grid gap-4">
            {cityLocations.map((missionLocation) => {
              const missionUnlocked = isLocationUnlocked(missionLocation.id, missionLocation.unlocked);
              const unlockRequirement = getUnlockRequirement(missionLocation, locations);
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
                          Otevřít hru
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
