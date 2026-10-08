"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// R53: stálá hlavička Mozku. Dřív layout jen vracel obsah – ze zastavení se do
// seznamu her šlo jen tlačítky „Zpět“ přes dvě stránky. Teď jsou Hry a Města
// vždy nahoře a stránky pod tím ukazují drobečkovou cestu.

const ODKAZY = [
  { href: "/mozek", label: "Hry", aktivni: (p: string) => p === "/mozek" || p.startsWith("/mozek/missions") || p.startsWith("/mozek/stops") },
  { href: "/mozek/cities", label: "Města", aktivni: (p: string) => p.startsWith("/mozek/cities") }
];

export function MozekHeader() {
  const pathname = usePathname() ?? "";
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-night/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/mozek" className="text-sm font-bold uppercase tracking-[0.24em] text-sky">
          Mozek
        </Link>
        <nav aria-label="Hlavní" className="flex items-center gap-1">
          {ODKAZY.map((odkaz) => {
            const aktivni = odkaz.aktivni(pathname);
            return (
              <Link
                key={odkaz.href}
                href={odkaz.href}
                aria-current={aktivni ? "page" : undefined}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                  aktivni ? "bg-white/10 text-white" : "text-mist hover:bg-white/5 hover:text-white"
                }`}
              >
                {odkaz.label}
              </Link>
            );
          })}
          <Link href="/" className="ml-2 rounded-xl px-3 py-2 text-sm text-mist hover:bg-white/5 hover:text-white">
            Web ↗
          </Link>
        </nav>
      </div>
    </header>
  );
}
