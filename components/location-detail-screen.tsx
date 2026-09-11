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
    detailText: location.detailText ?? null,
    startPlaceName: location.startPlaceName ?? null,
    startLat: location.startLat ?? null,
    startLng: location.startLng ?? null,
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
      // R44: hra se spouští vždycky stejně. Bez hráče se jen vloží krok navíc –
      // brána se otevře nad herní adresou, po registraci se sem hráč vrátí
      // a parametr start=1 znamená „výpravu je pořád potřeba teprve založit“.
      // Dřív se místo toho otevřela rovnou /play/…, čímž se obešlo jak založení
      // výpravy, tak úvodní obrazovka ZAČÍNÁME.
      router.push(`/play/${location.id}?mode=solo&start=1`);
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
          <h1 className="text-3xl font-bold tracking-tight">{model.title}</h1>
          {model.subtitle ? <p className="mt-2 text-sm font-medium text-lime">{model.subtitle}</p> : null}
        </div>
      </div>

      <section className="glass-card p-5">
        {model.description ? <p className="text-base leading-7 text-white/88">{model.description}</p> : null}

        {/* R44: hráč potřebuje vědět, kam má fyzicky přijít. Místo srazu je vlastnost
            hry a nemusí být totožné s první zastávkou. Mapu Traki nekreslí, odkazuje
            do běžné mapové služby. */}
        {model.startPlaceName || model.startMapUrl ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Kde začínáme</p>
            {model.startPlaceName ? (
              <p className="mt-2 text-base font-semibold text-white">{model.startPlaceName}</p>
            ) : null}
            {model.startMapUrl ? (
              <a
                href={model.startMapUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex rounded-[18px] border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white"
              >
                Ukázat na mapě
              </a>
            ) : null}
          </div>
        ) : model.startStopName ? (
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

      {/* R44: tisk je alternativa, ne hlavní cesta. Dřív zabíral na detailu dvakrát
          víc místa než samotná hra, takže je teď sbalený a rozbalí se na vyžádání.
          Druhé CTA „Otevřít hru v aplikaci“ zmizelo – do digitální hry vede jedna
          cesta, hlavní tlačítko nahoře. Číslování kroků nese seznam, ne text. */}
      <section className="glass-card p-5">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-4">
            <Image
              src={illustrationSrc("blok")}
              alt=""
              width={56}
              height={56}
              className="h-12 w-12 shrink-0 object-contain"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-white">Chceš hrát s papírem?</span>
              <span className="mt-1 block text-sm leading-6 text-mist">Stáhni si tiskovou verzi hry.</span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-lime group-open:hidden">Tisková verze</span>
            <span className="hidden shrink-0 text-sm font-semibold text-mist group-open:block">Skrýt</span>
          </summary>

          <p className="mt-4 text-sm leading-6 text-mist">
            Sešit má stejné otázky jako hra, takže se hodí, když nechceš mít venku v ruce telefon.
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-white/90 marker:font-semibold marker:text-white">
            <li>
              <span className="font-semibold text-white">Vytiskni si sešit</span> a vezmi ho ven.
            </li>
            <li>
              <span className="font-semibold text-white">Venku piš odpovědi rovnou do papíru.</span> Co nevíš, nech
              prázdné.
            </li>
            <li>
              <span className="font-semibold text-white">Doma je přepiš do téhle hry.</span> Body, nápovědy i konec
              příběhu pak fungují úplně stejně jako při hraní v aplikaci.
            </li>
          </ol>
          <a
            href={`/api/export/game-content?format=pdf&locationId=${location.id}`}
            className="mt-4 inline-flex rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Stáhnout tiskové PDF
          </a>
        </details>
      </section>
    </main>
  );
}
