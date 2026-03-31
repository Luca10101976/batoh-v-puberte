"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Mapa" },
  { href: "/leaderboard", label: "Žebříček" },
  { href: "/profile", label: "Profil" }
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-[28px] border border-white/10 bg-night/85 p-2 shadow-card backdrop-blur-xl">
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-[20px] px-4 py-3 text-center text-sm font-medium transition ${
                active ? "bg-white text-night" : "text-mist"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
