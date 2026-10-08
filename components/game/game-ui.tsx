/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import Image from "next/image";
import type { GameplayBubble } from "@/lib/gameplay-types";
import { illustrationSrc } from "@/lib/illustrations";

// R54: kreslicí kusy herní obrazovky. Používá je hra (PlayScreen) i průchod
// hrou v Mozku – náhled tak nemůže ukazovat nic jiného, než co uvidí hráč.
// Žádný stav, žádná síť, žádné body: jen to, jak co vypadá.

export function isExternalImage(src: string) {
  return /^https?:\/\//i.test(src);
}

/** R51/R52: komiksové bubliny postav. Prázdný seznam nevykreslí nic. */
export function Bubliny({ bubliny }: { bubliny?: GameplayBubble[] }) {
  if (!bubliny || bubliny.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3">
      {bubliny.map((bublina, index) => (
        <section key={`${bublina.name}-${index}`} aria-label={`${bublina.name} říká`} className="flex items-end gap-3 px-1">
          {bublina.image ? (
            <img
              src={bublina.image}
              alt={bublina.name}
              className="h-20 w-20 shrink-0 object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)] sm:h-24 sm:w-24"
            />
          ) : null}
          <div className="relative mb-4 min-w-0 flex-1 rounded-[22px] bg-white px-4 py-3 text-night shadow-[0_14px_40px_rgba(0,0,0,0.25)]">
            {bublina.image ? (
              <span aria-hidden="true" className="absolute -left-1.5 bottom-5 h-4 w-4 rotate-45 rounded-[3px] bg-white" />
            ) : null}
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-night/55">{bublina.name}</p>
            <p className="mt-1 whitespace-pre-line text-[15px] leading-6">{bublina.text}</p>
          </div>
        </section>
      ))}
    </div>
  );
}

/** Úvod hry „Začínáme“. Tlačítko dodá volající. */
export function GameIntroCard({
  image,
  name,
  introStory,
  firstStopName,
  action
}: {
  image: string;
  name: string;
  introStory?: string;
  firstStopName?: string;
  action: ReactNode;
}) {
  return (
    <section className="glass-card overflow-hidden p-0">
      <div className="relative h-56 w-full">
        {image ? (
          isExternalImage(image) ? (
            <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <Image src={image} alt="" fill priority className="object-cover" sizes="100vw" />
          )
        ) : null}
      </div>
      <div className="p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-lime">Začínáme</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
        {introStory ? <p className="mt-4 whitespace-pre-line text-sm leading-7 text-mist">{introStory}</p> : null}
        {firstStopName ? (
          <p className="mt-4 text-sm text-white/90">
            První zastávka: <span className="font-semibold">{firstStopName}</span>
          </p>
        ) : null}
        {action}
      </div>
    </section>
  );
}

type StopForArrival = {
  name: string;
  intro: string;
  background: string;
  illustrationImage?: string;
  illustrationImageAlt?: string;
  bubbles?: GameplayBubble[];
};

/**
 * Hlavička zastavení a – při příchodu – jeho uvedení, historie, fotka a bubliny.
 * R44: u dalších úkolů téhož místa se kontext neopakuje (showContext=false).
 */
