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

type SquadMember = {
  name: string;
  joined: boolean;
};

type PlayerProfile = {
  name: string;
  age: number;
  title: string;
  avatar: string;
};

type AppState = {
  city: string;
  profile: PlayerProfile;
  completedLocationIds: string[];
  lastCompletedAt: Record<string, string>;
  activeMode: "solo" | "group";
  squadName: string;
  squadMembers: SquadMember[];
  safetyEmailsEnabled: boolean;
};

type AppStateContextValue = {
  state: AppState;
  hydrated: boolean;
  setCity: (city: string) => void;
  setActiveMode: (mode: "solo" | "group") => void;
  toggleMember: (name: string) => void;
  updateProfile: (profile: Partial<PlayerProfile>) => void;
  completeLocation: (locationId: string) => void;
  resetProgress: () => void;
  isLocationUnlocked: (locationId: string, defaultUnlocked?: boolean) => boolean;
};

const STORAGE_KEY = "pan-batoh-state";

const initialState: AppState = {
  city: "Praha",
  profile: {
    name: "Tyna",
    age: 12,
    title: "Lovec městských tajemství",
    avatar: "PB"
  },
  completedLocationIds: [],
  lastCompletedAt: {},
  activeMode: "group",
  squadName: "Lovci stop",
  squadMembers: [
    { name: "Tyna", joined: true },
    { name: "Ema", joined: true },
    { name: "Sofi", joined: false }
  ],
  safetyEmailsEnabled: true
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as AppState;
        setState({ ...initialState, ...parsed });
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

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const setCity = useCallback((city: string) => {
    setState((current) => (current.city === city ? current : { ...current, city }));
  }, []);

  const setActiveMode = useCallback((mode: "solo" | "group") => {
    setState((current) => (current.activeMode === mode ? current : { ...current, activeMode: mode }));
  }, []);

  const toggleMember = useCallback((name: string) => {
    setState((current) => ({
      ...current,
      squadMembers: current.squadMembers.map((member) =>
        member.name === name ? { ...member, joined: !member.joined } : member
      )
    }));
  }, []);

  const updateProfile = useCallback((profile: Partial<PlayerProfile>) => {
    setState((current) => ({
      ...current,
      profile: { ...current.profile, ...profile }
    }));
  }, []);

  const completeLocation = useCallback((locationId: string) => {
    setState((current) => ({
      ...current,
      completedLocationIds: current.completedLocationIds.includes(locationId)
        ? current.completedLocationIds
        : [...current.completedLocationIds, locationId],
      lastCompletedAt: {
        ...current.lastCompletedAt,
        [locationId]: new Date().toISOString()
      }
    }));
  }, []);

  const resetProgress = useCallback(() => {
    setState(initialState);
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
      setCity,
      setActiveMode,
      toggleMember,
      updateProfile,
      completeLocation,
      resetProgress,
      isLocationUnlocked
    }),
    [completeLocation, hydrated, isLocationUnlocked, resetProgress, setActiveMode, setCity, state, toggleMember, updateProfile]
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
