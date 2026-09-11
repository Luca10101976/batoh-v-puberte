"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { CitySelector } from "@/components/city-selector";
import { useAppState } from "@/components/app-state-provider";
import { buildResumeMissionCard, type ResumeMissionCard } from "@/lib/home-resume";
import type { MapLocation } from "@/lib/gameplay-types";
import { getUnlockRequirement, isLocationUnlockedByChain } from "@/lib/location-unlock";
import type { PublicGameplayEpisode } from "@/lib/gameplay-types";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { illustrationSrc } from "@/lib/illustrations";
import { avatarSrc, resolveAvatarId } from "@/lib/avatars";

// R26: závěr hry (endingTitle/endingStory/playerMessage) se do prohlížeče neposílá.
type HomeLocation = Omit<MapLocation, "episodes" | "endingTitle" | "endingStory" | "playerMessage"> & {
  episodes: PublicGameplayEpisode[];
  catalogOrder?: number;
  /** R37: tvar města pro větu „Hry v …“; spravuje se v Mozku. */
  cityLocative?: string;
};

function isExternalImage(src: string) {
  return /^https?:\/\//i.test(src);
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

/**
 * R37: skloňování města přichází z databáze (spravuje se v Mozku). Mapa v kódu
 * zůstala jen jako záloha pro data, která tvar ještě nemají vyplněný.
 */
function cityLocative(city: string, locatives: Record<string, string>) {
  return locatives[city] || CITY_LOCATIVE[city] || city;
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

  // R44: přihlášeného hráče poznáme podle dokončené registrace; jméno i avatar
  // bereme přesně tak, jak jsou uložené (přezdívky se neskloňují).
  const isSignedIn = state.registrationCompleted;
  const playerName = state.profile.name?.trim() || "Hráči";
  const hasCityChoice = publishedCities.length > 1;

  const cityLocatives = useMemo(() => {
    const map: Record<string, string> = {};
    for (const location of publishedLocations) {
      if (location.cityLocative) {
        map[location.city] = location.cityLocative;
      }
    }
    return map;
  }, [publishedLocations]);

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
      {/* R44: nepřihlášený návštěvník se z hlavičky dozví, co Traki je. Přihlášený
          hráč se místo toho pozná – uvidí svoji přezdívku a avatara, takže je hned
          jasné, že registrace dopadla a pod kým je přihlášený. */}
      <header className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.24em] text-lime">Traki na stopě tajemství</p>
          {isSignedIn ? (
            <>
              <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight">Ahoj, {playerName}!</h1>
              <p className="mt-2 text-sm leading-6 text-mist">Tak co dneska vypátráme?</p>
            </>
          ) : (
            <>
              <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight">
                Vyraz ven a objev tajemství, kolem kterých ostatní jen projdou.
              </h1>
              <p className="mt-2 text-sm leading-6 text-mist">Pátrej po městě, řeš úkoly a sbírej body.</p>
            </>
          )}
        </div>
        {isSignedIn ? (
          <Image
            src={avatarSrc(resolveAvatarId(state.profile.avatar))}
            alt=""
            width={112}
            height={112}
            priority
            className="pointer-events-none h-24 w-24 flex-none rounded-[24px] border border-white/10 bg-white/5 object-contain p-1 sm:h-28 sm:w-28"
          />
        ) : (
          <Image
            src="/icons/traki-transparent.png"
            alt="Traki"
            width={112}
            height={112}
            priority
            className="pointer-events-none h-24 w-24 flex-none -scale-x-100 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.35)] sm:h-28 sm:w-28"
          />
        )}
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

      {/* R44: dřív tu byly dvě orámované karty („Vybrané město“ a „Přehled všech her“),
          které říkaly skoro totéž, plus výběr města s jedinou položkou. Zůstala jedna
          hlavička. Výběr města se objeví sám, jakmile budou hry ve dvou a více městech. */}
      <section className="glass-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Image
              src={illustrationSrc("mapa")}
              alt=""
              width={80}
              height={80}
              className="h-14 w-14 shrink-0 object-contain sm:h-20 sm:w-20"
            />
            <div className="min-w-0">
              <h2 className="text-xl font-semibold">Hry v {cityLocative(state.city, cityLocatives)}</h2>
              <p className="mt-1 text-sm leading-6 text-mist">
                Vyber si hru, která tě láká nejvíc. Zamčené hry se odemykají postupně.
              </p>
            </div>
          </div>
          {hasCityChoice ? <CitySelector cities={publishedCities} /> : null}
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

              return (
                <article
                  key={missionLocation.id}
                  className={`overflow-hidden rounded-[24px] border border-white/10 bg-white/5 ${
                    missionUnlocked ? "" : "opacity-80"
                  }`}
                >
                  {/* R44: na úzkém telefonu (do 480 px) jde obrázek nahoru přes celou
                      šířku a obsah pod něj. Dřív si obrázek držel šířku vlevo a textu
                      zbyl asi 90px sloupec, ve kterém se lámal i titulek a tlačítko. */}
                  <div className="flex flex-col gap-4 p-4 min-[480px]:flex-row">
                    <div className="relative h-40 w-full flex-none overflow-hidden rounded-[20px] border border-white/10 bg-ink min-[480px]:h-28 min-[480px]:w-28 sm:min-[480px]:h-32 sm:min-[480px]:w-32">
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
                        sizes="(max-width: 479px) 100vw, 128px"
                      />
                    )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* R44: karta je minimalistická. „Odemčeno“ nemá vedle sebe s čím
                          kontrastovat, dokud je hra jediná, „Městská mise“ nic nefiltruje
                          a město už nese hlavička sekce. Počty zastavení a úkolů jsme se
                          rozhodli v katalogu nezobrazovat. „Zamčeno“ zůstává – to informaci
                          nese a doplňuje ho věta, po čem se hra odemkne. */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-xl font-bold tracking-tight text-white">{missionLocation.name}</h3>
                          <p className="mt-2 text-sm leading-6 text-white/80">{missionLocation.teaser}</p>
                        </div>
                        {missionUnlocked ? null : (
                          <span className="rounded-full bg-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/75">
                            Zamčeno
                          </span>
                        )}
                      </div>

                      {!missionUnlocked ? (
                        <p className="mt-3 text-sm leading-6 text-mist">
                          Odemkneš po dokončení: <span className="font-semibold text-white">{unlockRequirement?.name ?? "předchozí hry"}</span>
                        </p>
                      ) : null}

                      <div className="mt-4">
                        <Link
                          href={`/locations/${missionLocation.id}`}
                          className={`inline-flex w-full items-center justify-center whitespace-nowrap rounded-[20px] px-4 py-3 text-sm font-semibold min-[480px]:w-auto ${
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
