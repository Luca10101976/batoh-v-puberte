"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { locations } from "@/lib/mock-data";
import { isLocationUnlockedByChain } from "@/lib/location-unlock";

type SquadMember = {
  id: string;
  name: string;
  joined: boolean;
};

export type AvatarConfig = {
  head: "round" | "oval" | "square";
  eyes: "dot" | "smile" | "wide";
  hair: "short" | "long" | "spiky";
  color: string;
};

type PlayerProfile = {
  name: string;
  age: number;
  title: string;
  avatar: string;
  avatarConfig: AvatarConfig;
};

type AppState = {
  registrationCompleted: boolean;
  parentEmail: string;
  hasChildPin: boolean;
  playerCode: string;
  profileCode: string;
  profileRowId: string | null;
  city: string;
  profile: PlayerProfile;
  completedLocationIds: string[];
  completedGameplayLocationIds: string[];
  lastCompletedAt: Record<string, string>;
  locationPenaltyPoints: Record<string, number>;
  groupCompletionMembers: Record<string, string[]>;
  currentExpeditionId: string | null;
  activeMode: "solo" | "group";
  squadName: string;
  squadMembers: SquadMember[];
  safetyEmailsEnabled: boolean;
  trustedContacts: string[];
};

type AppStateContextValue = {
  state: AppState;
  hydrated: boolean;
  pinUnlocked: boolean;
  openParentAuthGate: () => void;
  completeRegistration: (payload: {
    name: string;
    age: number;
    parentEmail: string;
    playerCode?: string;
    profileCode?: string;
    profileRowId?: string | null;
    hasChildPin?: boolean;
    avatar?: string;
    avatarConfig?: AvatarConfig;
  }) => void;
  addFriendByCode: (payload: { friendCode: string; nickname?: string }) => { ok: boolean; message: string };
  removeFriendByCode: (friendCode: string) => void;
  setFriendsFromCloud: (friends: Array<{ code: string; name: string }>) => void;
  setTrustedContacts: (contacts: string[]) => void;
  setCity: (city: string) => void;
  setActiveMode: (mode: "solo" | "group") => void;
  setCurrentExpeditionId: (expeditionId: string | null) => void;
  unlockWithPin: (pin: string) => Promise<{ ok: boolean; code?: string; message?: string }>;
  toggleMember: (memberId: string) => void;
  updateProfile: (profile: Partial<PlayerProfile>) => void;
  syncCloudProfile: (payload: {
    childName?: string;
    childAge?: number;
    playerCode?: string;
    profileCode?: string;
    profileRowId?: string | null;
    hasPin?: boolean;
    avatar?: string;
    avatarConfig?: AvatarConfig;
  }) => void;
  completeLocation: (
    locationId: string,
    options?: { participantIds?: string[]; penaltyPoints?: number; source?: "gameplay" | "manual" | "expedition" }
  ) => void;
  resetProgress: () => void;
  isLocationUnlocked: (locationId: string, defaultUnlocked?: boolean) => boolean;
  getPlayerScore: () => number;
};

const STORAGE_KEY = "pan-batoh-state";
const PIN_UNLOCKED_AT_KEY = "pan-batoh-pin-unlocked-at";
const PIN_UNLOCK_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const SELF_MEMBER_ID = "self";
const INITIAL_PUBLIC_CODE = generateProfileCode();

