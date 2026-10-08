import Link from "next/link";
import type { MissionWarning } from "@/lib/mission-warnings";

// R55: co ve hře chybí. Nikdy neblokuje publikaci – to dělá jen kontrola
// dohratelnosti. Je to kontrolní seznam, ne chyba.
export function MissionWarnings({ warnings }: { warnings: MissionWarning[] }) {
  if (warnings.length === 0) {
    return (
      <section className="rounded-2xl border border-lime/30 bg-lime/10 px-4 py-3 text-sm text-lime">
        ✓ Ve hře nic nechybí – všechna zastavení mají fotku, popis i přechod.
      </section>
    );
  }
  return (
    <section className="glass-card p-5">
      <h2 className="section-title">Co ještě doladit</h2>
      <p className="mt-1 text-sm text-mist">Publikaci to nebrání – jen ať o tom víš.</p>
      <ul className="mt-4 space-y-3">
        {warnings.map((w) => (
          <li key={w.code} className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3">
            <p className="text-sm text-amber-100">{w.text}</p>
            <p className="mt-2 flex flex-wrap gap-2">
              {w.links.map((l) => (
                <Link key={l.href + l.label} href={l.href} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-white hover:bg-white/10">
                  {l.label}
                </Link>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
