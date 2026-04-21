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
import { hashPin, normalizePin } from "@/lib/pin";
import { getSupabaseBrowserClient } from "@/lib/supabase";

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
  childPinHash: string | null;
  profileCode: string;
  city: string;
  profile: PlayerProfile;
  completedLocationIds: string[];
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
    profileCode?: string;
    childPin?: string;
    childPinHash?: string | null;
  }) => void;
  addFriendByCode: (payload: { friendCode: string; nickname?: string }) => { ok: boolean; message: string };
  removeFriendByCode: (friendCode: string) => void;
  setFriendsFromCloud: (friends: Array<{ code: string; name: string }>) => void;
  setTrustedContacts: (contacts: string[]) => void;
  setCity: (city: string) => void;
  setActiveMode: (mode: "solo" | "group") => void;
  setCurrentExpeditionId: (expeditionId: string | null) => void;
  unlockWithPin: (pin: string) => boolean;
  toggleMember: (memberId: string) => void;
  updateProfile: (profile: Partial<PlayerProfile>) => void;
  completeLocation: (locationId: string, options?: { participantIds?: string[]; penaltyPoints?: number }) => void;
  resetProgress: () => void;
  isLocationUnlocked: (locationId: string, defaultUnlocked?: boolean) => boolean;
  getPlayerScore: () => number;
};

