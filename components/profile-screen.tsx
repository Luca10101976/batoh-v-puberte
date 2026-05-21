"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { type AvatarConfig, useAppState } from "@/components/app-state-provider";
import { MobileAppCard } from "@/components/mobile-app-card";
import { locations } from "@/lib/mock-data";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type ChildProfileRow = {
  id: string;
  child_name: string;
  child_age?: number;
  profile_code: string;
  player_code?: string | null;
  avatar?: string | null;
  avatar_config?: AvatarConfig | null;
  has_pin?: boolean;
};

type ResolvedFriendProfile = {
  id: string;
  name: string;
  code: string;
};

type FriendListItem = {
  code: string;
  name: string;
  addedAt?: string;
};

type ExpeditionPlayerStatus = "invited" | "accepted" | "declined" | "removed";
type MessageTone = "neutral" | "success" | "error";

type ActiveExpedition = {
  id: string;
  status: "waiting" | "active";
  missionId: string | null;
  isLeader: boolean;
  players: Array<{
    childProfileId: string;
    name: string;
    code: string;
    status: ExpeditionPlayerStatus;
    joinedAt: string | null;
  }>;
};

const EMOJI_AVATAR_OPTIONS = Array.from({ length: 20 }, (_, index) => `batuzek-${String(index + 1).padStart(2, "0")}`);

function isEmojiAvatar(value: string) {
  if (value.startsWith("batuzek-")) {
    return true;
  }
  return /[\p{Extended_Pictographic}]/u.test(value);
}

