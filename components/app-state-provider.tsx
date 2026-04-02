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
};

type AppStateContextValue = {
  state: AppState;
  hydrated: boolean;
  pinUnlocked: boolean;
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
    name: "Tyna",
    age: 12,
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
  activeMode: "group",
  squadName: "Lovci stop",
  squadMembers: [
    { id: SELF_MEMBER_ID, name: "Tyna", joined: true }
  ],
  safetyEmailsEnabled: true
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

    setPinUnlocked(!state.childPinHash);
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

      const { data: childProfile } = await supabase
        .from("child_profiles")
        .select("child_name, child_age")
        .eq("profile_code", state.profileCode)
        .eq("parent_user_id", session.user.id)
        .limit(1)
        .maybeSingle<{ child_name: string; child_age: number }>();

      if (!childProfile) {
        cloudHydratedRef.current = true;
        return;
      }

      const { data: pinRow } = await supabase
        .from("child_profiles")
        .select("pin_hash")
        .eq("profile_code", state.profileCode)
        .eq("parent_user_id", session.user.id)
        .limit(1)
        .maybeSingle<{ pin_hash: string | null }>();

      const { data: progressRows } = await supabase
        .from("child_location_progress")
        .select("location_id, completed_at")
        .eq("profile_code", state.profileCode);

      const remoteRows = (progressRows as Array<{ location_id: string; completed_at: string }> | null) ?? [];

      setState((current) => {
        const completedLocationIds = Array.from(
          new Set([...current.completedLocationIds, ...remoteRows.map((row) => row.location_id)])
        );
        const lastCompletedAt = { ...current.lastCompletedAt };

        remoteRows.forEach((row) => {
          const existing = lastCompletedAt[row.location_id];
          if (!existing || new Date(row.completed_at).getTime() > new Date(existing).getTime()) {
            lastCompletedAt[row.location_id] = row.completed_at;
          }
        });

        return {
          ...current,
          childPinHash: pinRow?.pin_hash || current.childPinHash,
          profile: {
            ...current.profile,
            name: childProfile.child_name || current.profile.name,
            age: childProfile.child_age || current.profile.age
          },
          completedLocationIds,
          lastCompletedAt
        };
      });

      cloudHydratedRef.current = true;
    }

    void hydrateCloudState();
  }, [hydrated, state.registrationCompleted, state.profileCode, supabase]);

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
          completed_at: state.lastCompletedAt[locationId] ?? new Date().toISOString()
        }));

        if (progressRows.length > 0) {
          await supabase.from("child_location_progress").upsert(progressRows, { onConflict: "profile_code,location_id" });
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
        squadName: `${trimmedName || current.profile.name} a parta`,
        squadMembers: current.squadMembers.map((member) =>
          member.id === SELF_MEMBER_ID
            ? { ...member, name: trimmedName || member.name, joined: true }
            : member
        )
      }));
      setPinUnlocked(true);
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

      current.squadMembers
        .filter((member) => member.id !== SELF_MEMBER_ID)
        .forEach((member) => {
          mergedFriends.set(normalizeCode(member.id), {
            ...member,
            id: normalizeCode(member.id)
          });
        });

      friends.forEach((friend) => {
        const normalizedId = normalizeCode(friend.code);
        const existing = mergedFriends.get(normalizedId);

        mergedFriends.set(normalizedId, {
          id: normalizedId,
          name: friend.name || existing?.name || "Kamarád",
          joined: existing?.joined ?? true
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
      completeRegistration,
      addFriendByCode,
      removeFriendByCode,
      setFriendsFromCloud,
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
      hydrated,
      pinUnlocked,
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
