"use client";

import Link from "next/link";
import { useAppState } from "@/components/app-state-provider";
import { type MapLocation } from "@/lib/mock-data";

export function LocationDetailScreen({ location }: { location: MapLocation }) {
  const { state, isLocationUnlocked, setActiveMode } = useAppState();
  const unlocked = isLocationUnlocked(location.id, location.unlocked);
  const joinedCount = state.squadMembers.filter((member) => member.joined).length;

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <div
        className="glass-card h-72 overflow-hidden rounded-[32px] bg-cover bg-center"
        style={{ backgroundImage: `url(${location.image})` }}
      >
        <div className="flex h-full flex-col justify-end bg-gradient-to-t from-night via-night/40 to-transparent p-5">
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
              Dokončeno
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-base leading-7 text-white/88">{location.introStory}</p>
        <p className="mt-3 text-base leading-7 text-white/88">{location.story}</p>
      </section>

      <section className="glass-card p-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-sm text-mist">Vzdálenost</div>
            <div className="mt-1 font-semibold">{location.distance}</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-sm text-mist">Délka</div>
            <div className="mt-1 font-semibold">{location.duration}</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-sm text-mist">Obtížnost</div>
            <div className="mt-1 font-semibold">{location.difficulty}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {location.vibe.map((item) => (
            <span key={item} className="rounded-full bg-white/5 px-3 py-2 text-xs text-mist">
              {item}
            </span>
          ))}
        </div>
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
          ))}
        </div>
      </section>

      <section className="glass-card p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-lime">Bezpečné hraní</p>
        <div className="mt-3 rounded-[24px] border border-lime/20 bg-lime/10 p-4">
          <p className="text-sm font-medium text-white">{location.areaHint}</p>
          <p className="mt-2 text-sm leading-6 text-mist">
            Při startu hry běží bezpečnostní check-in. Pokud je aktivní rodičovský dohled, rodiči přijde e-mail.
          </p>
        </div>
      </section>

      <section className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Skupinová výprava</p>
            <h2 className="mt-2 text-xl font-semibold">{state.squadName}</h2>
          </div>
          <div className="rounded-full bg-white/5 px-3 py-2 text-xs text-mist">{joinedCount} potvrzení</div>
        </div>
        <p className="mt-3 text-sm leading-6 text-mist">
          Body se připíšou všem potvrzeným členům skupiny, kteří byli ve výpravě před startem.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`/play/${location.id}?mode=solo`}
          onClick={() => setActiveMode("solo")}
          className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 text-center text-base font-semibold text-white"
        >
          Hrát sám
        </Link>
        <Link
          href={`/play/${location.id}?mode=group`}
          onClick={() => setActiveMode("group")}
          className="rounded-[24px] bg-lime px-5 py-4 text-center text-base font-semibold text-night"
        >
          Hrát se skupinou
        </Link>
      </div>
    </main>
  );
}
