"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppState } from "@/components/app-state-provider";
import type { MapLocation } from "@/lib/gameplay-types";
import type { PublicGameplayEpisode } from "@/lib/gameplay-types";
import { buildLocationDetailModel } from "@/lib/location-detail-model";
import { illustrationSrc } from "@/lib/illustrations";

// R21: zjednodušený detail hry – hero, název, krátký popis, „Začínáme“ (první zastávka), Hrát / zámek.
// Data přicházejí z DB katalogu (R20); zastávky/úkoly zůstávají ve hře, jen se tu nevypisují.

// R26: závěr hry se do prohlížeče neposílá, detail ho nepotřebuje.
type DetailLocation = Omit<MapLocation, "episodes" | "endingTitle" | "endingStory" | "playerMessage"> & {
  episodes: PublicGameplayEpisode[];
  unlockRequirementName?: string | null;
};

function isExternalImage(src: string) {
  return /^https?:\/\//i.test(src);
}

export function LocationDetailScreen({ location }: { location: DetailLocation }) {
  const { state, isLocationUnlocked, setActiveMode, activeRuns, startRun } = useAppState();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const hasActiveRun = activeRuns.some((run) => run.locationId === location.id);
  const completed = state.completedLocationIds.includes(location.id);
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
    registered: state.registrationCompleted,
    hasActiveRun,
    completed
  });

  // R24: jediná operace zahájení. Hrát, Pokračovat i Hrát znovu volají totéž –
  // server najde běžící výpravu, a když žádná není, založí ji. Teprve pak se
  // otevře herní obrazovka, takže hra je rozehraná ještě před první odpovědí.
  async function startMission() {
    if (starting) {
      return;
    }
    setActiveMode("solo");
    if (!state.registrationCompleted) {
      // R44: návštěvník bez hráče míří na hru. Brána se otevře až tady a podle
      // cílové adresy ví, kam ho po vytvoření nebo obnovení hráče vrátit –
      // nekončí na domovské stránce a nemusí hru hledat znovu.
      router.push(`/play/${location.id}?mode=solo`);
      return;
    }
    setStarting(true);
    // R25: úvodní příběh patří ke skutečnému začátku výpravy. startRun vrací,
    // jestli výprava právě vznikla; při pokračování se intro nezobrazí.
    const started = await startRun(location.id);
    setStarting(false);
    router.push(`/play/${location.id}?mode=solo${started.created ? "&intro=1" : ""}`);
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
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <Image
              src={illustrationSrc("zamek")}
              alt=""
              width={72}
              height={72}
              className="h-[72px] w-[72px] shrink-0 object-contain"
            />
            <p className="text-sm text-white/90">{model.lockMessage}</p>
          </div>
        ) : (
          <>
            <button
              onClick={startMission}
              disabled={starting}
              className="mt-5 w-full rounded-[24px] bg-gradient-to-r from-coral to-[#ffb089] px-5 py-4 text-center text-base font-semibold text-white shadow-card disabled:opacity-70"
            >
              {starting ? "Otevírám hru…" : model.primaryLabel}
            </button>
            {model.primaryAction === "replay" ? (
              <p className="mt-3 text-sm text-mist">Tuhle hru už máš dokončenou. Nejlepší výsledek si novým průchodem nezhoršíš.</p>
            ) : null}
          </>
        )}
      </section>

      <section className="glass-card p-5">
        <div className="flex items-start gap-4">
          <Image
            src={illustrationSrc("blok")}
            alt=""
            width={72}
            height={72}
            className="h-14 w-14 shrink-0 object-contain sm:h-[72px] sm:w-[72px]"
          />
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-coral">Tisková verze do terénu</p>
            <h2 className="mt-2 text-xl font-semibold">Hraj podle papíru, vyhodnoť v aplikaci</h2>
          </div>
        </div>
        <p className="mt-2 text-sm leading-6 text-mist">
          Sešit má stejné otázky jako hra, takže se hodí, když nechceš mít venku v ruce telefon.
        </p>
        {/* R27: papírová cesta je tři kroky a končí v normální hře. Žádná zvláštní
            papírová obrazovka ani ruční počítání bodů. */}
        <ol className="mt-4 space-y-2 text-sm leading-6 text-white/90">
          <li>
            <span className="font-semibold text-white">1. Vytiskni si sešit</span> a vezmi ho ven.
          </li>
          <li>
            <span className="font-semibold text-white">2. Venku piš odpovědi rovnou do papíru.</span> Co nevíš, nech
            prázdné.
          </li>
          <li>
            <span className="font-semibold text-white">3. Doma je přepiš do téhle hry.</span> Body, nápovědy i konec
            příběhu pak fungují úplně stejně jako při hraní v aplikaci.
          </li>
        </ol>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <a
            href={`/api/export/game-content?format=pdf&locationId=${location.id}`}
            className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Stáhnout tiskové PDF
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
      </section>
    </main>
  );
}