export function StopArrival({ locationName, stop, showContext }: { locationName: string; stop: StopForArrival; showContext: boolean }) {
  return (
    <>
      <section className="glass-card p-4 sm:p-5">
        <div>
          <h1 className="text-2xl font-bold">{locationName}</h1>
          <p className="mt-2 text-base font-semibold text-white">{stop.name}</p>
        </div>

        {showContext ? (
          <div className="mt-3 rounded-[28px] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line text-sm leading-6 text-white/90 sm:leading-7">{stop.intro}</p>

                {stop.background ? (
                  <div className="mt-3 rounded-[24px] border border-white/10 bg-night/35 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-coral">Trocha nudné historie</p>
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-mist">{stop.background}</p>
                  </div>
                ) : null}
              </div>

              {stop.illustrationImage ? (
                <figure className="mx-auto w-full max-w-[120px] overflow-hidden rounded-[24px] border border-white/10 bg-white/5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:max-w-[160px] lg:mx-0 lg:w-[180px] lg:flex-none">
                  {isExternalImage(stop.illustrationImage) ? (
                    <img
                      src={stop.illustrationImage}
                      alt={stop.illustrationImageAlt || `Ilustrační foto k zastavení ${stop.name}`}
                      className="aspect-square w-full object-cover object-center"
                    />
                  ) : (
                    <Image
                      src={stop.illustrationImage}
                      alt={stop.illustrationImageAlt || `Ilustrační foto k zastavení ${stop.name}`}
                      width={720}
                      height={720}
                      className="aspect-square w-full object-cover object-center"
                    />
                  )}
                </figure>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {/* R51/R52: bubliny při příchodu na zastavení – jen spolu s kontextem místa. */}
      {showContext ? <Bubliny bubliny={stop.bubbles} /> : null}
    </>
  );
}

/** Název, zadání a obrázek úkolu. Odpovídací část dodá volající. */
export function TaskPrompt({
  task
}: {
  task: { title: string; content: string; illustrationImage?: string; illustrationImageAlt?: string };
}) {
  return (
    <>
      {/* R44: štítek typu úkolu („Výběr“, „Otázka“) hráči nic neříká. */}
      <h2 className="text-2xl font-semibold">{task.title}</h2>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-mist">{task.content}</p>
      {task.illustrationImage ? (
        <figure className="mt-4 mx-auto w-full max-w-[280px] overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          {isExternalImage(task.illustrationImage) ? (
            <img
              src={task.illustrationImage}
              alt={task.illustrationImageAlt || `Ilustrační foto k úkolu ${task.title}`}
              className="aspect-square w-full object-cover object-center"
            />
          ) : (
            <Image
              src={task.illustrationImage}
              alt={task.illustrationImageAlt || `Ilustrační foto k úkolu ${task.title}`}
              width={720}
              height={720}
              className="aspect-square w-full object-cover object-center"
            />
          )}
          <figcaption className="px-3 py-2 text-center text-xs text-mist">Ilustrační foto k úkolu</figcaption>
        </figure>
      ) : null}
    </>
  );
}

/**
 * R44: přechod říká jen to podstatné – zastávka je hotová a kam se jde dál.
 * Autorský text se zobrazí, když existuje; chybějící se ničím nenahrazuje.
 */
export function StopTransitionCard({ toStopName, transitionText, action }: { toStopName: string; transitionText?: string; action: ReactNode }) {
  const text = transitionText?.trim() || "";
  return (
    <section className="rounded-[32px] border-2 border-lime bg-lime/20 p-6 shadow-[0_0_0_1px_rgba(178,247,93,0.35),0_0_36px_rgba(178,247,93,0.2)]">
      <p className="text-sm font-bold uppercase tracking-[0.28em] text-lime">Zastávka hotová</p>
      <div className="mt-5 rounded-2xl border border-lime/40 bg-night/35 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-lime">Pokračuješ na</p>
        <p className="mt-1 text-3xl font-bold text-white">{toStopName}</p>
      </div>
      {text ? (
        <div className="mt-4 flex items-start gap-3">
          <Image
            src={illustrationSrc("rozcestnik")}
            alt=""
            width={72}
            height={72}
            className="h-[72px] w-[72px] shrink-0 object-contain"
          />
          <p className="whitespace-pre-line text-base leading-7 text-white/90">{text}</p>
        </div>
      ) : null}
      {action}
    </section>
  );
}

/** Závěr hry: konfety, titulek, dialog v bublinách, závěrečný text a zpráva pro hráče. */
export function EndingStory({
  eyebrow,
  title,
  bubbles,
  story,
  playerMessage
}: {
  eyebrow: string;
  title: string;
  bubbles?: GameplayBubble[];
  story?: string;
  playerMessage?: string;
}) {
  return (
    <>
      <section className="glass-card p-5">
        <div className="flex justify-center">
          <Image src={illustrationSrc("konfety")} alt="" width={140} height={140} className="h-[140px] w-[140px] object-contain" />
        </div>
        <p className="mt-2 text-xs uppercase tracking-[0.24em] text-coral">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
        {/* R52: závěr jako sled bublin – dialog postav před závěrečným textem. */}
        <Bubliny bubliny={bubbles} />
        {/* R50: texty z Mozku zachovávají odřádkování. */}
        {story ? <p className="mt-4 whitespace-pre-line text-sm leading-7 text-mist">{story}</p> : null}
      </section>

      {playerMessage ? (
        <section className="glass-card p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-lime">Zpráva pro hráče</p>
          <p className="mt-3 whitespace-pre-line text-base leading-7 text-white/90">{playerMessage}</p>
        </section>
      ) : null}
    </>
  );
}
