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
import { hasHistoricalLocationCompletion } from "@/lib/location-progress-state";
import { DEFAULT_AVATAR_ID } from "@/lib/avatars";

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
  title: string;
  avatar: string;
  avatarConfig: AvatarConfig;
};

type ActiveMissionSummary = {
  locationId: string;
  updatedAt: string;
} | null;

type AppState = {
  registrationCompleted: boolean;
  parentEmail: string;
  playerCode: string;
  profileCode: string;
  profileRowId: string | null;
  city: string;
  profile: PlayerProfile;
  completedLocationIds: string[];
  completedGameplayLocationIds: string[];
  activeMission: ActiveMissionSummary;
  lastCompletedAt: Record<string, string>;
  locationPenaltyPoints: Record<string, number>;
  locationBestScores: Record<string, number>;
  /** R38: název, město a maximum bodů hry z databáze (pro historii v profilu). */
  playedGames: Record<string, { name: string; city: string; maxScore: number }>;
  locationMaxScores: Record<string, number>;
  groupCompletionMembers: Record<string, string[]>;
  currentExpeditionId: string | null;
  activeMode: "solo" | "group";
  squadName: string;
  squadMembers: SquadMember[];
  safetyEmailsEnabled: boolean;
  trustedContacts: string[];
};

/**
 * R24: běžící výprava hráče. JEDINÝ zdroj pravdy pro otázku „mám tuhle hru
 * rozehranou?" – na detailu hry, na hlavní obrazovce i v profilu.
 * child_location_progress je od R23 jen nejlepší historický výsledek.
 */
export type ActiveRunSummary = {
  runId: string;
  locationId: string;
  title: string | null;
  city: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  closedTasks: number;
  totalTasks: number;
  /** Pozice spočítaná serverem z uzavřených úkolů (stejná funkce jako herní obrazovka). */
  position: {
    episodeIndex: number;
    taskIndex: number;
    episodeCount: number;
    taskCountInEpisode: number;
    stopName: string | null;
    taskTitle: string | null;
    allClosed: boolean;
  };
  taskProgress: Array<{ task_id: string; status: "correct" | "wrong" | "unknown"; attempts: number }>;
};

