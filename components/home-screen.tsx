"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type IncomingFriendshipRow = {
  child_profile_id: string;
  created_at: string;
};

type PendingInviteRow = {
  id: string;
  expedition_id: string;
  inviter_profile_code: string;
  inviter_display_name: string;
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
  const { state, isLocationUnlocked, setActiveMode, setCurrentExpeditionId, setFriendsFromCloud } = useAppState();
  const [friendFeed, setFriendFeed] = useState<FriendActivityRow[]>([]);
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteRow[]>([]);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const [ownChildProfileId, setOwnChildProfileId] = useState<string | null>(null);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  const loadFriendFeed = useCallback(async () => {
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

    const [{ data: outgoing }, { data: incoming }] = await Promise.all([
      supabase
        .from("child_friendships")
        .select("friend_profile_code, friend_display_name, created_at")
        .eq("child_profile_id", ownProfile.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("child_friendships")
        .select("child_profile_id, created_at")
        .eq("friend_child_profile_id", ownProfile.id)
        .order("created_at", { ascending: false })
        .limit(8)
    ]);

    const incomingRows = (incoming as IncomingFriendshipRow[] | null) ?? [];
    const incomingIds = incomingRows.map((row) => row.child_profile_id);
    let incomingProfilesById = new Map<string, { profile_code: string; child_name: string }>();

    if (incomingIds.length > 0) {
      const { data: incomingProfiles } = await supabase
        .from("child_profiles")
        .select("id, profile_code, child_name")
        .in("id", incomingIds);

      incomingProfilesById = new Map(
        (((incomingProfiles as Array<{ id: string; profile_code: string; child_name: string }> | null) ?? []).map(
          (row) => [row.id, { profile_code: row.profile_code, child_name: row.child_name }]
        ))
      );
    }

    const incomingFeed: FriendActivityRow[] = incomingRows
      .map((row) => {
        const profile = incomingProfilesById.get(row.child_profile_id);
        if (!profile) {
          return null;
        }

        return {
          friend_profile_code: profile.profile_code,
          friend_display_name: profile.child_name,
          created_at: row.created_at
        };
      })
      .filter((row): row is FriendActivityRow => Boolean(row));

    const mergedFeed = [...((outgoing as FriendActivityRow[] | null) ?? []), ...incomingFeed]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8);

    setFriendFeed(mergedFeed);
    setFeedLoaded(true);
  }, [state.profileCode, supabase]);

  const loadInvites = useCallback(async () => {
    if (!supabase || !state.profileCode) {
      setInvitesLoaded(true);
      return;
    }

    const { data: ownProfile } = await supabase
      .from("child_profiles")
      .select("id")
      .eq("profile_code", state.profileCode)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (!ownProfile?.id) {
      setOwnChildProfileId(null);
      setPendingInvites([]);
      setInvitesLoaded(true);
      return;
    }

    setOwnChildProfileId(ownProfile.id);

    const { data } = await supabase
      .from("child_expedition_invites")
      .select("id, expedition_id, inviter_profile_code, inviter_display_name, created_at")
      .eq("invitee_child_profile_id", ownProfile.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10);

    setPendingInvites((data as PendingInviteRow[]) ?? []);
    setInvitesLoaded(true);
  }, [state.profileCode, supabase]);

  useEffect(() => {
    void loadFriendFeed();
  }, [loadFriendFeed]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  useEffect(() => {
    if (!supabase || !state.profileCode) {
      return;
    }

    const channel = supabase
      .channel(`home-live-${state.profileCode}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "child_expedition_invites" },
        () => {
          void loadInvites();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "child_friendships" },
        () => {
          void loadFriendFeed();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadFriendFeed, loadInvites, state.profileCode, supabase]);

  async function handleInviteResponse(invite: PendingInviteRow, decision: "accepted" | "rejected") {
    if (!supabase || !ownChildProfileId || !state.profileCode) {
      return;
    }

    setRespondingInviteId(invite.id);
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    const response = await fetch("/api/invites/respond", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({
        profileCode: state.profileCode,
        inviteId: invite.id,
        decision
      })
    }).catch(() => null);

    if (!response?.ok) {
      setRespondingInviteId(null);
      return;
    }

    setPendingInvites((current) => current.filter((row) => row.id !== invite.id));

    if (decision === "accepted") {
      const payload = (await response.json()) as {
        expeditionId?: string | null;
        inviter?: { code: string; name: string };
      };
      setActiveMode("group");
      setCurrentExpeditionId(payload.expeditionId ?? invite.expedition_id);
      if (payload.inviter?.code && payload.inviter?.name) {
        const existingFriends = state.squadMembers
          .filter((member) => member.id !== "self")
          .map((member) => ({
            code: member.id,
            name: member.name
          }));

        const mergedFriends = [
          { code: payload.inviter.code, name: payload.inviter.name },
          ...existingFriends
        ];

        setFriendsFromCloud(mergedFriends);
      }
    }

    setRespondingInviteId(null);
  }

  const visibleFeed = friendFeed;
  const cityLocations = useMemo(() => locations.filter((location) => location.city === state.city), [state.city]);
  const cityMissions = useMemo(() => nearbyMissions.filter((mission) => mission.city === state.city), [state.city]);
  const primaryLocation = cityLocations[0] ?? locations[0];
  const unlockedInCity = cityLocations.filter((location) => isLocationUnlocked(location.id, location.unlocked)).length;
  const cityScore = unlockedInCity * 120;
  const mapUrl = useMemo(() => {
    if (!primaryLocation) {
      return "";
    }

    const mapDelta = 0.0075;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${primaryLocation.lng - mapDelta}%2C${
      primaryLocation.lat - mapDelta
    }%2C${primaryLocation.lng + mapDelta}%2C${primaryLocation.lat + mapDelta}&layer=mapnik&marker=${
      primaryLocation.lat
    }%2C${primaryLocation.lng}`;
  }, [primaryLocation]);

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
                <div className="text-lg font-semibold text-white">{unlockedInCity}</div>
                <div className="text-xs text-mist">Odemčeno</div>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-lg font-semibold text-white">{cityScore}</div>
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-coral">Pozvánky</p>
            <h2 className="mt-2 text-xl font-semibold">Nová výprava</h2>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {!invitesLoaded ? (
            <div className="rounded-2xl bg-white/5 p-4 text-sm text-mist">Načítám pozvánky…</div>
          ) : pendingInvites.length === 0 ? (
            <div className="rounded-2xl bg-white/5 p-4 text-sm text-mist">Zatím nemáš žádnou čekající pozvánku.</div>
          ) : (
            pendingInvites.map((invite) => (
              <div key={invite.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm">
                  <span className="font-semibold">{invite.inviter_display_name}</span> tě zve do výpravy.
                </p>
                <p className="mt-1 text-xs text-mist">{formatAgo(invite.created_at)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleInviteResponse(invite, "accepted")}
                    disabled={respondingInviteId === invite.id}
                    className="rounded-xl bg-lime px-3 py-2 text-xs font-semibold text-night"
                  >
                    Přijmout
                  </button>
                  <button
                    onClick={() => handleInviteResponse(invite, "rejected")}
                    disabled={respondingInviteId === invite.id}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-mist"
                  >
                    Odmítnout
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="glass-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-coral">Mise ve městě</p>
            <h2 className="mt-2 text-xl font-semibold">{state.city}</h2>
          </div>
          <div className="rounded-full bg-coral/12 px-3 py-2 text-xs font-semibold text-coral">
            Check-in e-mail při startu
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {cityMissions.length === 0 ? (
            <div className="rounded-2xl bg-white/5 p-4 text-sm text-mist">
              Pro tohle město zatím nemáme připravenou misi.
            </div>
          ) : (
            cityMissions.map((mission) => {
              return (
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
              );
            })
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Dnes doporučené lokace</h2>
          <Link href="/leaderboard" className="text-sm text-lime">
            Žebříček
          </Link>
        </div>

        {cityLocations.length === 0 ? (
          <div className="rounded-2xl bg-white/5 p-4 text-sm text-mist">V tomhle městě zatím není dostupná žádná lokace.</div>
        ) : (
          cityLocations.map((location) => {
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
          })
        )}
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
          ) : visibleFeed.length === 0 ? (
            <div className="rounded-2xl bg-white/5 p-4 text-sm text-mist">
              Zatím tu nic není. Jakmile si přidáš kamarády, uvidíš jejich aktuální pohyb.
            </div>
          ) : (
            visibleFeed.map((item) => (
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