const STORAGE_KEY = "pan-batoh-state";
const PIN_UNLOCKED_AT_KEY = "pan-batoh-pin-unlocked-at";
const PIN_UNLOCK_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const SELF_MEMBER_ID = "self";

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
  childPinHash: null,
  profileCode: generateProfileCode(),
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
  const cloudHydratedRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

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
          profile: {
            ...initialState.profile,
            ...(parsed.profile ?? {})
          },
          profileCode: parsed.profileCode || generateProfileCode(),
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

    if (!state.childPinHash) {
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
  }, [hydrated, state.childPinHash]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  useEffect(() => {
    async function hydrateCloudState() {
      if (!hydrated || cloudHydratedRef.current || !supabase || !state.registrationCompleted || !state.profileCode) {
        return;
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.user) {
        return;
      }

      const sessionEmail = session.user.email?.trim().toLowerCase() ?? "";
      const localParentEmail = state.parentEmail.trim().toLowerCase();

      if (localParentEmail && sessionEmail && localParentEmail !== sessionEmail) {
        setState((current) => ({
          ...initialState,
          registrationCompleted: false,
          parentEmail: session.user.email?.trim() ?? "",
          city: current.city
        }));
        setPinUnlocked(false);
        cloudHydratedRef.current = true;
        return;
      }

      const accessToken = session.access_token ?? "";
      let childProfile: {
        child_name: string;
        child_age: number;
        profile_code: string;
        pin_hash: string | null;
        avatar_config: Record<string, unknown> | null;
      } | null = null;
      let remoteRows: Array<{ location_id: string; completed_at: string; penalty_points?: number | null }> = [];

      if (accessToken) {
        const response = await fetch("/api/child-profile/me", {
          headers: { Authorization: `Bearer ${accessToken}` }
        }).catch(() => null);

        if (response?.ok) {
          const payload = (await response.json().catch(() => null)) as
            | {
                profile?: {
                  child_name: string;
                  child_age: number;
                  profile_code: string;
                  pin_hash: string | null;
                  avatar_config: Record<string, unknown> | null;
                } | null;
                progress?: Array<{ location_id: string; completed_at: string; penalty_points?: number | null }>;
              }
            | null;

          childProfile = payload?.profile ?? null;
          remoteRows = payload?.progress ?? [];
        }
      }

      if (!childProfile) {
        // Fallback direct read (if API unavailable): canonical = oldest row
        const { data: childProfiles } = await supabase
          .from("child_profiles")
          .select("child_name, child_age, profile_code, pin_hash, avatar_config, created_at")
          .eq("parent_user_id", session.user.id)
          .order("created_at", { ascending: true })
          .limit(1);

        childProfile = (childProfiles?.[0] as {
          child_name: string;
          child_age: number;
          profile_code: string;
          pin_hash: string | null;
          avatar_config: Record<string, unknown> | null;
        } | undefined) ?? null;
      }

      if (!childProfile) {
        setState((current) => ({
          ...current,
          registrationCompleted: false,
          childPinHash: null,
          completedLocationIds: [],
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
        }));
        setPinUnlocked(false);
        cloudHydratedRef.current = true;
        return;
      }

      const canonicalProfileCode = childProfile.profile_code || state.profileCode;
      if (remoteRows.length === 0) {
        const { data: progressRowsWithPenalty, error: progressRowsWithPenaltyError } = await supabase
          .from("child_location_progress")
          .select("location_id, completed_at, penalty_points")
          .eq("profile_code", canonicalProfileCode);
        if (progressRowsWithPenaltyError?.code === "42703") {
          const { data: progressRowsLegacy } = await supabase
            .from("child_location_progress")
            .select("location_id, completed_at")
            .eq("profile_code", canonicalProfileCode);
          remoteRows = (progressRowsLegacy as Array<{ location_id: string; completed_at: string }> | null) ?? [];
        } else {
          remoteRows =
            (progressRowsWithPenalty as Array<{ location_id: string; completed_at: string; penalty_points?: number | null }> | null) ??
            [];
        }
      }

      setState((current) => {
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
          profileCode: canonicalProfileCode,
          childPinHash: childProfile.pin_hash || current.childPinHash,
          profile: {
            ...current.profile,
            name: childProfile.child_name || current.profile.name,
            age: childProfile.child_age || current.profile.age,
            ...(dbAvatarConfig ? { avatarConfig: dbAvatarConfig } : {})
          },
          completedLocationIds,
          lastCompletedAt,
          locationPenaltyPoints
        };
      });

      cloudHydratedRef.current = true;
    }

    void hydrateCloudState();
  }, [hydrated, state.parentEmail, state.registrationCompleted, state.profileCode, supabase]);

  useEffect(() => {
    if (!hydrated || !supabase || !state.registrationCompleted || !state.profileCode || !cloudHydratedRef.current) {
      return;
    }

    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = window.setTimeout(() => {
      void (async () => {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session?.user) {
          return;
        }

        const progressRows = state.completedLocationIds.map((locationId) => ({
          profile_code: state.profileCode,
          location_id: locationId,
          completed_at: state.lastCompletedAt[locationId] ?? new Date().toISOString(),
          penalty_points: Math.max(0, state.locationPenaltyPoints[locationId] ?? 0)
        }));

        if (progressRows.length > 0) {
          const { error: upsertWithPenaltyError } = await supabase
            .from("child_location_progress")
            .upsert(progressRows, { onConflict: "profile_code,location_id" });

          if (upsertWithPenaltyError?.code === "42703") {
            const fallbackRows = progressRows.map(({ penalty_points: _ignoredPenalty, ...row }) => row);
            await supabase.from("child_location_progress").upsert(fallbackRows, { onConflict: "profile_code,location_id" });
          }
        }
      })();
    }, 300);

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [
    hydrated,
    state.registrationCompleted,
    state.profileCode,
    state.completedLocationIds,
    state.lastCompletedAt,
    state.locationPenaltyPoints,
    supabase
  ]);

  const setCity = useCallback((city: string) => {
    setState((current) => (current.city === city ? current : { ...current, city }));
  }, []);

  const completeRegistration = useCallback(
    ({
      name,
      age,
      parentEmail,
      profileCode,
      childPin,
      childPinHash
    }: {
      name: string;
      age: number;
      parentEmail: string;
      profileCode?: string;
      childPin?: string;
      childPinHash?: string | null;
    }) => {
      const trimmedName = name.trim();
      const initials = trimmedName
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2);

      setState((current) => ({
        ...current,
        registrationCompleted: true,
        parentEmail: parentEmail.trim(),
        childPinHash: childPin ? hashPin(childPin) : childPinHash ?? current.childPinHash,
        profileCode: profileCode || current.profileCode || generateProfileCode(),
        profile: {
          ...current.profile,
          name: trimmedName || current.profile.name,
          age,
          avatar: initials || current.profile.avatar
        },
        completedLocationIds: [],
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
    (pin: string) => {
      const normalized = normalizePin(pin);

      if (!state.childPinHash) {
        setPinUnlocked(true);
        return true;
      }

      if (normalized.length < 4) {
        return false;
      }

      const ok = hashPin(normalized) === state.childPinHash;

      if (ok) {
        setPinUnlocked(true);
        try {
          window.localStorage.setItem(PIN_UNLOCKED_AT_KEY, String(Date.now()));
        } catch {
          // ignore local storage write errors
        }
      }

      return ok;
    },
    [state.childPinHash]
  );

  const addFriendByCode = useCallback(
    ({ friendCode, nickname }: { friendCode: string; nickname?: string }) => {
      const normalizedFriendCode = normalizeCode(friendCode);
      const trimmedName = nickname?.trim() || "Kamarád";

      if (!normalizedFriendCode || normalizedFriendCode.length < 4) {
        return { ok: false, message: "Zadej platný kód kamaráda." };
      }

      if (normalizedFriendCode === normalizeCode(state.profileCode)) {
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
    [state.profileCode, state.squadMembers]
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
        if (!normalizedId || normalizedId === normalizeCode(current.profileCode)) {
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

  const getPlayerScore = useCallback(() => {
    const basePoints = state.completedLocationIds.length * 120;
    const penaltyPoints = Object.values(state.locationPenaltyPoints).reduce((sum, value) => sum + value, 0);
    return Math.max(0, basePoints - penaltyPoints);
  }, [state.completedLocationIds.length, state.locationPenaltyPoints]);

  const completeLocation = useCallback((locationId: string, options?: { participantIds?: string[]; penaltyPoints?: number }) => {
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
        void supabase.from("child_location_progress").delete().eq("profile_code", current.profileCode);
      }

      return {
        ...initialState,
        registrationCompleted: current.registrationCompleted,
        parentEmail: current.parentEmail,
        childPinHash: current.childPinHash,
        profileCode: current.profileCode,
        city: current.city,
        profile: current.profile,
        squadName: current.squadName,
        squadMembers: current.squadMembers
      };
    });
  }, [supabase]);

  const openParentAuthGate = useCallback(() => {
    setState((current) => ({
      ...current,
      registrationCompleted: false
    }));
    setPinUnlocked(false);
    try {
      window.localStorage.removeItem(PIN_UNLOCKED_AT_KEY);
    } catch {
      // ignore local storage write errors
    }
  }, []);

  const isLocationUnlocked = useCallback(
    (locationId: string, defaultUnlocked = false) =>
      defaultUnlocked || state.completedLocationIds.includes(locationId),
    [state.completedLocationIds]
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
      updateProfile
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