type AppStateContextValue = {
  state: AppState;
  hydrated: boolean;
  openParentAuthGate: () => void;
  completeRegistration: (payload: {
    name: string;
    parentEmail?: string;
    playerCode?: string;
    profileCode?: string;
    profileRowId?: string | null;
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
  toggleMember: (memberId: string) => void;
  updateProfile: (profile: Partial<PlayerProfile>) => void;
  syncCloudProfile: (payload: {
    childName?: string;
    playerCode?: string;
    profileCode?: string;
    profileRowId?: string | null;
    avatar?: string;
    avatarConfig?: AvatarConfig;
  }) => void;
  completeLocation: (
    locationId: string,
    options?: { participantIds?: string[]; penaltyPoints?: number; score?: number; maxScore?: number; source?: "gameplay" | "manual" | "expedition" }
  ) => void;
  /** R24: běžící výpravy hráče, seřazené od nejnovější aktivity. */
  activeRuns: ActiveRunSummary[];
  /** R24: znovu načte běžící výpravy ze serveru (po zahájení nebo dokončení hry). */
  refreshActiveRuns: () => Promise<void>;
  /**
   * R24: zahájení hry – najde běžící výpravu, a když žádná není, založí ji.
   * Stejná operace pro Hrát, Pokračovat i Hrát znovu. Vrací, zda se povedla.
   */
  startRun: (locationId: string) => Promise<{ ok: boolean; created: boolean }>;
  isLocationUnlocked: (locationId: string, defaultUnlocked?: boolean, requiredLocationId?: string | null) => boolean;
  getPlayerScore: () => number;
};

const STORAGE_KEY = "pan-batoh-state";
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
  playerCode: INITIAL_PUBLIC_CODE,
  profileCode: INITIAL_PUBLIC_CODE,
  profileRowId: null,
  city: "Praha",
  profile: {
    name: "Hráč",
    title: "Lovec městských tajemství",
    avatar: DEFAULT_AVATAR_ID,
    avatarConfig: {
      head: "round",
      eyes: "dot",
      hair: "short",
      color: "#7EC8FF"
    }
  },
  completedLocationIds: [],
  completedGameplayLocationIds: [],
  activeMission: null,
  lastCompletedAt: {},
  locationPenaltyPoints: {},
  locationBestScores: {},
  locationMaxScores: {},
  playedGames: {},
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

  // -------------------------------------------------------------------------
  // R24: běžící výpravy. Server je zdroj pravdy, drží se jen v paměti (neukládají
  // se do localStorage), aby aplikace nikdy neukazovala zastaralou rozehranost.
  // -------------------------------------------------------------------------
  const [activeRuns, setActiveRuns] = useState<ActiveRunSummary[]>([]);

  const callGameApi = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      const profileCode = stateRef.current.profileCode;
      if (!supabase || !profileCode) {
        return null;
      }
      const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      if (!accessToken) {
        return null;
      }
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ profileCode, ...body }),
        cache: "no-store"
      }).catch(() => null);
      if (!response?.ok) {
        return null;
      }
      return (await response.json().catch(() => null)) as Record<string, unknown> | null;
    },
    [supabase]
  );

  const refreshActiveRuns = useCallback(async () => {
    const payload = await callGameApi("/api/game/active-runs", {});
    if (!payload?.ok) {
      return;
    }
    const runs = Array.isArray(payload.runs) ? (payload.runs as ActiveRunSummary[]) : [];
    setActiveRuns(
      runs
        .filter((run) => Boolean(run?.locationId))
        .slice()
        .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
    );
  }, [callGameApi]);

  const startRun = useCallback(
    async (locationId: string) => {
      const payload = await callGameApi("/api/game/start-run", { locationId });
      if (!payload?.ok) {
        return { ok: false, created: false };
      }
      await refreshActiveRuns();
      // R25: `created` říká, jestli výprava právě vznikla. Podle toho se rozhoduje,
      // jestli hráč uvidí úvodní příběh, nebo pokračuje tam, kde skončil.
      return { ok: true, created: payload.created === true };
    },
    [callGameApi, refreshActiveRuns]
  );

  useEffect(() => {
    if (!hydrated || !state.registrationCompleted || !state.profileCode) {
      return;
    }
    void refreshActiveRuns();
  }, [hydrated, refreshActiveRuns, state.profileCode, state.registrationCompleted]);

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
          activeMission: parsed.activeMission ?? null,
          locationPenaltyPoints: parsed.locationPenaltyPoints ?? {},
          locationBestScores: (parsed as Partial<AppState>).locationBestScores ?? {},
          playedGames: (parsed as Partial<AppState>).playedGames ?? {},
          locationMaxScores: (parsed as Partial<AppState>).locationMaxScores ?? {},
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
        cloudHydratedForUserRef.current = null;
        return;
      }

      const accessToken = session.access_token ?? "";
      let childProfile: {
        id?: string;
        child_name: string;
        profile_code: string;
        player_code?: string;
        profile_id?: string | null;
        avatar?: string | null;
        avatar_config?: AvatarConfig | null;
      } | null = null;
      let remoteGames: Array<{ locationId: string; name: string; city: string; maxScore: number }> = [];
      let remoteRows: Array<{
        location_id: string;
        completed_at: string;
        updated_at?: string;
        penalty_points?: number | null;
        best_score?: number | null;
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
                  profile_code: string;
                  player_code?: string;
                  avatar?: string | null;
                  avatar_config?: AvatarConfig | null;
                } | null;
                profile_id?: string | null;
                games?: Array<{ locationId: string; name: string; city: string; maxScore: number }>;
                progress?: Array<{
                  location_id: string;
                  completed_at: string;
                  updated_at?: string;
                  penalty_points?: number | null;
                  best_score?: number | null;
                  first_completed_at?: string | null;
                  status?: "in_progress" | "completed" | null;
                }>;
              }
            | null;

          childProfile = payload?.profile ? { ...payload.profile, profile_id: payload.profile_id ?? null } : null;
          remoteRows = payload?.progress ?? [];
          remoteGames = payload?.games ?? [];
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
            completedLocationIds: [],
            completedGameplayLocationIds: [],
            activeMission: null,
            lastCompletedAt: {},
            locationPenaltyPoints: {},
            locationBestScores: {},
            locationMaxScores: {},
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
        const completedLocationIds = Array.from(new Set(remoteRows.filter((row) => hasHistoricalLocationCompletion(row)).map((row) => row.location_id)));
        const lastCompletedAt: Record<string, string> = {};
        const locationPenaltyPoints: Record<string, number> = {};
        const locationBestScores: Record<string, number> = {};
        const locationMaxScores: Record<string, number> = {};
        // R24: rozehranost už neurčuje tabulka nejlepších výsledků, ale běžící
        // výpravy (activeRuns). Pole activeMission zůstává jen kvůli tvaru uloženého
        // stavu a je vždy prázdné.
        const activeMission = null;

        // R38: maximum hry přichází z databáze (počet úkolů × body za úkol).
        // Dřív se dopočítávalo z obsahu v kódu, takže u Klamovky vycházelo 180
        // místo skutečných 190.
        const playedGames: AppState["playedGames"] = {};
        remoteGames.forEach((game) => {
          playedGames[game.locationId] = { name: game.name, city: game.city, maxScore: game.maxScore };
        });

        remoteRows.forEach((row) => {
          lastCompletedAt[row.location_id] = row.completed_at;
          if (typeof row.penalty_points === "number" && row.penalty_points >= 0) {
            locationPenaltyPoints[row.location_id] = row.penalty_points;
          }
          if (typeof (row as { best_score?: number | null }).best_score === "number" && (row as { best_score?: number | null }).best_score! >= 0) {
            locationBestScores[row.location_id] = Math.max(0, Math.floor((row as { best_score?: number | null }).best_score ?? 0));
          }
          const bestScore = locationBestScores[row.location_id];
          const missingPoints = locationPenaltyPoints[row.location_id];
          const dbMaxScore = playedGames[row.location_id]?.maxScore ?? 0;
          if (dbMaxScore > 0) {
            locationMaxScores[row.location_id] = dbMaxScore;
          } else if (typeof bestScore === "number" && typeof missingPoints === "number") {
            locationMaxScores[row.location_id] = bestScore + missingPoints;
          } else if (typeof bestScore === "number") {
            locationMaxScores[row.location_id] = bestScore;
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
          profile: {
            ...current.profile,
            name: shouldApplyRemoteProfile ? childProfile.child_name || current.profile.name : current.profile.name,
            avatar: shouldApplyRemoteProfile ? childProfile.avatar || current.profile.avatar : current.profile.avatar,
            avatarConfig: shouldApplyRemoteProfile
              ? childProfile.avatar_config || current.profile.avatarConfig
              : current.profile.avatarConfig
          },
          completedLocationIds,
          completedGameplayLocationIds: Array.from(
            new Set(remoteRows.filter((row) => Boolean((row as { first_completed_at?: string | null }).first_completed_at)).map((row) => row.location_id))
          ),
          activeMission,
          lastCompletedAt,
          locationPenaltyPoints,
          locationBestScores,
          locationMaxScores
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
      parentEmail,
      playerCode,
      profileCode,
      profileRowId,
      avatar,
      avatarConfig
    }: {
      name: string;
      parentEmail?: string;
      playerCode?: string;
      profileCode?: string;
      profileRowId?: string | null;
      avatar?: string;
      avatarConfig?: AvatarConfig;
    }) => {
      const trimmedName = name.trim();

      // Kritický přechod: dokončení registrace se musí do localStorage zapsat SYNCHRONNĚ,
      // ne až přes 150ms debounce níže. Jinak může reload stránky (např. auto-refresh
      // po aktualizaci service workeru) proběhnout dřív, než se stav uloží, a hráč
      // s platnou session i profilem znovu uvidí PlayerAuthGate.
      // Stav se odvozuje z stateRef.current (poslední commitnutý stav) a zapisuje se
      // jako celek; běžný debounce zůstává beze změny.
      const current = stateRef.current;
      const nextState: AppState = {
        ...current,
        registrationCompleted: true,
        parentEmail: (parentEmail ?? "").trim() || current.parentEmail,
        playerCode: playerCode || current.playerCode || profileCode || current.profileCode || generateProfileCode(),
        profileCode: profileCode || current.profileCode || generateProfileCode(),
        profileRowId: profileRowId || current.profileRowId || null,
        profile: {
          ...current.profile,
          name: trimmedName || current.profile.name,
          avatar: avatar?.trim() || current.profile.avatar,
          avatarConfig: avatarConfig || current.profile.avatarConfig
        },
        completedLocationIds: [],
        completedGameplayLocationIds: [],
        activeMission: null,
        lastCompletedAt: {},
        locationPenaltyPoints: {},
        locationBestScores: {},
        locationMaxScores: {},
        groupCompletionMembers: {},
        currentExpeditionId: null,
        activeMode: "solo",
        squadName: `${trimmedName || current.profile.name} a parta`,
        squadMembers: [{ id: SELF_MEMBER_ID, name: trimmedName || current.profile.name, joined: true }]
      };

      stateRef.current = nextState;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      } catch {
        // localStorage nemusí být dostupný – zůstane aspoň stav v paměti + debounce
      }
      setState(nextState);
    },
    []
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
      playerCode?: string;
      profileCode?: string;
      profileRowId?: string | null;
      avatar?: string;
      avatarConfig?: AvatarConfig;
    }) => {
      profileMutationVersionRef.current += 1;
      setState((current) => ({
        ...current,
        playerCode: payload.playerCode || current.playerCode,
        profileCode: payload.profileCode || current.profileCode,
        profileRowId: payload.profileRowId || current.profileRowId || null,
        profile: {
          ...current.profile,
          name: payload.childName || current.profile.name,
          avatar: payload.avatar || current.profile.avatar,
          avatarConfig: payload.avatarConfig || current.profile.avatarConfig
        }
      }));
    },
    []
  );

  const getPlayerScore = useCallback(() => {
    return state.completedLocationIds.reduce((sum, locationId) => {
      return sum + Math.max(0, state.locationBestScores[locationId] ?? 0);
    }, 0);
  }, [state.completedLocationIds, state.locationBestScores]);

  const completeLocation = useCallback((
    locationId: string,
    options?: { participantIds?: string[]; penaltyPoints?: number; score?: number; maxScore?: number; source?: "gameplay" | "manual" | "expedition" }
  ) => {
    // R24: dokončením se výprava uzavírá, takže hra přestává být rozehraná.
    setActiveRuns((current) => current.filter((run) => run.locationId !== locationId));
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
      locationBestScores: {
        ...current.locationBestScores,
        [locationId]: (() => {
          const incomingScore = Math.max(0, options?.score ?? 0);
          const existingScore = current.locationBestScores[locationId];
          return typeof existingScore === "number" ? Math.max(existingScore, incomingScore) : incomingScore;
        })()
      },
      locationMaxScores: {
        ...current.locationMaxScores,
        [locationId]: Math.max(
          options?.maxScore ?? 0,
          current.locationMaxScores[locationId] ?? 0,
          options?.maxScore ?? 0
        )
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
      activeMission: current.activeMission?.locationId === locationId ? null : current.activeMission,
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


  const openParentAuthGate = useCallback(() => {
    const nextCode = generateProfileCode();
    setState((current) => ({
      ...initialState,
      playerCode: nextCode,
      profileCode: nextCode,
      profileRowId: null,
      city: current.city
    }));
    cloudHydratedForUserRef.current = null;
  }, []);

  const isLocationUnlocked = useCallback(
    (locationId: string, defaultUnlocked = false, requiredLocationId?: string | null) => {
      // R20: když volající zná katalogový zámek z DB (unlock_after_mission_id → locationId),
      // rozhoduje výhradně on – fail-closed, bez ohledu na mock. null = bez podmínky.
      if (requiredLocationId !== undefined) {
        return requiredLocationId ? state.completedGameplayLocationIds.includes(requiredLocationId) : true;
      }
      // R38: bez katalogového zámku z databáze se rozhoduje jen podle výchozí
      // hodnoty. Dřív se tu sahalo do obsahu v kódu, který o hrách z Mozku neví.
      return defaultUnlocked;
    },
    [state.completedGameplayLocationIds]
  );

  const value = useMemo<AppStateContextValue>(
    () => ({
      state,
      hydrated,
      openParentAuthGate,
      completeRegistration,
      addFriendByCode,
      removeFriendByCode,
      setFriendsFromCloud,
      setTrustedContacts,
      setCity,
      setActiveMode,
      setCurrentExpeditionId,
      toggleMember,
      updateProfile,
      syncCloudProfile,
      completeLocation,
      activeRuns,
      refreshActiveRuns,
      startRun,
      isLocationUnlocked,
      getPlayerScore
    }),
    [
      activeRuns,
      refreshActiveRuns,
      startRun,
      completeLocation,
      addFriendByCode,
      removeFriendByCode,
      completeRegistration,
      setFriendsFromCloud,
      setTrustedContacts,
      hydrated,
      openParentAuthGate,
      isLocationUnlocked,
      getPlayerScore,
      setActiveMode,
      setCurrentExpeditionId,
      setCity,
      state,
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
