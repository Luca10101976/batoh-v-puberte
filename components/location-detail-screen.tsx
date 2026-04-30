"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/app-state-provider";
import { locations, type MapLocation } from "@/lib/mock-data";
import { getUnlockRequirement } from "@/lib/location-unlock";
import type { GameplayEpisode } from "@/lib/gameplay-types";

type DetailLocation = Omit<MapLocation, "episodes"> & { episodes: GameplayEpisode[] };

export function LocationDetailScreen({ location }: { location: DetailLocation }) {
  const { state, isLocationUnlocked, setActiveMode } = useAppState();
  const router = useRouter();
  const unlocked = isLocationUnlocked(location.id, location.unlocked);
  const completed = state.completedLocationIds.includes(location.id);
  const unlockRequirement = getUnlockRequirement(location, locations);
  const canUsePlayerFeatures = state.registrationCompleted;

  function startMission() {
    setActiveMode("solo");
    router.push(`/play/${location.id}?mode=solo`);
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <div className="glass-card relative h-72 overflow-hidden rounded-[32px]">
        <Image
          src={location.image}
          alt={location.name}
          fill
          priority
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 896px"
        />
        <div className="absolute inset-0 flex h-full flex-col justify-end bg-gradient-to-t from-night via-night/40 to-transparent p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-sky">Lokace</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{location.name}</h1>
          <p className="mt-2 text-sm font-medium text-lime">{location.subtitle}</p>
          <p className="mt-2 max-w-[28ch] text-sm leading-6 text-mist">{location.teaser}</p>
        </div>
      </div>

      <section className="glass-card p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.24em] text-coral">Příběh mise</p>
          {unlocked ? (
            <span className="rounded-full bg-lime/12 px-3 py-2 text-xs font-semibold text-lime">
              {completed ? "Dokončeno" : "Odemčeno"}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-base leading-7 text-white/88">{location.introStory}</p>
        <p className="mt-3 text-base leading-7 text-white/88">{location.story}</p>
        {!unlocked ? (
          <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/90">
            Odemkneš po dokončení: <span className="font-semibold">{unlockRequirement?.name ?? "předchozího místa"}</span>
          </p>
        ) : null}
      </section>

      <section className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title">Epizody výpravy</h2>
          </div>
          <div className="rounded-2xl bg-white/5 px-4 py-3 text-right">
            <div className="text-xl font-semibold">{location.episodes.length}</div>
            <div className="text-xs text-mist">zastavení</div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {location.episodes.map((episode, index) => (
            unlocked && canUsePlayerFeatures ? (
              <Link
                key={episode.id}
                href={`/play/${location.id}?episode=${index + 1}`}
                className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-lime/40 hover:bg-white/10"
              >
                <div className="text-xs uppercase tracking-[0.18em] text-mist">Zastavení {index + 1}</div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="font-medium">{episode.name}</div>
                  <span className="text-xs text-lime">Otevřít</span>
                </div>
                <div className="mt-1 text-sm text-mist">{episode.tasks.length} úkolů a jedna stopa</div>
              </Link>
            ) : (
              <div key={episode.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 opacity-75">
                <div className="text-xs uppercase tracking-[0.18em] text-mist">Zastavení {index + 1}</div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="font-medium">{episode.name}</div>
                  <span className="text-xs text-mist">
                    {unlocked ? "Otevře se po přihlášení" : "Zamčeno"}
                  </span>
                </div>
                <div className="mt-1 text-sm text-mist">{episode.tasks.length} úkolů a jedna stopa</div>
              </div>
            )
          ))}
        </div>
      </section>

      <section className="glass-card p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-lime">Bezpečné hraní</p>
        <div className="mt-3 rounded-[24px] border border-lime/20 bg-lime/10 p-4">
          <p className="text-sm font-medium text-white">{location.areaHint}</p>
          <p className="mt-2 text-sm leading-6 text-mist">Hraj bezpečně a drž se trasy mise.</p>
        </div>
      </section>

      {canUsePlayerFeatures ? (
        <section className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-coral">Tisková verze do terénu</p>
          <h2 className="mt-2 text-xl font-semibold">Vytiskni si misi, ale vyhodnoť ji až v aplikaci</h2>
          <p className="mt-2 text-sm leading-6 text-mist">
            Tisková verze kopíruje stejné otázky jako hra. V terénu si na papír zapisuj odpovědi a doma je zadej do
            aplikace, aby vznikl skutečný výsledek, body i případné odemčení dalšího místa.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <a
              href={`/api/export/game-content?format=print&locationId=${location.id}`}
              className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white"
            >
              Stáhnout tiskovou verzi
            </a>
            <Link
              href={`/play/${location.id}?mode=solo`}
              className="rounded-[20px] border border-lime/30 bg-lime/10 px-4 py-3 text-center text-sm font-semibold text-lime"
            >
              Otevřít misi v aplikaci
            </Link>
          </div>
        </section>
      ) : (
        <section className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-coral">Jak to funguje</p>
          <h2 className="mt-2 text-xl font-semibold">Místo si můžeš projít hned, hru spustíš až po přihlášení</h2>
          <p className="mt-2 text-sm leading-6 text-mist">
            Jako návštěvník si můžeš prohlédnout trasu i detail mise. Body, progres a samotné hraní se odemknou až po
            přihlášení hráče.
          </p>
        </section>
      )}

      <button
        onClick={() => (unlocked ? startMission() : undefined)}
        disabled={!unlocked}
        className="rounded-[24px] bg-gradient-to-r from-coral to-[#ffb089] px-5 py-4 text-center text-base font-semibold text-white shadow-card disabled:cursor-not-allowed disabled:opacity-50"
      >
        {canUsePlayerFeatures ? "Hrát misi" : "Přihlásit a hrát"}
      </button>
      {!canUsePlayerFeatures && unlocked ? (
        <p className="text-sm text-mist">Po kliknutí se otevře přihlášení hráče a teprve pak samotná hra.</p>
      ) : null}
      {!unlocked ? (
        <p className="text-sm text-mist">
          Tohle místo je zatím zamčené. Nejdřív dokonči: {unlockRequirement?.name ?? "předchozí místo"}.
        </p>
      ) : null}
    </main>
  );
}