function generateProfileCode() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BAT-${random}`;
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

const initialState: AppState = {
  registrationCompleted: false,
  parentEmail: "",
  hasChildPin: false,
  playerCode: INITIAL_PUBLIC_CODE,
  profileCode: INITIAL_PUBLIC_CODE,
  profileRowId: null,
  city: "Praha",
  profile: {
    name: "Hráč",
    age: 11,
    title: "Lovec městských tajemství",
    avatar: "PB",
    avatarConfig: {
      head: "round",
      eyes: "dot",
      hair: "short",
      color: "#7EC8FF"
    }
  },
  completedLocationIds: [],
  completedGameplayLocationIds: [],
  lastCompletedAt: {},
  locationPenaltyPoints: {},
  groupCompletionMembers: {},
  currentExpeditionId: null,
  activeMode: "solo",
  squadName: "Moje výprava",
  squadMembers: [
    { id: SELF_MEMBER_ID, name: "Hráč", joined: true }
  ],
  safetyEmailsEnabled: true,
  trustedContacts: []
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [cloudRetryTick, setCloudRetryTick] = useState(0);
  const stateRef = useRef<AppState>(initialState);
  const cloudHydratedForUserRef = useRef<string | null>(null);
  const profileMutationVersionRef = useRef(0);
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!hydrated || !supabase) {
      return;
    }

    const client = supabase;
    let cancelled = false;

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) {
        return;
      }

      if (session?.user) {
        return;
      }

      // Ignore transient null-session events; only clear profile state on explicit sign-out.
      if (event === "SIGNED_OUT") {
        setState((current) =>
          current.registrationCompleted
            ? {
                ...current,
                registrationCompleted: false
              }
            : current
        );
        setPinUnlocked(false);
        cloudHydratedForUserRef.current = null;
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [hydrated, supabase]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as AppState;
        const migratedMembers = (parsed.squadMembers ?? initialState.squadMembers).map((member, index) => ({
          id: member.id || (index === 0 ? SELF_MEMBER_ID : `M-${index}`),
          name: member.name,
          joined: member.joined
        }));

        setState({
          ...initialState,
          ...parsed,
          hasChildPin:
            typeof (parsed as Partial<AppState>).hasChildPin === "boolean"
              ? Boolean((parsed as Partial<AppState>).hasChildPin)
              : Boolean((parsed as unknown as { childPinHash?: string | null }).childPinHash),
          profile: {
            ...initialState.profile,
            ...(parsed.profile ?? {})
          },
          playerCode: parsed.playerCode || parsed.profileCode || generateProfileCode(),
          profileCode: parsed.profileCode || parsed.playerCode || generateProfileCode(),
          profileRowId:
            typeof (parsed as Partial<AppState>).profileRowId === "string"
              ? (parsed as Partial<AppState>).profileRowId || null
              : null,
          locationPenaltyPoints: parsed.locationPenaltyPoints ?? {},
          groupCompletionMembers: parsed.groupCompletionMembers ?? {},
          currentExpeditionId: parsed.currentExpeditionId ?? null,
          squadMembers: migratedMembers
          ,
          trustedContacts: parsed.trustedContacts ?? []
        });
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!state.hasChildPin) {
      setPinUnlocked(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(PIN_UNLOCKED_AT_KEY);
      const unlockedAt = raw ? Number(raw) : 0;
      const stillValid = Number.isFinite(unlockedAt) && unlockedAt > 0 && Date.now() - unlockedAt < PIN_UNLOCK_TTL_MS;
      setPinUnlocked(stillValid);
    } catch {
      setPinUnlocked(false);
    }
  }, [hydrated, state.hasChildPin]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const writeTimer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateRef.current));
    }, 150);

    return () => {
      window.clearTimeout(writeTimer);
    };
  }, [hydrated, state]);

  useEffect(() => {
    let retryTimer: number | null = null;
    let hydrationTimer: number | null = null;

    async function hydrateCloudState() {
      const currentState = stateRef.current;
      if (!hydrated || !supabase) {
        return;
      }

      if (!currentState.registrationCompleted) {
        return;
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.user) {
        return;
      }

      if (cloudHydratedForUserRef.current === session.user.id) {
        return;
      }

      const hydrationStartMutationVersion = profileMutationVersionRef.current;

      const sessionEmail = session.user.email?.trim().toLowerCase() ?? "";
      const localParentEmail = currentState.parentEmail.trim().toLowerCase();

      if (localParentEmail && sessionEmail && localParentEmail !== sessionEmail) {
        const nextCode = generateProfileCode();
        setState((current) => ({
          ...initialState,
          playerCode: nextCode,
          profileCode: nextCode,
          profileRowId: null,
          registrationCompleted: false,
          parentEmail: session.user.email?.trim() ?? "",
          city: current.city
        }));
        setPinUnlocked(false);
        cloudHydratedForUserRef.current = null;
        return;
      }

      const accessToken = session.access_token ?? "";
      let childProfile: {
        id?: string;
        child_name: string;
        child_age: number;
        profile_code: string;
        player_code?: string;
        profile_id?: string | null;
        contact_email?: string | null;
        has_pin?: boolean;
        pin_updated_at?: string | null;
        avatar?: string | null;
        avatar_config?: AvatarConfig | null;
      } | null = null;
      let remoteRows: Array<{
        location_id: string;
        completed_at: string;
        penalty_points?: number | null;
        first_completed_at?: string | null;
        status?: "in_progress" | "completed" | null;
      }> = [];

      if (accessToken) {
        // Always hydrate from canonical profile row for the signed-in user.
        const profileUrl = "/api/child-profile/me?withProgress=1";
        const response = await fetch(profileUrl, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Cache-Control": "no-store"
          }
        }).catch(() => null);

        if (response?.ok) {
          const payload = (await response.json().catch(() => null)) as
            | {
                profile?: {
                  id?: string;
                  child_name: string;
                  child_age: number;
                  profile_code: string;
                  player_code?: string;
                  contact_email?: string | null;
                  has_pin?: boolean;
                  avatar?: string | null;
                  avatar_config?: AvatarConfig | null;
                } | null;
                profile_id?: string | null;
                progress?: Array<{
                  location_id: string;
                  completed_at: string;
                  penalty_points?: number | null;
                  first_completed_at?: string | null;
                  status?: "in_progress" | "completed" | null;
                }>;
              }
            | null;

          childProfile = payload?.profile ? { ...payload.profile, profile_id: payload.profile_id ?? null } : null;
          remoteRows = payload?.progress ?? [];
        }
      }

      // Do not use direct table fallback here.
      // Profile hydration must stay on one canonical source (/api/child-profile/me),
      // otherwise stale historical rows can overwrite fresh name/avatar.

      if (!childProfile) {
        setState((current) => {
          // Keep already completed local registration to avoid auth-gate flicker
          // during transient cloud/API failures. Hard reset happens only on explicit sign-out.
          if (current.registrationCompleted) {
            return current;
          }

          return {
            ...current,
            registrationCompleted: false,
            hasChildPin: false,
            completedLocationIds: [],
            completedGameplayLocationIds: [],
            lastCompletedAt: {},
            locationPenaltyPoints: {},
            groupCompletionMembers: {},
            currentExpeditionId: null,
            activeMode: "solo",
            squadMembers: [
              {
                id: SELF_MEMBER_ID,
                name: current.profile.name || "Hráč",
                joined: true
              }
            ]
          };
        });
        retryTimer = window.setTimeout(() => {
          setCloudRetryTick((value) => value + 1);
        }, 1200);
        return;
      }

      const canonicalProfileCode = childProfile.profile_code || currentState.profileCode;
      const canonicalPlayerCode = childProfile.player_code || childProfile.profile_code || currentState.playerCode;
      setState((current) => {
        const shouldApplyRemoteProfile = profileMutationVersionRef.current === hydrationStartMutationVersion;
        const completedLocationIds = Array.from(new Set(remoteRows.map((row) => row.location_id)));
        const lastCompletedAt: Record<string, string> = {};
        const locationPenaltyPoints: Record<string, number> = {};

        remoteRows.forEach((row) => {
          lastCompletedAt[row.location_id] = row.completed_at;
          if (typeof row.penalty_points === "number" && row.penalty_points >= 0) {
            locationPenaltyPoints[row.location_id] = row.penalty_points;
          }
        });

        // Merge avatar_config from DB if present (cross-device sync).
        // Falls back to current localStorage value if DB has no avatar_config yet.
        const dbAvatarConfig = childProfile.avatar_config as AvatarConfig | null | undefined;
        return {
          ...current,
          registrationCompleted: true,
          parentEmail: session.user.email?.trim() || current.parentEmail,
          playerCode: canonicalPlayerCode,
          profileCode: canonicalProfileCode,
          profileRowId: childProfile.profile_id || current.profileRowId,
          hasChildPin: false,
          profile: {
            ...current.profile,
            name: shouldApplyRemoteProfile ? childProfile.child_name || current.profile.name : current.profile.name,
            age: shouldApplyRemoteProfile ? childProfile.child_age || current.profile.age : current.profile.age,
            avatar: shouldApplyRemoteProfile ? childProfile.avatar || current.profile.avatar : current.profile.avatar,
            avatarConfig: shouldApplyRemoteProfile
              ? childProfile.avatar_config || current.profile.avatarConfig
              : current.profile.avatarConfig
          },
          completedLocationIds,
          completedGameplayLocationIds: Array.from(
            new Set(remoteRows.filter((row) => Boolean((row as { first_completed_at?: string | null }).first_completed_at)).map((row) => row.location_id))
          ),
          lastCompletedAt,
          locationPenaltyPoints
        };
      });

      cloudHydratedForUserRef.current = session.user.id;
    }

    hydrationTimer = window.setTimeout(() => {
      void hydrateCloudState();
    }, 900);

    return () => {
      if (hydrationTimer) {
        window.clearTimeout(hydrationTimer);
      }
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [cloudRetryTick, hydrated, supabase]);

  const setCity = useCallback((city: string) => {
    setState((current) => (current.city === city ? current : { ...current, city }));
  }, []);

  const completeRegistration = useCallback(
    ({
      name,
      age,
      parentEmail,
      playerCode,
      profileCode,
      profileRowId,
      hasChildPin,
      avatar,
      avatarConfig
    }: {
      name: string;
      age: number;
      parentEmail: string;
      playerCode?: string;
      profileCode?: string;
      profileRowId?: string | null;
      hasChildPin?: boolean;
      avatar?: string;
      avatarConfig?: AvatarConfig;
    }) => {
      const trimmedName = name.trim();

      setState((current) => ({
        ...current,
        registrationCompleted: true,
        parentEmail: parentEmail.trim(),
        hasChildPin: false,
        playerCode: playerCode || current.playerCode || profileCode || current.profileCode || generateProfileCode(),
        profileCode: profileCode || current.profileCode || generateProfileCode(),
        profileRowId: profileRowId || current.profileRowId || null,
        profile: {
          ...current.profile,
          name: trimmedName || current.profile.name,
          age,
          avatar: avatar?.trim() || current.profile.avatar,
          avatarConfig: avatarConfig || current.profile.avatarConfig
        },
        completedLocationIds: [],
        completedGameplayLocationIds: [],
        lastCompletedAt: {},
        locationPenaltyPoints: {},
        groupCompletionMembers: {},
        currentExpeditionId: null,
        activeMode: "solo",
        squadName: `${trimmedName || current.profile.name} a parta`,
        squadMembers: [{ id: SELF_MEMBER_ID, name: trimmedName || current.profile.name, joined: true }]
      }));
      setPinUnlocked(true);
      try {
        window.localStorage.setItem(PIN_UNLOCKED_AT_KEY, String(Date.now()));
      } catch {
        // ignore local storage write errors
      }
    },
    []
  );

  const unlockWithPin = useCallback(
    async (pin: string) => {
      if (!state.hasChildPin) {
        setPinUnlocked(true);
        return { ok: true };
      }

      if (!supabase) {
        return { ok: false, code: "config_error", message: "Supabase klient není dostupný." };
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token ?? "";
      if (!accessToken) {
        return { ok: false, code: "unauthorized", message: "Účet není přihlášený." };
      }

      const response = await fetch("/api/pin/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          pin,
          profileCode: state.profileCode
        })
      }).catch(() => null);

      if (!response) {
        return { ok: false, code: "network_error", message: "Ověření PINu se nepodařilo." };
      }

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; code?: string; message?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        return {
          ok: false,
          code: payload?.code ?? "pin_verify_failed",
          message: payload?.message ?? "PIN nesedí."
        };
      }

      setPinUnlocked(true);
      try {
        window.localStorage.setItem(PIN_UNLOCKED_AT_KEY, String(Date.now()));
      } catch {
        // ignore local storage write errors
      }

      return { ok: true };
    },
    [state.hasChildPin, state.profileCode, supabase]
  );

  const addFriendByCode = useCallback(
    ({ friendCode, nickname }: { friendCode: string; nickname?: string }) => {
      const normalizedFriendCode = normalizeCode(friendCode);
      const trimmedName = nickname?.trim() || "Kamarád";

      if (!normalizedFriendCode || normalizedFriendCode.length < 4) {
        return { ok: false, message: "Zadej platný kód kamaráda." };
      }

      if (normalizedFriendCode === normalizeCode(state.playerCode)) {
        return { ok: false, message: "Tohle je tvůj vlastní kód." };
      }

      const alreadyAdded = state.squadMembers.some((member) => member.id === normalizedFriendCode);

      if (alreadyAdded) {
        return { ok: false, message: "Tohohle kamaráda už máš přidaného." };
      }

      setState((current) => ({
        ...current,
        squadMembers: [
          ...current.squadMembers,
          {
            id: normalizedFriendCode,
            name: trimmedName,
            joined: true
          }
        ]
      }));

      return { ok: true, message: "Kamarád byl přidán do tvé party." };
    },
    [state.playerCode, state.squadMembers]
  );

  const setFriendsFromCloud = useCallback((friends: Array<{ code: string; name: string }>) => {
    setState((current) => {
      const selfMember = current.squadMembers.find((member) => member.id === SELF_MEMBER_ID) ?? {
        id: SELF_MEMBER_ID,
        name: current.profile.name,
        joined: true
      };

      const mergedFriends = new Map<string, SquadMember>();

      friends.forEach((friend) => {
        const normalizedId = normalizeCode(friend.code);
        if (!normalizedId || normalizedId === normalizeCode(current.playerCode)) {
          return;
        }

        mergedFriends.set(normalizedId, {
          id: normalizedId,
          name: friend.name || "Kamarád",
          joined: false
        });
      });

      return {
        ...current,
        squadMembers: [
          { ...selfMember, name: current.profile.name, joined: true },
          ...Array.from(mergedFriends.values())
        ]
      };
    });
  }, []);

  const setTrustedContacts = useCallback((contacts: string[]) => {
    const normalized = contacts
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 2);
    setState((current) => ({
      ...current,
      trustedContacts: normalized
    }));
  }, []);

  const removeFriendByCode = useCallback((friendCode: string) => {
    const normalized = normalizeCode(friendCode);
    setState((current) => ({
      ...current,
      squadMembers: current.squadMembers.filter((member) => member.id === SELF_MEMBER_ID || member.id !== normalized)
    }));
  }, []);

  const setActiveMode = useCallback((mode: "solo" | "group") => {
    setState((current) => (current.activeMode === mode ? current : { ...current, activeMode: mode }));
  }, []);

  const setCurrentExpeditionId = useCallback((expeditionId: string | null) => {
    setState((current) =>
      current.currentExpeditionId === expeditionId ? current : { ...current, currentExpeditionId: expeditionId }
    );
  }, []);

  const toggleMember = useCallback((memberId: string) => {
    setState((current) => ({
      ...current,
      squadMembers: current.squadMembers.map((member) =>
        member.id === memberId ? { ...member, joined: !member.joined } : member
      )
    }));
  }, []);

  const updateProfile = useCallback((profile: Partial<PlayerProfile>) => {
    setState((current) => ({
      ...current,
      profile: { ...current.profile, ...profile }
    }));
  }, []);

  const syncCloudProfile = useCallback(
    (payload: {
      childName?: string;
      childAge?: number;
      playerCode?: string;
      profileCode?: string;
      profileRowId?: string | null;
      hasPin?: boolean;
      avatar?: string;
      avatarConfig?: AvatarConfig;
    }) => {
      profileMutationVersionRef.current += 1;
      setState((current) => ({
        ...current,
        playerCode: payload.playerCode || current.playerCode,
        profileCode: payload.profileCode || current.profileCode,
        profileRowId: payload.profileRowId || current.profileRowId || null,
        hasChildPin: false,
        profile: {
          ...current.profile,
          name: payload.childName || current.profile.name,
          age: payload.childAge || current.profile.age,
          avatar: payload.avatar || current.profile.avatar,
          avatarConfig: payload.avatarConfig || current.profile.avatarConfig
        }
      }));
    },
    []
  );

  const getPlayerScore = useCallback(() => {
    const basePoints = state.completedLocationIds.length * 120;
    const penaltyPoints = Object.values(state.locationPenaltyPoints).reduce((sum, value) => sum + value, 0);
    return Math.max(0, basePoints - penaltyPoints);
  }, [state.completedLocationIds.length, state.locationPenaltyPoints]);

  const completeLocation = useCallback((
    locationId: string,
    options?: { participantIds?: string[]; penaltyPoints?: number; source?: "gameplay" | "manual" | "expedition" }
  ) => {
    setState((current) => ({
      ...current,
      locationPenaltyPoints: {
        ...current.locationPenaltyPoints,
        [locationId]: (() => {
          const incomingPenalty = Math.max(0, options?.penaltyPoints ?? 0);
          const existingPenalty = current.locationPenaltyPoints[locationId];
          return typeof existingPenalty === "number" ? Math.min(existingPenalty, incomingPenalty) : incomingPenalty;
        })()
      },
      completedLocationIds: current.completedLocationIds.includes(locationId)
        ? current.completedLocationIds
        : [...current.completedLocationIds, locationId],
      completedGameplayLocationIds:
        options?.source === "manual"
          ? current.completedGameplayLocationIds
          : current.completedGameplayLocationIds.includes(locationId)
            ? current.completedGameplayLocationIds
            : [...current.completedGameplayLocationIds, locationId],
      groupCompletionMembers: options?.participantIds?.length
        ? {
            ...current.groupCompletionMembers,
            [locationId]: options.participantIds
          }
        : current.groupCompletionMembers,
      lastCompletedAt: {
        ...current.lastCompletedAt,
        [locationId]: new Date().toISOString()
      }
    }));
  }, []);

  const resetProgress = useCallback(() => {
    setState((current) => {
      if (supabase && current.profileCode) {
        void supabase.auth.getSession().then(({ data }) => {
          const accessToken = data.session?.access_token ?? "";
          if (!accessToken) {
            return;
          }
          void fetch("/api/game/reset-progress", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify({ profileCode: current.profileCode })
          });
        });
      }

      return {
        ...initialState,
        registrationCompleted: current.registrationCompleted,
        parentEmail: current.parentEmail,
        hasChildPin: current.hasChildPin,
        playerCode: current.playerCode,
        profileCode: current.profileCode,
        profileRowId: current.profileRowId,
        city: current.city,
        profile: current.profile,
        squadName: current.squadName,
        squadMembers: current.squadMembers
      };
    });
  }, [supabase]);

  const openParentAuthGate = useCallback(() => {
    const nextCode = generateProfileCode();
    setState((current) => ({
      ...initialState,
      playerCode: nextCode,
      profileCode: nextCode,
      profileRowId: null,
      city: current.city
    }));
    setPinUnlocked(false);
    cloudHydratedForUserRef.current = null;
    try {
      window.localStorage.removeItem(PIN_UNLOCKED_AT_KEY);
    } catch {
      // ignore local storage write errors
    }
  }, []);

  const isLocationUnlocked = useCallback(
    (locationId: string, defaultUnlocked = false) => {
      const location = locations.find((item) => item.id === locationId);
      if (!location) {
        return defaultUnlocked;
      }
      return isLocationUnlockedByChain(location, state.completedGameplayLocationIds, locations, defaultUnlocked);
    },
    [state.completedGameplayLocationIds]
  );

  const value = useMemo<AppStateContextValue>(
    () => ({
      state,
      hydrated,
      pinUnlocked,
      openParentAuthGate,
      completeRegistration,
      addFriendByCode,
      removeFriendByCode,
      setFriendsFromCloud,
      setTrustedContacts,
      setCity,
      setActiveMode,
      setCurrentExpeditionId,
      unlockWithPin,
      toggleMember,
      updateProfile,
      syncCloudProfile,
      completeLocation,
      resetProgress,
      isLocationUnlocked,
      getPlayerScore
    }),
    [
      completeLocation,
      addFriendByCode,
      removeFriendByCode,
      completeRegistration,
      setFriendsFromCloud,
      setTrustedContacts,
      hydrated,
      pinUnlocked,
      openParentAuthGate,
      isLocationUnlocked,
      getPlayerScore,
      resetProgress,
      setActiveMode,
      setCurrentExpeditionId,
      setCity,
      state,
      unlockWithPin,
      toggleMember,
      updateProfile,
      syncCloudProfile
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error("useAppState must be used inside AppStateProvider");
  }

  return context;
}
