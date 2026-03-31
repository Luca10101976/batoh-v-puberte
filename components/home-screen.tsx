"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CitySelector } from "@/components/city-selector";
import { HeroCard } from "@/components/hero-card";
import { useAppState } from "@/components/app-state-provider";
import { locations, nearbyMissions } from "@/lib/mock-data";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type FriendActivityRow = {
  friend_profile_code: string;
  friend_display_name: string;
  created_at: string;
};

function formatAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));

  if (minutes < 60) {
    return `před ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `před ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  return `před ${days} d`;
}

export function HomeScreen() {
  const { state, isLocationUnlocked } = useAppState();
  const [friendFeed, setFriendFeed] = useState<FriendActivityRow[]>([]);
  const [feedLoaded, setFeedLoaded] = useState(false);
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    async function loadFriendFeed() {
      if (!supabase || !state.profileCode) {
        setFeedLoaded(true);
        return;
      }

      const { data: ownProfile } = await supabase
        .from("child_profiles")
        .select("id")
        .eq("profile_code", state.profileCode)
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (!ownProfile?.id) {
        setFriendFeed([]);
        setFeedLoaded(true);
        return;
      }

      const { data } = await supabase
        .from("child_friendships")
        .select("friend_profile_code, friend_display_name, created_at")
        .eq("child_profile_id", ownProfile.id)
        .order("created_at", { ascending: false })
        .limit(8);

      setFriendFeed((data as FriendActivityRow[]) ?? []);
      setFeedLoaded(true);
    }

    loadFriendFeed();
  }, [state.profileCode, supabase]);

  const unlockedCount = locations.filter((location) =>
    isLocationUnlocked(location.id, location.unlocked)
  ).length;
  const score = unlockedCount * 120;
  const primaryLocation = locations[0];
  const mapDelta = 0.0075;
  const mapUrl = primaryLocation
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${primaryLocation.lng - mapDelta}%2C${
        primaryLocation.lat - mapDelta
      }%2C${primaryLocation.lng + mapDelta}%2C${primaryLocation.lat + mapDelta}&layer=mapnik&marker=${
        primaryLocation.lat
      }%2C${primaryLocation.lng}`
    : "";

  return (
    <main className="flex flex-1 flex-col gap-6 pb-24">
      <HeroCard />

      <section className="glass-card overflow-hidden p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Město</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{state.city}</h1>
          </div>
          <CitySelector />
        </div>

        <div className="relative h-[360px] overflow-hidden rounded-[24px] border border-white/10 bg-ink">
          {primaryLocation ? (
            <iframe
              title="Mapa lokace"
              src={mapUrl}
              className="h-full w-full"
              loading="lazy"
            />
          ) : null}

          {primaryLocation ? (
            <Link
              href={`/locations/${primaryLocation.id}`}
              className="absolute left-4 top-4 z-10 rounded-full border border-white/10 bg-night/90 px-4 py-2 text-sm font-semibold text-white backdrop-blur"
            >
              {primaryLocation.name}
            </Link>
          ) : null}

          <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 rounded-2xl border border-white/10 bg-night/90 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.22em] text-mist">Tvoje skóre</p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-lg font-semibold text-white">{unlockedCount}</div>
                <div className="text-xs text-mist">Odemčeno</div>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-lg font-semibold text-white">{score}</div>
                <div className="text-xs text-mist">Body</div>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-lg font-semibold text-white">
                  {state.activeMode === "group" ? "Parta" : "Solo"}
                </div>
                <div className="text-xs text-mist">Režim</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="glass-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-coral">Blízko tebe</p>
            <h2 className="mt-2 text-xl font-semibold">Vyrazte ven ještě dnes</h2>
          </div>
          <div className="rounded-full bg-coral/12 px-3 py-2 text-xs font-semibold text-coral">
            Poloha zapnutá
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {nearbyMissions.map((mission) => (
            <Link
              key={mission.name}
              href={`/locations/${mission.locationId}`}
              className="block rounded-[24px] border border-white/10 bg-white/5 p-4 transition hover:border-lime/40 hover:bg-white/10"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{mission.name}</h3>
                  <p className="mt-1 text-sm text-mist">{mission.status}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-lime">{mission.distance}</div>
                  <div className="text-xs text-mist">{mission.boost}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Dnes doporučené lokace</h2>
          <Link href="/leaderboard" className="text-sm text-lime">
            Žebříček
          </Link>
        </div>

        {locations.map((location) => {
          const unlocked = isLocationUnlocked(location.id, location.unlocked);

          return (
            <Link
              key={location.id}
              href={`/locations/${location.id}`}
              className="glass-card flex items-center gap-4 p-3"
            >
              <div
                className="h-20 w-20 rounded-[20px] bg-cover bg-center"
                style={{ backgroundImage: `url(${location.image})` }}
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{location.name}</h3>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                      unlocked ? "bg-lime/15 text-lime" : "bg-white/8 text-mist"
                    }`}
                  >
                    {unlocked ? "Odemčeno" : "Připraveno"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-mist">{location.teaser}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-mist">
                  <span className="rounded-full bg-white/5 px-2 py-1">{location.distance}</span>
                  <span className="rounded-full bg-white/5 px-2 py-1">{location.duration}</span>
                  <span className="rounded-full bg-white/5 px-2 py-1">{location.difficulty}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Pohyb kamarádů</p>
            <h2 className="mt-2 text-xl font-semibold">Co se děje kolem tebe</h2>
          </div>
          <Link href="/profile" className="text-sm text-lime">
            Můj profil
          </Link>
        </div>

        <div className="mt-4 space-y-3">
          {!feedLoaded ? (
            <div className="rounded-2xl bg-white/5 p-4 text-sm text-mist">Načítám pohyb kamarádů…</div>
          ) : friendFeed.length === 0 ? (
            <div className="rounded-2xl bg-white/5 p-4 text-sm text-mist">
              Zatím tu nic není. Jakmile si přidáš kamarády, uvidíš jejich aktuální pohyb.
            </div>
          ) : (
            friendFeed.map((item) => (
              <div
                key={`${item.friend_profile_code}-${item.created_at}`}
                className="flex items-center gap-3 rounded-2xl bg-white/5 p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-xs font-semibold">
                  {item.friend_display_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{item.friend_display_name}</span> se přidal(a) do party
                  </p>
                  <p className="text-xs text-mist">{formatAgo(item.created_at)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
