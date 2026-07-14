import Image from "next/image";

export function HeroCard() {
  return (
    <section className="glass-card overflow-hidden p-5">
      <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(180,255,98,0.16),rgba(82,200,255,0.14),rgba(255,138,91,0.16))] p-5 pr-28">
        <div className="relative z-10">
          <p className="text-xs uppercase tracking-[0.24em] text-lime">Traki na stopě tajemství</p>
          <h1 className="mt-3 max-w-[12ch] text-3xl font-bold leading-tight tracking-tight">
            Město se mění na dobrodružství.
          </h1>
          <p className="mt-3 max-w-[30ch] text-sm leading-6 text-mist">
            Vyber lokaci, splň úkoly na místě a odemkni další příběh do své sbírky.
          </p>
        </div>
        <Image
          src="/icons/traki-transparent.png"
          alt="Traki"
          width={144}
          height={144}
          priority
          className="pointer-events-none absolute -bottom-3 -right-6 h-36 w-36 object-contain drop-shadow-[0_18px_34px_rgba(0,0,0,0.35)]"
        />
      </div>
    </section>
  );
}
