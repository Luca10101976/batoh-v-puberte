"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/app-state-provider";
import type { MapLocation } from "@/lib/mock-data";
import type { GameplayEpisode } from "@/lib/gameplay-types";
import { buildLocationDetailModel } from "@/lib/location-detail-model";

// R21: zjednodušený detail hry – hero, název, krátký popis, „Začínáme“ (první zastávka), Hrát / zámek.
// Data přicházejí z DB katalogu (R20); zastávky/úkoly zůstávají ve hře, jen se tu nevypisují.

type DetailLocation = Omit<MapLocation, "episodes"> & {
  episodes: GameplayEpisode[];
  unlockRequirementName?: string | null;
};

function isExternalImage(src: string) {
  return /^https?:\/\//i.test(src);
}

export function LocationDetailScreen({ location }: { location: DetailLocation }) {
  const { state, isLocationUnlocked, setActiveMode } = useAppState();
  const router = useRouter();
  const unlocked = isLocationUnlocked(location.id, location.unlocked, location.unlockedByPlaceId ?? null);
  const model = buildLocationDetailModel({
    name: location.name,
    subtitle: location.subtitle,
    image: location.image,
    shortDescription: location.shortDescription,
    teaser: location.teaser,
    episodes: location.episodes,
    unlockedByPlaceId: location.unlockedByPlaceId ?? null,
    unlockRequirementName: location.unlockRequirementName ?? null,
    unlocked,
    registered: state.registrationCompleted
  });

  function startMission() {
    setActiveMode("solo");
    router.push(`/play/${location.id}?mode=solo`);
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <div className="glass-card relative h-72 overflow-hidden rounded-[32px]">
        {isExternalImage(model.image) ? (
          <img src={model.image} alt={model.title} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <Image
            src={model.image}
            alt={model.title}
            fill
            priority
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 896px"
          />
        )}
        <div className="absolute inset-0 flex h-full flex-col justify-end bg-gradient-to-t from-night via-night/40 to-transparent p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-sky">Hra</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{model.title}</h1>
          {model.subtitle ? <p className="mt-2 text-sm font-medium text-lime">{model.subtitle}</p> : null}
        </div>
      </div>

      <section className="glass-card p-5">
        {model.description ? <p className="text-base leading-7 text-white/88">{model.description}</p> : null}

        {model.startStopName ? (
          <p className="mt-4 text-sm text-mist">
            Začínáme: <span className="font-semibold text-white">{model.startStopName}</span>
          </p>
        ) : null}

        {model.primaryAction === "locked" ? (
          <p className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/90">
            🔒 {model.lockMessage}
          </p>
        ) : (
          <>
            <button
              onClick={startMission}
              className="mt-5 w-full rounded-[24px] bg-gradient-to-r from-coral to-[#ffb089] px-5 py-4 text-center text-base font-semibold text-white shadow-card"
            >
              {model.primaryAction === "play" ? "Hrát" : "Přihlásit a hrát"}
            </button>
            {model.primaryAction === "login_and_play" ? (
              <p className="mt-3 text-sm text-mist">Po kliknutí se otevře přihlášení hráče a teprve pak samotná hra.</p>
            ) : null}
          </>
        )}
      </section>

      <section className="glass-card p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-coral">Tisková verze do terénu</p>
        <h2 className="mt-2 text-xl font-semibold">Vytiskni si hru, ale vyhodnoť ji až v aplikaci</h2>
        <p className="mt-2 text-sm leading-6 text-mist">
          Tisková verze kopíruje stejné otázky jako hra. V terénu si na papír zapisuj odpovědi a doma je zadej do
          aplikace, aby vznikl skutečný výsledek a případné odemčení další hry.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <a
            href={`/api/export/game-content?format=print&locationId=${location.id}`}
            className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Stáhnout tiskovou verzi
          </a>
          {model.primaryAction === "play" ? (
            <Link
              href={`/play/${location.id}?mode=solo`}
              className="rounded-[20px] border border-lime/30 bg-lime/10 px-4 py-3 text-center text-sm font-semibold text-lime"
            >
              Otevřít hru v aplikaci
            </Link>
          ) : null}
        </div>
        {model.primaryAction === "login_and_play" ? (
          <p className="mt-3 text-sm leading-6 text-mist">
            Tiskovku si stáhneš i bez přihlášení. Hraní v appce se odemkne až po přihlášení hráče.
          </p>
        ) : null}
      </section>
    </main>
  );
}
