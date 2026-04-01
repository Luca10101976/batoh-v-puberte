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

type UserCoords = {
  lat: number;
  lng: number;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function calculateDistanceMeters(from: UserCoords, to: UserCoords) {
  const earthRadius = 6371000;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadius * c);
}

function formatDistance(meters: number) {
  if (meters < 1000) {
    return `${meters} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}

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
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installHintOpen, setInstallHintOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "enabled" | "blocked" | "unsupported">("idle");
  const [pushMessage, setPushMessage] = useState("");
  const [userCoords, setUserCoords] = useState<UserCoords | null>(null);
  const [geoState, setGeoState] = useState<"locating" | "ready" | "denied" | "error" | "unsupported">("locating");
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
    }

    loadFriendFeed();
  }, [state.profileCode, supabase]);

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);

    if (isStandalone) {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setPushStatus("blocked");
      return;
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (subscription) {
          setPushStatus("enabled");
        }
      })
      .catch(() => undefined);
  }, []);

  function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  async function handleEnableNotifications() {
    setPushMessage("");

    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported");
      setPushMessage("Tenhle telefon nepodporuje web push notifikace.");
      return;
    }

    if (!state.profileCode) {
      setPushMessage("Nejdřív dokonči registraci profilu.");
      return;
    }

    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();

    if (permission !== "granted") {
      setPushStatus("blocked");
      setPushMessage("Notifikace nejsou povolené.");
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!publicKey) {
      setPushMessage("Chybí VAPID veřejný klíč.");
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileCode: state.profileCode,
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent
      })
    }).catch(() => null);

    if (!response?.ok) {
      setPushMessage("Nepodařilo se uložit notifikace.");
      return;
    }

    setPushStatus("enabled");
    setPushMessage("Notifikace jsou zapnuté.");
  }

  async function handleInstallClick() {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);

    if (isStandalone) {
      return;
    }

    if (deferredInstallPrompt) {
      await deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice.catch(() => undefined);
      setDeferredInstallPrompt(null);
      return;
    }

    setInstallHintOpen(true);
  }

  useEffect(() => {
    async function loadInvites() {
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
    }

    loadInvites();
  }, [state.profileCode, supabase]);

  async function handleInviteResponse(invite: PendingInviteRow, decision: "accepted" | "rejected") {
    if (!supabase || !ownChildProfileId) {
      return;
    }

    setRespondingInviteId(invite.id);

    const { error } = await supabase
      .from("child_expedition_invites")
      .update(
        {
          status: decision,
          responded_at: new Date().toISOString()
        } as never
      )
      .eq("id", invite.id)
      .eq("invitee_child_profile_id", ownChildProfileId)
      .eq("status", "pending");

    if (error) {
      setRespondingInviteId(null);
      return;
    }

    setPendingInvites((current) => current.filter((row) => row.id !== invite.id));

    if (decision === "accepted") {
      setActiveMode("group");
      setCurrentExpeditionId(invite.expedition_id);
      setFriendsFromCloud([
        {
          code: invite.inviter_profile_code,
          name: invite.inviter_display_name
        }
      ]);
    }

    setRespondingInviteId(null);
  }

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoState("unsupported");
      return;
    }

    setGeoState("locating");

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setGeoState("ready");
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setGeoState("denied");
          return;
        }

        setGeoState("error");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 20000,
        timeout: 10000
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const unlockedCount = locations.filter((location) =>
    isLocationUnlocked(location.id, location.unlocked)
  ).length;
  const score = unlockedCount * 120;
  const localFriends = state.squadMembers.filter((member) => member.id !== "self");
  const fallbackFeed: FriendActivityRow[] = localFriends.map((friend, index) => ({
    friend_profile_code: friend.id,
    friend_display_name: friend.name,
    created_at: new Date(Date.now() - (index + 1) * 60000).toISOString()
  }));
  const visibleFeed = friendFeed.length > 0 ? friendFeed : fallbackFeed;
  const primaryLocation = locations[0];
  const primaryCoords = useMemo(
    () => (primaryLocation ? { lat: primaryLocation.lat, lng: primaryLocation.lng } : null),
    [primaryLocation]
  );
  const distanceMeters = userCoords && primaryCoords ? calculateDistanceMeters(userCoords, primaryCoords) : null;
  const walkingMinutes = distanceMeters ? Math.max(1, Math.round(distanceMeters / 80)) : null;
  const mapUrl = useMemo(() => {
    if (!primaryLocation || !primaryCoords) {
      return "";
    }

    if (!userCoords) {
      const mapDelta = 0.0075;
      return `https://www.openstreetmap.org/export/embed.html?bbox=${primaryLocation.lng - mapDelta}%2C${
        primaryLocation.lat - mapDelta
      }%2C${primaryLocation.lng + mapDelta}%2C${primaryLocation.lat + mapDelta}&layer=mapnik&marker=${
        primaryLocation.lat
      }%2C${primaryLocation.lng}`;
    }

    const minLat = Math.min(primaryCoords.lat, userCoords.lat);
    const maxLat = Math.max(primaryCoords.lat, userCoords.lat);
    const minLng = Math.min(primaryCoords.lng, userCoords.lng);
    const maxLng = Math.max(primaryCoords.lng, userCoords.lng);
    const latPadding = Math.max(0.0045, (maxLat - minLat) * 0.4);
    const lngPadding = Math.max(0.0045, (maxLng - minLng) * 0.4);

    return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng - lngPadding}%2C${minLat - latPadding}%2C${
      maxLng + lngPadding
    }%2C${maxLat + latPadding}&layer=mapnik&marker=${primaryCoords.lat}%2C${primaryCoords.lng}`;
  }, [primaryCoords, primaryLocation, userCoords]);

  return (
    <main className="flex flex-1 flex-col gap-6 pb-24">
      <HeroCard />

      <section className="glass-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-lime">Aplikace do telefonu</p>
            <h2 className="mt-2 text-xl font-semibold">Mít hru na ploše</h2>
          </div>
          <button
            onClick={handleInstallClick}
            className="rounded-full bg-lime px-4 py-2 text-sm font-semibold text-night"
          >
            Stáhnout
          </button>
        </div>
        <p className="mt-3 text-sm text-mist">
          Android: instalace se spustí hned. iPhone: otevři Safari a dej Sdílet → Přidat na plochu.
        </p>
        {installHintOpen ? (
          <div className="mt-3 rounded-2xl bg-white/5 p-3 text-sm text-mist">
            Postup pro iPhone: otevři stránku v Safari, klepni na Sdílet a vyber Přidat na plochu.
          </div>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={handleEnableNotifications}
            disabled={pushStatus === "enabled"}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold"
          >
            {pushStatus === "enabled" ? "Notifikace zapnuté" : "Zapnout notifikace"}
          </button>
          {pushStatus === "blocked" ? <span className="text-xs text-coral">Blokováno v telefonu</span> : null}
        </div>
        {pushMessage ? <p className="mt-2 text-xs text-mist">{pushMessage}</p> : null}
      </section>

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
            <p className="text-xs uppercase tracking-[0.24em] text-coral">Blízko tebe</p>
            <h2 className="mt-2 text-xl font-semibold">Vyrazte ven ještě dnes</h2>
          </div>
          <div className="rounded-full bg-coral/12 px-3 py-2 text-xs font-semibold text-coral">
            {geoState === "ready"
              ? "Poloha zapnutá"
              : geoState === "locating"
                ? "Zjišťuju polohu…"
                : "Poloha vypnutá"}
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
                  <p className="mt-1 text-sm text-mist">
                    {distanceMeters ? `${formatDistance(distanceMeters)} od tebe` : mission.status}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-lime">
                    {walkingMinutes ? `${walkingMinutes} min` : mission.distance}
                  </div>
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
