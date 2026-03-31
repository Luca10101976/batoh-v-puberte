import Link from "next/link";
import { type MapLocation } from "@/lib/mock-data";

export function LocationPin({ location }: { location: MapLocation }) {
  return (
    <Link
      href={`/locations/${location.id}`}
      className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: `${location.map.x}%`, top: `${location.map.y}%` }}
    >
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold ${
          location.unlocked
            ? "border-lime/40 bg-lime text-night"
            : "border-white/15 bg-white/10 text-white"
        }`}
      >
        {location.unlocked ? "✓" : "?"}
      </div>
      <span className="mt-2 rounded-full bg-night/85 px-3 py-1 text-[11px] text-white">
        {location.name}
      </span>
    </Link>
  );
}
