"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { hashPin, normalizePin } from "@/lib/pin";

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
  }) => void;
  addFriendByCode: (payload: { friendCode: string; nickname?: string }) => { ok: boolean; message: string };
  setFriendsFromCloud: (friends: Array<{ code: string; name: string }>) => void;
  setCity: (city: string) => void;
  setActiveMode: (mode: "solo" | "group") => void;
  setCurrentExpeditionId: (expeditionId: string | null) => void;
  unlockWithPin: (pin: string) => boolean;
  toggleMember: (memberId: string) => void;
  updateProfile: (profile: Partial<PlayerProfile>) => void;
  completeLocation: (locationId: string, participantIds?: string[]) => void;
  resetProgress: () => void;
  isLocationUnlocked: (locationId: string, defaultUnlocked?: boolean) => boolean;
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

  const setCity = useCallback((city: string) => {
    setState((current) => (current.city === city ? current : { ...current, city }));
  }, []);

  const completeRegistration = useCallback(
    ({
      name,
      age,
      parentEmail,
      profileCode,
      childPin
    }: {
      name: string;
      age: number;
      parentEmail: string;
      profileCode?: string;
      childPin?: string;
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
        childPinHash: childPin ? hashPin(childPin) : current.childPinHash,
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

  const completeLocation = useCallback((locationId: string, participantIds?: string[]) => {
    setState((current) => ({
      ...current,
      completedLocationIds: current.completedLocationIds.includes(locationId)
        ? current.completedLocationIds
        : [...current.completedLocationIds, locationId],
      groupCompletionMembers: participantIds?.length
        ? {
            ...current.groupCompletionMembers,
            [locationId]: participantIds
          }
        : current.groupCompletionMembers,
      lastCompletedAt: {
        ...current.lastCompletedAt,
        [locationId]: new Date().toISOString()
      }
    }));
  }, []);

  const resetProgress = useCallback(() => {
    setState((current) => ({
      ...initialState,
      registrationCompleted: current.registrationCompleted,
      parentEmail: current.parentEmail,
      profileCode: current.profileCode,
      city: current.city,
      profile: current.profile,
      squadName: current.squadName,
      squadMembers: current.squadMembers
    }));
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
      completeRegistration,
      addFriendByCode,
      setFriendsFromCloud,
      setCity,
      setActiveMode,
      setCurrentExpeditionId,
      unlockWithPin,
      toggleMember,
      updateProfile,
      completeLocation,
      resetProgress,
      isLocationUnlocked
    }),
    [
      completeLocation,
      addFriendByCode,
      completeRegistration,
      setFriendsFromCloud,
      hydrated,
      pinUnlocked,
      isLocationUnlocked,
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