function AvatarPreview({ config, size = 80, emoji }: { config: AvatarConfig; size?: number; emoji?: string }) {
  if (emoji && isEmojiAvatar(emoji)) {
    if (emoji.startsWith("batuzek-")) {
      return (
        <div
          className="relative flex items-center justify-center overflow-hidden rounded-[30px] border border-white/8 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          style={{ width: size, height: size }}
        >
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(circle at 50% 18%, rgba(255,255,255,0.09), rgba(0,0,0,0))" }}
          />
          <div className="relative h-[90%] w-[90%]">
            <Image
              src={`/avatars/batuzek/${emoji}.png`}
              alt="Avatar batůžek"
              fill
              sizes={`${size}px`}
              className="object-contain"
            />
          </div>
        </div>
      );
    }
    return (
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-night/40"
        style={{ width: size, height: size }}
      >
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(circle at 50% 20%, rgba(255,255,255,0.12), rgba(0,0,0,0))" }}
        />
        <span style={{ fontSize: size * 0.56, lineHeight: 1 }} aria-label="Emoji avatar">
          {emoji}
        </span>
      </div>
    );
  }

  const headShapeClass =
    config.head === "round" ? "rounded-[44%]" : config.head === "oval" ? "rounded-[40%]" : "rounded-[18px]";
  const hairColor = "#243249";
  const eyeSize = size * 0.22;
  const eyeTop = size * 0.45;
  const eyeInset = size * 0.27;
  const pupilSize = eyeSize * 0.38;
  return (
    <div
      className="relative overflow-hidden rounded-[28px] border border-white/10 bg-night/40"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 20%, rgba(255,255,255,0.12), rgba(0,0,0,0))" }}
      />
      <div
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[35%] border-[3px] border-night ${headShapeClass}`}
        style={{ width: size * 0.64, height: size * 0.62, backgroundColor: config.color }}
      />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-[42%] -translate-y-[44%] rounded-full bg-white/30"
        style={{ width: size * 0.18, height: size * 0.1 }}
      />

      {config.hair === "short" ? (
        <div
          className="absolute left-1/2 top-[12%] -translate-x-1/2 rounded-[16px] border-[3px] border-night"
          style={{ width: size * 0.66, height: size * 0.18, backgroundColor: hairColor }}
        />
      ) : null}

      {config.hair === "long" ? (
        <>
          <div
            className="absolute left-1/2 top-[11%] -translate-x-1/2 rounded-[18px] border-[3px] border-night"
            style={{ width: size * 0.68, height: size * 0.2, backgroundColor: hairColor }}
          />
          <div
            className="absolute left-[18%] top-[24%] rounded-b-full border-x-[3px] border-b-[3px] border-night"
            style={{ width: size * 0.14, height: size * 0.28, backgroundColor: hairColor }}
          />
          <div
            className="absolute right-[18%] top-[24%] rounded-b-full border-x-[3px] border-b-[3px] border-night"
            style={{ width: size * 0.14, height: size * 0.28, backgroundColor: hairColor }}
          />
        </>
      ) : null}

      {config.hair === "spiky" ? (
        <>
          <div
            className="absolute left-1/2 top-[13%] -translate-x-1/2 rounded-[14px] border-[3px] border-night"
            style={{ width: size * 0.68, height: size * 0.16, backgroundColor: hairColor }}
          />
          <div
            className="absolute left-[29%] top-[3%] h-0 w-0 border-x-[7px] border-b-[11px] border-x-transparent border-b-night"
          />
          <div
            className="absolute left-[46%] top-[0%] h-0 w-0 border-x-[7px] border-b-[11px] border-x-transparent border-b-night"
          />
          <div
            className="absolute right-[29%] top-[3%] h-0 w-0 border-x-[7px] border-b-[11px] border-x-transparent border-b-night"
          />
        </>
      ) : null}

      <div
        className="absolute rounded-full border-[3px] border-night bg-white"
        style={{ left: eyeInset, top: eyeTop, width: eyeSize, height: eyeSize }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-night"
          style={{
            width: pupilSize,
            height: pupilSize,
            left: config.eyes === "dot" ? "34%" : config.eyes === "smile" ? "42%" : "28%"
          }}
        />
      </div>
      <div
        className="absolute rounded-full border-[3px] border-night bg-white"
        style={{ right: eyeInset, top: eyeTop, width: eyeSize, height: eyeSize }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-night"
          style={{
            width: pupilSize,
            height: pupilSize,
            right: config.eyes === "dot" ? "34%" : config.eyes === "smile" ? "42%" : "28%"
          }}
        />
      </div>

      <div
        className="absolute left-[30%] border-t-[3px] border-night"
        style={{ top: `${size * 0.4}px`, width: size * 0.14, transform: "rotate(-8deg)" }}
      />
      <div
        className="absolute right-[30%] border-t-[3px] border-night"
        style={{ top: `${size * 0.4}px`, width: size * 0.14, transform: "rotate(8deg)" }}
      />

      <div
        className="absolute left-1/2 top-[71%] -translate-x-1/2 rounded-b-full border-b-[4px] border-night"
        style={{ width: config.eyes === "smile" ? size * 0.24 : size * 0.19, height: size * 0.1 }}
      />
    </div>
  );
}

export function ProfileScreen() {
  const router = useRouter();
  const {
    state,
    syncCloudProfile,
    isLocationUnlocked,
    addFriendByCode,
    removeFriendByCode,
    setFriendsFromCloud,
    setActiveMode,
    setCurrentExpeditionId,
    getPlayerScore,
    openParentAuthGate
  } = useAppState();
  const [friendCode, setFriendCode] = useState("");
  const [friendMessage, setFriendMessage] = useState("");
  const [friendMessageTone, setFriendMessageTone] = useState<MessageTone>("neutral");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileMessageTone, setProfileMessageTone] = useState<MessageTone>("neutral");
  const [savingProfile, setSavingProfile] = useState(false);
  const [nameDraft, setNameDraft] = useState(state.profile.name);
  const [savingFriend, setSavingFriend] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [cloudProfileError, setCloudProfileError] = useState("");
  const [removingFriendCode, setRemovingFriendCode] = useState<string | null>(null);
  const [activeExpedition, setActiveExpedition] = useState<ActiveExpedition | null>(null);
  const [selectedInviteCodes, setSelectedInviteCodes] = useState<string[]>([]);
  const [cloudFriends, setCloudFriends] = useState<FriendListItem[]>([]);
  const [cloudReady, setCloudReady] = useState<boolean | null>(null);
  const [invitingFriends, setInvitingFriends] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState<AvatarConfig>(state.profile.avatarConfig);
  const [avatarEmojiDraft, setAvatarEmojiDraft] = useState(
    isEmojiAvatar(state.profile.avatar) ? state.profile.avatar : EMOJI_AVATAR_OPTIONS[0]
  );
  const [avatarStudioOpen, setAvatarStudioOpen] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarMessageTone, setAvatarMessageTone] = useState<MessageTone>("neutral");
  const [gamesFilter, setGamesFilter] = useState<"all" | "active" | "completed">("all");
  const [visibleGamesCount, setVisibleGamesCount] = useState(6);
  const avatarSaveTimeoutRef = useRef<number | null>(null);
  const avatarSaveRequestIdRef = useRef(0);
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);
  const unlockedCount = useMemo(
    () => locations.filter((location) => isLocationUnlocked(location.id, location.unlocked)).length,
    [isLocationUnlocked]
  );
  const friends = cloudReady === true ? cloudFriends : state.squadMembers.filter((member) => member.id !== "self");
  const score = getPlayerScore();
  const activeLocation = useMemo(
    () => locations.find((location) => location.id === state.activeMission?.locationId) ?? null,
    [state.activeMission]
  );
  const gameSummaries = useMemo(() => {
    const completedIds = new Set(state.completedLocationIds);
    const activeId = state.activeMission?.locationId ?? null;

    const rows = locations
      .filter((location) => completedIds.has(location.id) || location.id === activeId)
      .map((location) => {
        const maxPoints = 120;
        const penalty = state.locationPenaltyPoints[location.id] ?? 0;
        const earnedPoints = Math.max(0, maxPoints - penalty);
        const isActive = location.id === activeId;
        const isCompleted = completedIds.has(location.id);

        return {
          id: location.id,
          name: location.name,
          city: location.city,
          status: isActive ? ("active" as const) : ("completed" as const),
          statusLabel: isActive ? "Rozehráno" : "Dokončeno",
          scoreLabel: isCompleted ? `${earnedPoints}/${maxPoints} bodů` : "Rozehráno",
          actionLabel: isActive ? "Pokračovat" : "Zahrát znovu",
          href: isActive ? `/play/${location.id}` : `/locations/${location.id}`,
          updatedAt: isActive ? (state.activeMission?.updatedAt ?? "") : (state.lastCompletedAt[location.id] ?? ""),
          isCompleted
        };
      })
      .sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });

    return rows;
  }, [state.activeMission, state.completedLocationIds, state.lastCompletedAt, state.locationPenaltyPoints]);
  const completedGamesCount = useMemo(
    () => gameSummaries.filter((game) => game.status === "completed").length,
    [gameSummaries]
  );
  const activeGamesCount = useMemo(
    () => gameSummaries.filter((game) => game.status === "active").length,
    [gameSummaries]
  );
  const filteredGames = useMemo(() => {
    if (gamesFilter === "active") {
      return gameSummaries.filter((game) => game.status === "active");
    }
    if (gamesFilter === "completed") {
      return gameSummaries.filter((game) => game.status === "completed");
    }
    return gameSummaries;
  }, [gameSummaries, gamesFilter]);
  const visibleGames = useMemo(() => filteredGames.slice(0, visibleGamesCount), [filteredGames, visibleGamesCount]);
  const hasMoreGames = filteredGames.length > visibleGamesCount;
  const expeditionPlayersByCode = useMemo(() => {
    const map = new Map<string, ExpeditionPlayerStatus>();
    (activeExpedition?.players ?? []).forEach((player) => {
      map.set(player.code.trim().toUpperCase(), player.status);
    });
    return map;
  }, [activeExpedition]);
  const canManageExpeditionInvites = Boolean(
    !activeExpedition || (activeExpedition.isLeader && activeExpedition.status === "waiting")
  );
  const expeditionRoleLabel = activeExpedition
    ? activeExpedition.isLeader
      ? "Jsi vedoucí výpravy"
      : "Jsi člen výpravy"
    : "Nemáš aktivní výpravu";

  useEffect(() => {
    setVisibleGamesCount(6);
  }, [gamesFilter]);

  const ensureOwnCloudProfile = useCallback(async (providedAccessToken?: string) => {
    if (!supabase) {
      setCloudProfileError("Cloud klient není dostupný.");
      return null;
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.user) {
      setCloudProfileError("Chybí aktivní session účtu.");
      return null;
    }

    const accessToken = providedAccessToken ?? session.access_token ?? "";
    if (!accessToken) {
      setCloudProfileError("Chybí přístupový token účtu.");
      return null;
    }

    const response = await fetch("/api/child-profile/me", {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Cache-Control": "no-store"
      }
    }).catch(() => null);

    if (!response?.ok) {
      const payload = (await response?.json().catch(() => null)) as { message?: string; code?: string } | null;
      if (response?.status === 401) {
        setCloudProfileError("Účet už není přihlášený. Přihlas se znovu.");
      } else if (typeof payload?.message === "string" && payload.message.trim()) {
        setCloudProfileError(payload.message.trim());
      } else {
        setCloudProfileError("Načtení cloud profilu selhalo.");
      }
      return null;
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          profile?: {
            child_name?: string;
            child_age?: number;
            profile_code?: string;
            player_code?: string;
            avatar?: string | null;
            avatar_config?: AvatarConfig | null;
            has_pin?: boolean;
          } | null;
          profile_id?: string | null;
        }
      | null;

    const profile = payload?.profile;
    if (!profile?.profile_code) {
      // Bootstrap path: PATCH endpoint umí bezpečně vytvořit canonical row,
      // pokud ještě neexistuje. Tím odstraníme pád "Teď to nejde..." u Přidat kamaráda.
      const bootstrapResponse = await fetch("/api/child-profile/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          child_name: "Hráč"
        })
      }).catch(() => null);

      if (!bootstrapResponse?.ok) {
        const bootstrapPayload = (await bootstrapResponse?.json().catch(() => null)) as { message?: string; code?: string } | null;
        if (bootstrapResponse?.status === 401) {
          setCloudProfileError("Účet už není přihlášený. Přihlas se znovu.");
        } else if (typeof bootstrapPayload?.message === "string" && bootstrapPayload.message.trim()) {
          setCloudProfileError(bootstrapPayload.message.trim());
        } else {
          setCloudProfileError("Cloud profil zatím neexistuje.");
        }
        return null;
      }

      const bootstrapPayload = (await bootstrapResponse.json().catch(() => null)) as
        | {
            profile?: {
              child_name?: string;
              child_age?: number;
              profile_code?: string;
              player_code?: string;
              avatar?: string | null;
              avatar_config?: AvatarConfig | null;
              has_pin?: boolean;
            } | null;
            profile_id?: string | null;
          }
        | null;

      const bootstrapProfile = bootstrapPayload?.profile;
      if (!bootstrapProfile?.profile_code) {
        setCloudProfileError("Cloud profil zatím neexistuje.");
        return null;
      }

      const bootstrapped: ChildProfileRow = {
        id: bootstrapPayload?.profile_id || "",
        child_name: bootstrapProfile.child_name || "Hráč",
        child_age: bootstrapProfile.child_age || 11,
        profile_code: bootstrapProfile.profile_code,
        player_code: bootstrapProfile.player_code || bootstrapProfile.profile_code
      };

      setCloudProfileError("");
      syncCloudProfile({
        childName: bootstrapped.child_name,
        childAge: bootstrapped.child_age,
        profileCode: bootstrapped.profile_code,
        playerCode: bootstrapped.player_code || bootstrapped.profile_code,
        profileRowId: bootstrapPayload?.profile_id ?? null,
        avatar: bootstrapProfile.avatar ?? undefined,
        avatarConfig: bootstrapProfile.avatar_config ?? undefined,
        hasPin: bootstrapProfile.has_pin
      });

      return bootstrapped;
    }

    const resolved: ChildProfileRow = {
      id: payload?.profile_id || "",
      child_name: profile.child_name || "Hráč",
      child_age: profile.child_age || 11,
      profile_code: profile.profile_code,
      player_code: profile.player_code || profile.profile_code
    };

    setCloudProfileError("");
    syncCloudProfile({
      childName: resolved.child_name,
      childAge: resolved.child_age,
      profileCode: resolved.profile_code,
      playerCode: resolved.player_code || resolved.profile_code,
      profileRowId: payload?.profile_id ?? null,
      avatar: profile.avatar ?? undefined,
      avatarConfig: profile.avatar_config ?? undefined,
      hasPin: profile.has_pin
    });

    return resolved;
  }, [supabase, syncCloudProfile]);

  const reloadCanonicalProfile = useCallback(
    async (providedAccessToken?: string) => {
      if (!supabase) {
        return null;
      }

      const accessToken = providedAccessToken ?? (await supabase.auth.getSession()).data.session?.access_token ?? "";
      if (!accessToken) {
        return null;
      }

      const profileResponse = await fetch("/api/child-profile/me", {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Cache-Control": "no-store"
        }
      }).catch(() => null);

      if (!profileResponse?.ok) {
        return null;
      }

      const payload = (await profileResponse.json().catch(() => null)) as
        | {
            profile?: {
              child_name?: string;
              child_age?: number;
              player_code?: string;
              profile_code?: string;
              has_pin?: boolean;
              avatar?: string;
              avatar_config?: AvatarConfig;
            } | null;
            profile_id?: string | null;
          }
        | null;

      const profile = payload?.profile;
      if (!profile?.profile_code) {
        return null;
      }

      syncCloudProfile({
        childName: profile.child_name,
        childAge: profile.child_age,
        playerCode: profile.player_code,
        profileCode: profile.profile_code,
        profileRowId: payload?.profile_id ?? null,
        hasPin: profile.has_pin,
        avatar: profile.avatar,
        avatarConfig: profile.avatar_config
      });
      setNameDraft(profile.child_name?.trim() || "Hráč");
      return profile;
    },
    [supabase, syncCloudProfile]
  );

  const persistProfileName = useCallback(async () => {
    const safeName = nameDraft.trim();
    if (safeName.length < 2) {
      setProfileMessageTone("error");
      setProfileMessage("Jméno musí mít aspoň 2 znaky.");
      return;
    }

    if (!supabase) {
      setProfileMessageTone("error");
      setProfileMessage("Cloud není dostupný.");
      return;
    }

    setSavingProfile(true);
    setProfileMessageTone("neutral");
    setProfileMessage("");
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    if (!accessToken) {
      setSavingProfile(false);
      setProfileMessageTone("error");
      setProfileMessage("Nejdřív se přihlas do účtu.");
      return;
    }

    const sendPatch = async (token: string) =>
      fetch("/api/child-profile/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          child_name: safeName,
          profile_code: state.profileCode
        })
      }).catch(() => null);

    let response = await sendPatch(accessToken);

    let effectiveAccessToken = accessToken;
    if (response?.status === 401) {
      await supabase.auth.refreshSession().catch(() => null);
      const refreshedToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      if (refreshedToken) {
        effectiveAccessToken = refreshedToken;
        response = await sendPatch(refreshedToken);
      }
    }

    if (!response?.ok) {
      setSavingProfile(false);
      setProfileMessageTone("error");
      setProfileMessage("Uložení jména se nepodařilo.");
      return;
    }

    await reloadCanonicalProfile(effectiveAccessToken);
    setSavingProfile(false);
    setProfileMessageTone("success");
    setProfileMessage("Jméno je uložené do cloudu.");
  }, [nameDraft, state.profileCode, supabase, reloadCanonicalProfile]);

  const persistAvatar = useCallback(
    async (next: { avatar: string; avatarConfig: AvatarConfig }) => {
      const requestId = avatarSaveRequestIdRef.current + 1;
      avatarSaveRequestIdRef.current = requestId;

      if (!supabase) {
        if (requestId === avatarSaveRequestIdRef.current) {
          setAvatarMessageTone("error");
          setAvatarMessage("Cloud není dostupný.");
        }
        return false;
      }

      const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      if (!accessToken) {
        if (requestId === avatarSaveRequestIdRef.current) {
          setAvatarMessageTone("error");
          setAvatarMessage("Nejdřív se přihlas do účtu.");
        }
        return false;
      }

      if (requestId === avatarSaveRequestIdRef.current) {
        setSavingAvatar(true);
        setAvatarMessageTone("neutral");
        setAvatarMessage("");
      }

      const sendPatch = async (token: string) =>
        fetch("/api/child-profile/me", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            avatar: next.avatar,
            avatar_config: next.avatarConfig,
            profile_code: state.profileCode
          })
        }).catch(() => null);

      let response = await sendPatch(accessToken);
      let effectiveAccessToken = accessToken;

      if (response?.status === 401) {
        await supabase.auth.refreshSession().catch(() => null);
        const refreshedToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
        if (refreshedToken) {
          effectiveAccessToken = refreshedToken;
          response = await sendPatch(refreshedToken);
        }
      }

      if (requestId !== avatarSaveRequestIdRef.current) {
        return false;
      }

      if (!response?.ok) {
        const errorPayload = (await response?.json().catch(() => null)) as
          | { code?: string; message?: string }
          | null;
        setSavingAvatar(false);
        if (errorPayload?.code === "avatar_schema_missing") {
          setAvatarMessageTone("error");
          setAvatarMessage("Avatar zatím nejde uložit: v databázi chybí nová pole.");
        } else if (errorPayload?.code === "profile_not_found") {
          setAvatarMessageTone("error");
          setAvatarMessage("Nenašel se tvůj cloud profil. Zkus se odhlásit a přihlásit.");
        } else if (response?.status === 401) {
          setAvatarMessageTone("error");
          setAvatarMessage("Přihlášení vypršelo. Odhlas se a přihlas znovu.");
        } else if (errorPayload?.code === "invalid_avatar" || errorPayload?.code === "invalid_avatar_config") {
          setAvatarMessageTone("error");
          setAvatarMessage("Tenhle avatar nejde uložit. Zkus jiný.");
        } else if (errorPayload?.message) {
          setAvatarMessageTone("error");
          setAvatarMessage(errorPayload.message);
        } else {
          setAvatarMessageTone("error");
          setAvatarMessage("Uložení avatara se nepodařilo. Zkus to znovu.");
        }
        return false;
      }

      await reloadCanonicalProfile(effectiveAccessToken);
      setSavingAvatar(false);
      setAvatarMessageTone("success");
      setAvatarMessage("Avatar je uložený.");
      return true;
    },
    [state.profileCode, supabase, reloadCanonicalProfile]
  );

  const saveAvatarDebounced = useCallback(
    (next: { avatar: string; avatarConfig: AvatarConfig }) => {
      if (typeof window === "undefined") {
        return;
      }

      if (avatarSaveTimeoutRef.current) {
        window.clearTimeout(avatarSaveTimeoutRef.current);
      }

      setAvatarMessageTone("neutral");
      setAvatarMessage("Ukládám avatar…");
      avatarSaveTimeoutRef.current = window.setTimeout(() => {
        void persistAvatar(next);
      }, 250);
    },
    [persistAvatar]
  );

  const fetchProfileOverview = useCallback(async (providedAccessToken?: string) => {
    if (!supabase) {
      setCloudFriends([]);
      setFriendsFromCloud([]);
      setActiveExpedition(null);
      return;
    }

    const accessToken = providedAccessToken ?? (await supabase.auth.getSession()).data.session?.access_token ?? "";
    if (!accessToken) {
      setCloudFriends([]);
      setFriendsFromCloud([]);
      setActiveExpedition(null);
      return;
    }

    const response = await fetch("/api/profile/overview", {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Cache-Control": "no-store"
      }
    }).catch(() => null);

    if (!response?.ok) {
      setCloudFriends([]);
      setFriendsFromCloud([]);
      setActiveExpedition(null);
      return;
    }

    const payload = (await response.json()) as {
      profile?: {
        child_name?: string;
        child_age?: number;
        player_code?: string;
        profile_code?: string;
        has_pin?: boolean;
        avatar?: string;
        avatar_config?: AvatarConfig;
      } | null;
      profile_id?: string | null;
      friends?: Array<{ code: string; name: string; addedAt?: string }>;
      session?: ActiveExpedition | null;
    };

    const effectiveProfile = payload.profile;
    if (effectiveProfile?.profile_code) {
      // IMPORTANT:
      // Profile name/avatar must come only from canonical /api/child-profile/me flow.
      // /api/profile/overview is used for friends/session widgets and should not overwrite
      // child_name/avatar with potentially stale concurrent payloads.
      syncCloudProfile({
        playerCode: effectiveProfile.player_code,
        profileCode: effectiveProfile.profile_code,
        profileRowId: payload.profile_id ?? null,
        hasPin: effectiveProfile.has_pin
      });
    }

    const normalized = (payload.friends ?? []).map((friend) => ({
      code: friend.code,
      name: friend.name,
      addedAt: friend.addedAt
    }));

    setCloudFriends(normalized);
    setFriendsFromCloud(normalized.map((item) => ({ code: item.code, name: item.name })));
    setActiveExpedition(payload.session ?? null);
  }, [setFriendsFromCloud, supabase, syncCloudProfile]);

  useEffect(() => {
    setAvatarDraft(state.profile.avatarConfig);
    setAvatarEmojiDraft(isEmojiAvatar(state.profile.avatar) ? state.profile.avatar : EMOJI_AVATAR_OPTIONS[0]);
  }, [state.profile.avatar, state.profile.avatarConfig]);

  useEffect(() => {
    setNameDraft(state.profile.name);
  }, [state.profile.name]);

  useEffect(() => {
    return () => {
      if (avatarSaveTimeoutRef.current && typeof window !== "undefined") {
        window.clearTimeout(avatarSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setCloudReady(false);
      return;
    }
    const client = supabase;

    let cancelled = false;

    async function checkCloudSession() {
      const {
        data: { session }
      } = await client.auth.getSession();

      if (!cancelled) {
        setCloudReady(Boolean(session?.user));
        if (session?.access_token) {
          void fetchProfileOverview(session.access_token);
        }
      }
    }

    void checkCloudSession();

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setCloudReady(Boolean(session?.user));
        if (session?.access_token) {
          void fetchProfileOverview(session.access_token);
        }
      }
    });

    const onVisibility = () => {
      if (!document.hidden) {
        void checkCloudSession();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      subscription.unsubscribe();
    };
  }, [fetchProfileOverview, supabase]);

  useEffect(() => {
    // Keep profile page deterministic even after cross-tab/device changes:
    // every profile open refreshes canonical server profile once.
    let cancelled = false;
    async function bootstrapProfileCloud() {
      if (cloudReady !== true || cancelled) {
        return;
      }
      await ensureOwnCloudProfile();
      await fetchProfileOverview();
    }
    void bootstrapProfileCloud();
    return () => {
      cancelled = true;
    };
  }, [cloudReady, ensureOwnCloudProfile, fetchProfileOverview]);

  useEffect(() => {
    if (!supabase || !state.playerCode) {
      return;
    }

    const channel = supabase
      .channel(`profile-live-${state.playerCode}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "child_friendships" },
        () => {
          void fetchProfileOverview();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "child_game_session_players" },
        () => {
          void fetchProfileOverview();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "child_game_sessions" },
        () => {
          void fetchProfileOverview();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchProfileOverview, state.playerCode, supabase]);

  async function resolveFriendProfileByCode(code: string): Promise<ResolvedFriendProfile | null> {
    if (!supabase) {
      return null;
    }

    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";

    if (!accessToken) {
      return null;
    }

    const response = await fetch("/api/friends/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ playerCode: code })
    }).catch(() => null);

    if (!response?.ok) {
      return null;
    }

    const payload = (await response.json()) as { ok?: boolean; profile?: ResolvedFriendProfile };
    return payload.profile ?? null;
  }

  async function handleAddFriend() {
    setSavingFriend(true);
    setFriendMessageTone("neutral");
    setFriendMessage("");
    const normalizedCode = friendCode.trim().toUpperCase();
    const nickname = "";

    if (!supabase) {
      const result = addFriendByCode({ friendCode });

      if (!result.ok) {
        setSavingFriend(false);
        setFriendMessageTone("error");
        setFriendMessage(result.message);
        return;
      }

      setSavingFriend(false);
      setFriendMessageTone("success");
      setFriendMessage("Kamarád přidán lokálně.");
      setFriendCode("");
      return;
    }

    if (!normalizedCode || normalizedCode.length < 4) {
      setSavingFriend(false);
      setFriendMessageTone("error");
      setFriendMessage("Zadej platný kód kamaráda.");
      return;
    }

    if (normalizedCode === state.playerCode.trim().toUpperCase()) {
      setSavingFriend(false);
      setFriendMessageTone("error");
      setFriendMessage("Tohle je tvůj vlastní kód.");
      return;
    }

    const alreadyAdded = state.squadMembers.some((member) => member.id === normalizedCode);

    if (alreadyAdded) {
      setSavingFriend(false);
      setFriendMessageTone("error");
      setFriendMessage("Tohohle kamaráda už máš přidaného.");
      return;
    }

    const ownProfile = await ensureOwnCloudProfile();

    if (!ownProfile) {
      setSavingFriend(false);
      setFriendMessageTone("error");
      setFriendMessage(cloudProfileError || "Nejdřív se nepodařilo načíst tvůj hráčský profil. Zkus to znovu za pár vteřin.");
      return;
    }

    const ownCanonicalCode = normalizePublicCode(ownProfile.player_code || ownProfile.profile_code || "");
    if (normalizedCode === ownCanonicalCode) {
      setSavingFriend(false);
      setFriendMessageTone("error");
      setFriendMessage("Tohle je tvůj vlastní kód.");
      return;
    }

    const targetProfile = await resolveFriendProfileByCode(normalizedCode);

    if (!targetProfile?.id) {
      setSavingFriend(false);
      setFriendMessageTone("error");
      setFriendMessage("Kamarád s tímto kódem nebyl nalezen.");
      return;
    }

    if (targetProfile.id === ownProfile.id || normalizePublicCode(targetProfile.code) === ownCanonicalCode) {
      setSavingFriend(false);
      setFriendMessageTone("error");
      setFriendMessage("Tohle je tvůj vlastní kód.");
      return;
    }

    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    const response = await fetch("/api/friends/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({
        sourcePlayerCode: ownProfile.player_code || ownProfile.profile_code,
        targetPlayerCode: targetProfile.code
      })
    }).catch(() => null);

    if (!response?.ok) {
      setSavingFriend(false);
      const payload = (await response?.json().catch(() => ({}))) as { error?: string };
      if (payload.error === "own_code") {
        setFriendMessageTone("error");
        setFriendMessage("Tohle je tvůj vlastní kód.");
      } else if (payload.error === "rate_limited") {
        setFriendMessageTone("error");
        setFriendMessage("Moc pokusů. Zkus to za chvíli.");
      } else if (payload.error === "target_not_found") {
        setFriendMessageTone("error");
        setFriendMessage("Kamarád s tímto kódem nebyl nalezen.");
      } else {
        setFriendMessageTone("error");
        setFriendMessage("Přidání kamaráda se nepodařilo.");
      }
      return;
    }

    const addPayload = (await response.json().catch(() => ({}))) as { alreadyFriend?: boolean };
    if (addPayload.alreadyFriend) {
      await fetchProfileOverview();
      setSavingFriend(false);
      setFriendMessageTone("error");
      setFriendMessage("Tohohle kamaráda už máš přidaného.");
      setFriendCode("");
      return;
    }

    const localAddResult = addFriendByCode({
      friendCode: targetProfile.code,
      nickname: nickname || targetProfile.name
    });

    if (!localAddResult.ok) {
      setSavingFriend(false);
      setFriendMessageTone("error");
      setFriendMessage(localAddResult.message);
      return;
    }

    setSavingFriend(false);
    setFriendMessageTone("success");
    setFriendMessage("Hotovo. Teď byste se měli vidět navzájem.");
    setFriendCode("");
    await fetchProfileOverview();
  }

  function normalizePublicCode(value: string) {
    return value.trim().toUpperCase();
  }

  function getFriendPublicCode(friend: FriendListItem | { id: string; name: string; joined: boolean }) {
    return normalizePublicCode("code" in friend ? friend.code : friend.id);
  }

  async function handleInviteSelectedFriends() {
    setInviteMessage("");

    if (!supabase || !state.playerCode) {
      setInviteMessage("Pozvánky fungují jen při připojení k cloudu.");
      return;
    }

    if (selectedInviteCodes.length === 0) {
      setInviteMessage("Vyber aspoň jednoho kamaráda.");
      return;
    }

    if (activeExpedition && (!activeExpedition.isLeader || activeExpedition.status !== "waiting")) {
      setInviteMessage("Teď nemůžeš posílat nové pozvánky.");
      return;
    }

    const ownProfile = await ensureOwnCloudProfile();
    if (!ownProfile) {
      setInviteMessage("Pozvánku teď nejde odeslat. Zkus to znovu za pár vteřin.");
      return;
    }

    setInvitingFriends(true);
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";

    const targetCodes = selectedInviteCodes.map((code) => normalizePublicCode(code)).filter((code) => code.length >= 4);
    const endpoint =
      activeExpedition && activeExpedition.isLeader && activeExpedition.status === "waiting"
        ? "/api/expeditions/invite"
        : "/api/expeditions/create";

    const body: Record<string, unknown> = {
      playerCode: ownProfile.player_code || ownProfile.profile_code,
      friendCodes: targetCodes
    };

    if (endpoint === "/api/expeditions/invite") {
      body.sessionId = activeExpedition?.id;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify(body)
    }).catch(() => null);

    if (!response?.ok) {
      setInvitingFriends(false);
      const payload = (await response?.json().catch(() => ({}))) as { error?: string };
      if (payload.error === "rate_limited") {
        setInviteMessage("Moc pozvánek najednou. Zkus to za chvíli.");
      } else if (payload.error === "missing_friend_codes") {
        setInviteMessage("Vyber aspoň jednoho kamaráda.");
      } else if (payload.error === "leader_only") {
        setInviteMessage("Pozvánky může posílat jen vedoucí výpravy.");
      } else {
        setInviteMessage("Pozvánku se nepodařilo odeslat.");
      }
      return;
    }

    const payload = (await response.json()) as {
      session?: { id?: string };
      invited?: Array<{ code: string; name: string }>;
    };
    const expeditionId = payload.session?.id ?? activeExpedition?.id ?? null;

    setActiveMode("group");
    setCurrentExpeditionId(expeditionId);
    setInvitingFriends(false);
    setSelectedInviteCodes([]);

    if ((payload.invited?.length ?? 0) > 0) {
      setInviteMessage(`Pozváno: ${payload.invited?.map((item) => item.name).join(", ")}.`);
    } else {
      setInviteMessage("Nikdo nový nešel právě teď pozvat.");
    }

    await fetchProfileOverview();
  }

  async function handleRemoveFriend(friendCode: string, friendName: string) {
    if (!supabase || !state.playerCode) {
      return;
    }

    const confirmed = window.confirm(`Opravdu chceš odebrat kamaráda ${friendName}?`);
    if (!confirmed) {
      return;
    }

    setRemovingFriendCode(friendCode);
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    const response = await fetch("/api/friends/remove", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({
        sourcePlayerCode: state.playerCode,
        targetPlayerCode: friendCode
      })
    }).catch(() => null);

    if (!response?.ok) {
      setRemovingFriendCode(null);
      const payload = (await response?.json().catch(() => ({}))) as { error?: string };
      if (payload.error === "rate_limited") {
        setInviteMessage("Moc pokusů o úpravu kamarádů. Zkus to za chvíli.");
      } else {
        setInviteMessage("Odebrání kamaráda se nepodařilo.");
      }
      return;
    }

    removeFriendByCode(friendCode);
    await fetchProfileOverview();
    setRemovingFriendCode(null);
    setInviteMessage(`${friendName} byl odebrán/a z kamarádů.`);
  }

  async function handleLogout() {
    if (supabase) {
      await supabase.auth.signOut().catch(() => null);
    }
    openParentAuthGate();
    router.replace("/");
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <section className="glass-card overflow-hidden p-5">
        <div className="flex items-center gap-4">
          <AvatarPreview config={state.profile.avatarConfig} emoji={state.profile.avatar} size={80} />
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.24em] text-mist">Profil hráče</p>
            <input
              value={nameDraft}
              onChange={(event) => {
                setNameDraft(event.target.value);
                setProfileMessageTone("neutral");
                setProfileMessage("Neuložené změny.");
              }}
              onBlur={() => void persistProfileName()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  (event.currentTarget as HTMLInputElement).blur();
                }
              }}
              className="mt-1 w-full bg-transparent text-2xl font-bold outline-none"
            />
            <button
              onClick={() => void persistProfileName()}
              disabled={savingProfile}
              className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-mist disabled:opacity-70"
            >
              {savingProfile ? "Ukládám…" : "Uložit jméno"}
            </button>
            <p className="mt-1 text-sm text-mist">
              {state.profile.age} let · {state.profile.title}
            </p>
            {savingProfile ? <p className="mt-1 text-xs text-mist">Ukládám profil…</p> : null}
            {!savingProfile && profileMessage ? (
              <p
                className={`mt-1 text-xs ${
                  profileMessageTone === "error"
                    ? "text-coral"
                    : profileMessageTone === "success"
                      ? "text-lime"
                      : "text-mist"
                }`}
              >
                {profileMessage}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xl font-semibold">{unlockedCount}</div>
            <div className="text-xs text-mist">Hry</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xl font-semibold">{score}</div>
            <div className="text-xs text-mist">Body</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xl font-semibold">{friends.length}</div>
            <div className="text-xs text-mist">Parta</div>
          </div>
        </div>
        <button
          onClick={() => void handleLogout()}
          className="mt-4 w-full rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-mist"
        >
          Odhlásit
        </button>
      </section>

      <section className="glass-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-lime">Profil</p>
            <h2 className="mt-2 text-xl font-semibold">Moje emoji</h2>
          </div>
          <button
            onClick={() => setAvatarStudioOpen((current) => !current)}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold"
          >
            {avatarStudioOpen ? "Zavřít" : "Upravit avatara"}
          </button>
        </div>
        {avatarStudioOpen ? (
          <>
            <p className="mt-2 text-sm text-mist">Vyber si jedno emoji. Každá změna se uloží automaticky.</p>

            <div className="mt-4 flex justify-center">
              <AvatarPreview config={avatarDraft} emoji={avatarEmojiDraft} size={132} />
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <p className="mb-3 text-sm font-medium">Vyber emoji</p>
                <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">
                  {EMOJI_AVATAR_OPTIONS.map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setAvatarEmojiDraft(option);
                        saveAvatarDebounced({
                          avatar: option,
                          avatarConfig: avatarDraft
                        });
                      }}
                      className={`group relative aspect-square overflow-hidden rounded-[22px] border transition ${
                        avatarEmojiDraft === option
                          ? "border-lime bg-lime/12 shadow-[0_0_0_1px_rgba(192,255,96,0.18)]"
                          : "border-white/8 bg-white/[0.03] hover:border-white/16 hover:bg-white/[0.05]"
                      }`}
                      aria-label={`Vybrat emoji ${option.replace("batuzek-", "")}`}
                    >
                      <div className="absolute inset-[10px] rounded-[18px] bg-night/40" />
                      <div className="relative z-10 mx-auto h-16 w-16 sm:h-[72px] sm:w-[72px]">
                        <Image
                          src={`/avatars/batuzek/${option}.png`}
                          alt={`Emoji ${option.replace("batuzek-", "")}`}
                          fill
                          sizes="72px"
                          className="object-contain"
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {savingAvatar ? <p className="text-center text-xs text-mist">Ukládám avatar…</p> : null}
              {avatarMessage ? (
                <p
                  className={`text-center text-xs ${
                    avatarMessageTone === "error"
                      ? "text-coral"
                      : avatarMessageTone === "success"
                        ? "text-lime"
                        : "text-mist"
                  }`}
                >
                  {avatarMessage}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">Moje hry</h2>
        {gameSummaries.length === 0 ? (
          <p className="mt-3 text-sm text-mist">Zatím tady nemáš žádnou rozehranou ani dokončenou hru.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-mist">Dokončené hry</div>
                <div className="mt-2 text-2xl font-bold text-white">{completedGamesCount}</div>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-mist">Rozehrané hry</div>
                <div className="mt-2 text-2xl font-bold text-white">{activeGamesCount}</div>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-mist">Celkové body</div>
                <div className="mt-2 text-2xl font-bold text-lime">{score}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { value: "all" as const, label: "Všechny", count: gameSummaries.length },
                { value: "active" as const, label: "Rozehrané", count: activeGamesCount },
                { value: "completed" as const, label: "Dokončené", count: completedGamesCount }
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setGamesFilter(tab.value)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    gamesFilter === tab.value ? "bg-lime text-night" : "bg-white/5 text-mist"
                  }`}
                >
                  {tab.label} <span className="ml-1 text-xs opacity-80">{tab.count}</span>
                </button>
              ))}
            </div>

            {filteredGames.length === 0 ? (
              <div className="rounded-2xl bg-white/5 p-4 text-sm text-mist">
                {gamesFilter === "active"
                  ? "Teď nemáš rozehranou žádnou hru."
                  : gamesFilter === "completed"
                    ? "Zatím nemáš dokončenou žádnou hru."
                    : "Zatím tady nejsou žádné hry k zobrazení."}
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  {visibleGames.map((game, index) => (
                    <div
                      key={game.id}
                      className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${
                        index !== visibleGames.length - 1 ? "border-b border-white/10" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-base font-semibold text-white">{game.name}</div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${
                              game.status === "active" ? "bg-sky/15 text-sky" : "bg-lime/15 text-lime"
                            }`}
                          >
                            {game.statusLabel}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-mist">
                          <span>{game.city}</span>
                          <span>{game.scoreLabel}</span>
                          {game.status === "completed" ? <span>Nejlepší uložený výsledek</span> : null}
                        </div>
                        {game.status === "active" && activeLocation?.id === game.id ? (
                          <div className="mt-2 text-xs text-mist">
                            Pokračuješ ve hře <span className="font-semibold text-white">{activeLocation.subtitle}</span>.
                          </div>
                        ) : null}
                      </div>
                      <button
                        onClick={() => router.push(game.href)}
                        className={`rounded-[18px] px-4 py-3 text-sm font-semibold ${
                          game.status === "active" ? "bg-lime text-night" : "bg-white/10 text-white"
                        }`}
                      >
                        {game.actionLabel}
                      </button>
                    </div>
                  ))}
                </div>

                {hasMoreGames ? (
                  <button
                    onClick={() => setVisibleGamesCount((current) => current + 6)}
                    className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
                  >
                    Zobrazit další
                  </button>
                ) : null}
              </>
            )}
          </div>
        )}
      </section>

      <MobileAppCard />

      <section className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-lime">Identita objevitele</p>
            <h2 className="mt-2 text-xl font-semibold">Můj kód</h2>
          </div>
          <div className="rounded-full bg-lime/12 px-3 py-2 text-xs text-lime">Solo tah</div>
        </div>
        <div className="mt-4 flex flex-col items-center gap-4 rounded-[24px] bg-white/5 p-4">
          <div className="rounded-xl border border-white/10 bg-night/70 px-3 py-2 text-sm font-semibold tracking-wide text-lime">
            {state.playerCode}
          </div>
          <p className="text-center text-sm leading-6 text-mist">
            Kamarád si tě přidá podle tohoto kódu.
          </p>
        </div>
      </section>

      <section id="add-friend" className="glass-card p-5">
        <h2 className="section-title">Přidat kamaráda</h2>
        {cloudReady === null ? (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-sm text-mist">Kontroluju přihlášení účtu…</p>
            <div className="mt-2 h-2 w-40 animate-pulse rounded-full bg-white/10" />
          </div>
        ) : null}
        {cloudReady === false ? (
          <div className="mt-3 rounded-2xl border border-coral/40 bg-coral/10 p-3">
            <p className="text-sm text-white">
              Profil tady ještě vidíš z uložených dat v zařízení, ale cloud účet už není přihlášený.
              Pro kamarády a další online akce je potřeba přihlásit se znovu.
            </p>
            <button
              onClick={() => {
                openParentAuthGate();
                router.replace("/");
              }}
              className="mt-3 rounded-xl bg-coral px-3 py-2 text-xs font-semibold text-white"
            >
              Přihlásit se znovu
            </button>
          </div>
        ) : null}
        {cloudReady === true ? (
          <div className="mt-4 space-y-3">
            <input
              value={friendCode}
              onChange={(event) => setFriendCode(event.target.value.toUpperCase())}
              placeholder="Kód kamaráda (např. BAT-AB12CD)"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-mist"
            />
            <p className="text-sm text-mist">Zadej kód kamaráda.</p>
            {friendCode.trim() ? (
              <p className="text-xs text-mist/80">
                Ověřím kód: <span className="font-semibold text-white/90">{friendCode.trim().toUpperCase()}</span>
              </p>
            ) : (
              <p className="text-xs text-mist/80">Tip: veřejný kód má tvar BAT-XXXXXX.</p>
            )}
            <button
              onClick={handleAddFriend}
              disabled={savingFriend}
              className="w-full rounded-[20px] bg-coral px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
            >
              {savingFriend ? "Přidávám..." : "Přidat kamaráda"}
            </button>
            {friendMessage ? (
              <p
                className={`text-sm ${
                  friendMessageTone === "error"
                    ? "text-coral"
                    : friendMessageTone === "success"
                      ? "text-lime"
                      : "text-mist"
                }`}
              >
                {friendMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

    </main>
  );
}
