export function HeroCard() {
  return (
    <section className="glass-card overflow-hidden p-5">
      <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(180,255,98,0.16),rgba(82,200,255,0.14),rgba(255,138,91,0.16))] p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-lime">Pan Batoh v pubertě</p>
        <h1 className="mt-3 max-w-[12ch] text-3xl font-bold leading-tight tracking-tight">
          Město se mění na dobrodružství.
        </h1>
        <p className="mt-3 max-w-[30ch] text-sm leading-6 text-mist">
          Vyber lokaci, splň úkoly na místě a odemkni další příběh do své sbírky.
        </p>
      </div>
    </section>
  );
}
