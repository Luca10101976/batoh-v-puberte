"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type AvatarConfig, useAppState } from "@/components/app-state-provider";
import { MobileAppCard } from "@/components/mobile-app-card";
import { locations } from "@/lib/mock-data";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type ChildProfileRow = {
  id: string;
  child_name: string;
  profile_code: string;
};

type ChildFriendshipRow = {
  friend_profile_code: string;
  friend_display_name: string;
};

type IncomingFriendshipRow = {
  child_profile_id: string;
};

type SentInviteRow = {
  id: string;
  invitee_display_name: string;
  created_at: string;
};

type ResolvedFriendProfile = {
  id: string;
  name: string;
  code: string;
};

const HEAD_OPTIONS: Array<{ value: AvatarConfig["head"]; label: string }> = [
  { value: "round", label: "Kulatá" },
  { value: "oval", label: "Oválná" },
  { value: "square", label: "Hranatá" }
];

const EYE_OPTIONS: Array<{ value: AvatarConfig["eyes"]; label: string }> = [
  { value: "dot", label: "Tečky" },
  { value: "smile", label: "Úsměv" },
  { value: "wide", label: "Velké" }
];

const HAIR_OPTIONS: Array<{ value: AvatarConfig["hair"]; label: string }> = [
  { value: "short", label: "Krátké" },
  { value: "long", label: "Dlouhé" },
  { value: "spiky", label: "Rozcuch" }
];

const COLOR_OPTIONS = ["#7EC8FF", "#B6F07A", "#FFC27A", "#FF9FC3", "#D2B6FF", "#FFD95A"];
type AvatarPanel = "head" | "eyes" | "hair" | "color";

function AvatarPreview({ config, size = 80 }: { config: AvatarConfig; size?: number }) {
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
    updateProfile,
    isLocationUnlocked,
    addFriendByCode,
    removeFriendByCode,
    setFriendsFromCloud,
    setTrustedContacts,
    setActiveMode,
    setCurrentExpeditionId,
    getPlayerScore,
    openParentAuthGate
  } = useAppState();
  const [friendCode, setFriendCode] = useState("");
  const [friendMessage, setFriendMessage] = useState("");
  const [savingFriend, setSavingFriend] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [blockingFriendCode, setBlockingFriendCode] = useState<string | null>(null);
  const [sentInvites, setSentInvites] = useState<SentInviteRow[]>([]);
  const [cancelingInviteId, setCancelingInviteId] = useState<string | null>(null);
  const [cloudReady, setCloudReady] = useState<boolean | null>(null);
  const [trustedContact1, setTrustedContact1] = useState(state.trustedContacts[0] ?? "");
  const [trustedContact2, setTrustedContact2] = useState(state.trustedContacts[1] ?? "");
  const [invitingFriendCode, setInvitingFriendCode] = useState<string | null>(null);
  const [avatarDraft, setAvatarDraft] = useState<AvatarConfig>(state.profile.avatarConfig);
  const [avatarStudioOpen, setAvatarStudioOpen] = useState(false);
  const [openAvatarPanel, setOpenAvatarPanel] = useState<AvatarPanel | null>("head");
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
  const completedMissions = useMemo(
    () => locations.filter((location) => state.completedLocationIds.includes(location.id)),
    [state.completedLocationIds]
  );
  const friends = state.squadMembers.filter((member) => member.id !== "self");
  const score = getPlayerScore();

  useEffect(() => {
    setAvatarDraft(state.profile.avatarConfig);
  }, [state.profile.avatarConfig]);

  useEffect(() => {
    setTrustedContact1(state.trustedContacts[0] ?? "");
    setTrustedContact2(state.trustedContacts[1] ?? "");
  }, [state.trustedContacts]);

  useEffect(() => {
    async function checkCloudSession() {
      if (!supabase) {
        setCloudReady(false);
        return;
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      setCloudReady(Boolean(session?.user));
    }

    void checkCloudSession();
  }, [supabase]);

  function selectedLabel(options: Array<{ value: string; label: string }>, value: string) {
    return options.find((option) => option.value === value)?.label ?? value;
  }

  useEffect(() => {
    async function syncCloudFriends() {
      if (!supabase || !state.profileCode) {
        return;
      }

      const { data: ownProfile } = await supabase
        .from("child_profiles")
        .select("id")
        .eq("profile_code", state.profileCode)
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (!ownProfile?.id) {
        return;
      }

      const [{ data: outgoingFriendships }, { data: incomingFriendships }] = await Promise.all([
        supabase
          .from("child_friendships")
          .select("friend_profile_code, friend_display_name")
          .eq("child_profile_id", ownProfile.id),
        supabase.from("child_friendships").select("child_profile_id").eq("friend_child_profile_id", ownProfile.id)
      ]);

      const incomingIds = ((incomingFriendships as IncomingFriendshipRow[] | null) ?? []).map(
        (row) => row.child_profile_id
      );

      let incomingProfiles: Array<{ profile_code: string; child_name: string }> = [];

      if (incomingIds.length > 0) {
        const { data } = await supabase
          .from("child_profiles")
          .select("profile_code, child_name")
          .in("id", incomingIds);

        incomingProfiles = (data as Array<{ profile_code: string; child_name: string }> | null) ?? [];
      }

      const merged = [
        ...(((outgoingFriendships as ChildFriendshipRow[] | null) ?? []).map((row) => ({
          code: row.friend_profile_code,
          name: row.friend_display_name
        })) as Array<{ code: string; name: string }>),
        ...incomingProfiles.map((profile) => ({
          code: profile.profile_code,
          name: profile.child_name
        }))
      ];

      if (merged.length === 0) {
        return;
      }

      setFriendsFromCloud(merged);
    }

    syncCloudFriends();
  }, [setFriendsFromCloud, state.profileCode, supabase]);

  useEffect(() => {
    async function loadSentInvites() {
      if (!supabase || !state.profileCode) {
        setSentInvites([]);
        return;
      }

      const { data: ownProfile } = await supabase
        .from("child_profiles")
        .select("id")
        .eq("profile_code", state.profileCode)
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (!ownProfile?.id) {
        setSentInvites([]);
        return;
      }

      const { data } = await supabase
        .from("child_expedition_invites")
        .select("id, invitee_display_name, created_at")
        .eq("inviter_child_profile_id", ownProfile.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10);

      setSentInvites((data as SentInviteRow[] | null) ?? []);
    }

    void loadSentInvites();
  }, [state.profileCode, supabase, inviteMessage]);

  useEffect(() => {
    if (!supabase || !state.profileCode) {
      return;
    }

    const channel = supabase
      .channel(`profile-live-${state.profileCode}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "child_friendships" },
        () => {
          void (async () => {
            const { data: ownProfile } = await supabase
              .from("child_profiles")
              .select("id")
              .eq("profile_code", state.profileCode)
              .limit(1)
              .maybeSingle<{ id: string }>();
            if (!ownProfile?.id) {
              return;
            }
            const { data: outgoingFriendships } = await supabase
              .from("child_friendships")
              .select("friend_profile_code, friend_display_name")
              .eq("child_profile_id", ownProfile.id);

            const merged = (((outgoingFriendships as ChildFriendshipRow[] | null) ?? []).map((row) => ({
              code: row.friend_profile_code,
              name: row.friend_display_name
            })) as Array<{ code: string; name: string }>);

            setFriendsFromCloud(merged);
          })();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [setFriendsFromCloud, state.profileCode, supabase]);

  async function ensureOwnCloudProfile() {
    if (!supabase) {
      return null;
    }

    const { data: existing } = await supabase
      .from("child_profiles")
      .select("id, child_name, profile_code")
      .eq("profile_code", state.profileCode)
      .limit(1)
      .maybeSingle<ChildProfileRow>();

    if (existing) {
      return existing;
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return null;
    }

    const safeAge = Math.min(16, Math.max(8, Number(state.profile.age) || 11));
    const safeName = state.profile.name.trim() || "Hráč";

    const { error } = await supabase.from("child_profiles").upsert(
      {
        parent_user_id: session.user.id,
        child_name: safeName,
        child_age: safeAge,
        profile_code: state.profileCode
      },
      { onConflict: "profile_code" }
    );

    if (error) {
      return null;
    }

    const { data: created } = await supabase
      .from("child_profiles")
      .select("id, child_name, profile_code")
      .eq("profile_code", state.profileCode)
      .limit(1)
      .maybeSingle<ChildProfileRow>();

    return created ?? null;
  }

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
      body: JSON.stringify({ profileCode: code })
    }).catch(() => null);

    if (!response?.ok) {
      return null;
    }

    const payload = (await response.json()) as { ok?: boolean; profile?: ResolvedFriendProfile };
    return payload.profile ?? null;
  }

  async function handleAddFriend() {
    setSavingFriend(true);
    const normalizedCode = friendCode.trim().toUpperCase();
    const nickname = "";

    if (!supabase) {
      const result = addFriendByCode({ friendCode });

      if (!result.ok) {
        setSavingFriend(false);
        setFriendMessage(result.message);
        return;
      }

      setSavingFriend(false);
      setFriendMessage("Kamarád přidán lokálně.");
      setFriendCode("");
      return;
    }

    if (!normalizedCode || normalizedCode.length < 4) {
      setSavingFriend(false);
      setFriendMessage("Zadej platný kód kamaráda.");
      return;
    }

    if (normalizedCode === state.profileCode.trim().toUpperCase()) {
      setSavingFriend(false);
      setFriendMessage("Tohle je tvůj vlastní kód.");
      return;
    }

    const alreadyAdded = state.squadMembers.some((member) => member.id === normalizedCode);

    if (alreadyAdded) {
      setSavingFriend(false);
      setFriendMessage("Tohohle kamaráda už máš přidaného.");
      return;
    }

    const ownProfile = await ensureOwnCloudProfile();

    if (!ownProfile) {
      setSavingFriend(false);
      setFriendMessage("Nejdřív dokonči přihlášení rodiče. Pak půjde přidávání i pozvánky.");
      return;
    }

    const targetProfile = await resolveFriendProfileByCode(normalizedCode);

    if (!targetProfile?.id) {
      setSavingFriend(false);
      setFriendMessage("Kamarád s tímto kódem nebyl nalezen.");
      return;
    }

    const { error: insertError } = await supabase.from("child_friendships").upsert(
      {
        child_profile_id: ownProfile.id,
        friend_child_profile_id: targetProfile.id,
        friend_profile_code: targetProfile.code,
        friend_display_name: nickname || targetProfile.name
      },
      { onConflict: "child_profile_id,friend_child_profile_id" }
    );

    if (insertError) {
      setSavingFriend(false);
      setFriendMessage("Přidání kamaráda do cloudu se nepodařilo.");
      return;
    }

    const localAddResult = addFriendByCode({
      friendCode: normalizedCode,
      nickname: nickname || targetProfile.name
    });

    if (!localAddResult.ok) {
      setSavingFriend(false);
      setFriendMessage(localAddResult.message);
      return;
    }

    setSavingFriend(false);
    setFriendMessage("Hotovo. Teď byste se měli vidět navzájem.");
    setFriendCode("");
  }

  async function handleInviteFriend(friendCode: string, friendName: string) {
    setInviteMessage("");

    if (!supabase) {
      setInviteMessage("Pozvánky fungují jen při připojení k cloudu.");
      return;
    }

    setInvitingFriendCode(friendCode);

    const ownProfile = await ensureOwnCloudProfile();

    if (!ownProfile) {
      setInvitingFriendCode(null);
      setInviteMessage("Nejdřív dokonči přihlášení rodiče. Pak půjde posílat pozvánky.");
      return;
    }

    const targetProfile = await resolveFriendProfileByCode(friendCode);

    if (!targetProfile?.id) {
      setInvitingFriendCode(null);
      setInviteMessage("Kamarád s tímto kódem nebyl nalezen.");
      return;
    }
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";

    const response = await fetch("/api/invites/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({
        sourceProfileCode: ownProfile.profile_code,
        targetProfileCode: targetProfile.code
      })
    }).catch(() => null);

    if (!response?.ok) {
      setInvitingFriendCode(null);
      const payload = (await response?.json().catch(() => ({}))) as { error?: string };
      if (payload.error === "blocked") {
        setInviteMessage(`Pozvánku nelze odeslat, ${friendName} má aktivní blokaci.`);
      } else {
        setInviteMessage("Pozvánku se nepodařilo odeslat.");
      }
      return;
    }

    const createPayload = (await response.json()) as {
      alreadyPending?: boolean;
      invite?: { id?: string; expeditionId?: string };
    };
    const inviteId = createPayload.invite?.id;
    const expeditionId = createPayload.invite?.expeditionId ?? null;

    if (inviteId) {
      await fetch("/api/push/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          sourceProfileCode: ownProfile.profile_code,
          targetProfileCode: targetProfile.code,
          inviteId,
          title: "Nová pozvánka do výpravy",
          message: `${ownProfile.child_name} tě zve do výpravy.`,
          url: "/"
        })
      }).catch(() => undefined);
    }

    setActiveMode("group");
    setCurrentExpeditionId(expeditionId);
    setInvitingFriendCode(null);
    setInviteMessage(
      createPayload.alreadyPending
        ? `Pozvánka pro ${friendName} už čeká na potvrzení.`
        : `Pozvánka pro ${friendName} byla odeslaná.`
    );
  }

  async function handleBlockFriend(friendCode: string, friendName: string) {
    if (!supabase || !state.profileCode) {
      return;
    }

    const confirmed = window.confirm(`Opravdu chceš zablokovat hráče ${friendName}?`);
    if (!confirmed) {
      return;
    }

    setBlockingFriendCode(friendCode);
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    const response = await fetch("/api/invites/block", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({
        sourceProfileCode: state.profileCode,
        targetProfileCode: friendCode,
        block: true
      })
    }).catch(() => null);

    if (!response?.ok) {
      setBlockingFriendCode(null);
      setInviteMessage("Blokaci se nepodařilo uložit.");
      return;
    }

    removeFriendByCode(friendCode);
    setBlockingFriendCode(null);
    setInviteMessage(`${friendName} byl zablokován/a.`);
  }

  async function handleCancelInvite(inviteId: string) {
    if (!supabase || !state.profileCode) {
      return;
    }

    setCancelingInviteId(inviteId);
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    const response = await fetch("/api/invites/cancel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({
        sourceProfileCode: state.profileCode,
        inviteId
      })
    }).catch(() => null);

    if (!response?.ok) {
      setCancelingInviteId(null);
      setInviteMessage("Zrušení pozvánky se nepodařilo.");
      return;
    }

    setSentInvites((current) => current.filter((invite) => invite.id !== inviteId));
    setCancelingInviteId(null);
    setInviteMessage("Čekající pozvánka byla zrušená.");
  }

  function handleSaveTrustedContacts() {
    const values = [trustedContact1, trustedContact2].map((item) => item.trim()).filter(Boolean);
    const hasInvalid = values.some((item) => !item.includes("@"));
    if (hasInvalid) {
      setInviteMessage("Zadej prosím platný e-mail.");
      return;
    }
    setTrustedContacts(values);
    setInviteMessage("Check-in e-maily jsou uložené.");
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <section className="glass-card overflow-hidden p-5">
        <div className="flex items-center gap-4">
          <AvatarPreview config={state.profile.avatarConfig} size={80} />
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.24em] text-mist">Profil hráče</p>
            <input
              value={state.profile.name}
              onChange={(event) => updateProfile({ name: event.target.value })}
              className="mt-1 w-full bg-transparent text-2xl font-bold outline-none"
            />
            <p className="mt-1 text-sm text-mist">
              {state.profile.age} let · {state.profile.title}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xl font-semibold">{unlockedCount}</div>
            <div className="text-xs text-mist">Lokace</div>
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
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">Moje mise</h2>
        {completedMissions.length === 0 ? (
          <p className="mt-3 text-sm text-mist">Zatím nemáš dokončenou žádnou misi.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {completedMissions.map((mission) => {
              const maxPoints = 120;
              const penalty = state.locationPenaltyPoints[mission.id] ?? 0;
              const earnedPoints = Math.max(0, maxPoints - penalty);

              return (
                <div key={mission.id} className="rounded-2xl bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{mission.name}</div>
                      <div className="mt-1 text-sm text-mist">{mission.city}</div>
                    </div>
                    <div className="rounded-full bg-lime/12 px-3 py-1 text-sm font-semibold text-lime">
                      {earnedPoints}/{maxPoints} bodů
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <MobileAppCard />

      <section className="glass-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Avatar studio</h2>
          <button
            onClick={() => setAvatarStudioOpen((current) => !current)}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold"
          >
            {avatarStudioOpen ? "Zavřít" : "Upravit avatara"}
          </button>
        </div>
        {avatarStudioOpen ? (
          <>
            <p className="mt-2 text-sm text-mist">Vyber hlavu, oči, vlasy a barvu. Po výběru se lišta zavře.</p>

            <div className="mt-4 flex justify-center">
              <AvatarPreview config={avatarDraft} size={120} />
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <button
                  onClick={() => setOpenAvatarPanel((current) => (current === "head" ? null : "head"))}
                  className="flex w-full items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-left"
                >
                  <span className="text-sm font-medium">Hlava: {selectedLabel(HEAD_OPTIONS, avatarDraft.head)}</span>
                  <span className="text-xs text-mist">{openAvatarPanel === "head" ? "Skrýt" : "Otevřít"}</span>
                </button>
                {openAvatarPanel === "head" ? (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {HEAD_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setAvatarDraft((current) => ({ ...current, head: option.value }));
                          setOpenAvatarPanel(null);
                        }}
                        className={`rounded-xl px-3 py-2 text-sm ${
                          avatarDraft.head === option.value ? "bg-lime text-night" : "bg-white/5 text-mist"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <button
                  onClick={() => setOpenAvatarPanel((current) => (current === "eyes" ? null : "eyes"))}
                  className="flex w-full items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-left"
                >
                  <span className="text-sm font-medium">Oči: {selectedLabel(EYE_OPTIONS, avatarDraft.eyes)}</span>
                  <span className="text-xs text-mist">{openAvatarPanel === "eyes" ? "Skrýt" : "Otevřít"}</span>
                </button>
                {openAvatarPanel === "eyes" ? (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {EYE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setAvatarDraft((current) => ({ ...current, eyes: option.value }));
                          setOpenAvatarPanel(null);
                        }}
                        className={`rounded-xl px-3 py-2 text-sm ${
                          avatarDraft.eyes === option.value ? "bg-lime text-night" : "bg-white/5 text-mist"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <button
                  onClick={() => setOpenAvatarPanel((current) => (current === "hair" ? null : "hair"))}
                  className="flex w-full items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-left"
                >
                  <span className="text-sm font-medium">Vlasy: {selectedLabel(HAIR_OPTIONS, avatarDraft.hair)}</span>
                  <span className="text-xs text-mist">{openAvatarPanel === "hair" ? "Skrýt" : "Otevřít"}</span>
                </button>
                {openAvatarPanel === "hair" ? (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {HAIR_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setAvatarDraft((current) => ({ ...current, hair: option.value }));
                          setOpenAvatarPanel(null);
                        }}
                        className={`rounded-xl px-3 py-2 text-sm ${
                          avatarDraft.hair === option.value ? "bg-lime text-night" : "bg-white/5 text-mist"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <button
                  onClick={() => setOpenAvatarPanel((current) => (current === "color" ? null : "color"))}
                  className="flex w-full items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-left"
                >
                  <span className="text-sm font-medium">Barva</span>
                  <span className="text-xs text-mist">{openAvatarPanel === "color" ? "Skrýt" : "Otevřít"}</span>
                </button>
                {openAvatarPanel === "color" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {COLOR_OPTIONS.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          setAvatarDraft((current) => ({ ...current, color }));
                          setOpenAvatarPanel(null);
                        }}
                        className={`h-9 w-9 rounded-full border-2 ${
                          avatarDraft.color === color ? "border-lime" : "border-white/20"
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Barva ${color}`}
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                onClick={() => {
                  updateProfile({ avatarConfig: avatarDraft });
                  setAvatarStudioOpen(false);
                }}
                className="w-full rounded-[20px] bg-lime px-4 py-3 text-sm font-semibold text-night"
              >
                Uložit avatar
              </button>
            </div>
          </>
        ) : null}
      </section>

      <section className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-lime">Identita objevitele</p>
            <h2 className="mt-2 text-xl font-semibold">Tvůj profilový kód</h2>
          </div>
          <div className="rounded-full bg-lime/12 px-3 py-2 text-xs text-lime">
            {state.activeMode === "group" ? "Skupinový tah" : "Solo tah"}
          </div>
        </div>
        <div className="mt-4 flex flex-col items-center gap-4 rounded-[24px] bg-white/5 p-4">
          <div className="rounded-xl border border-white/10 bg-night/70 px-3 py-2 text-sm font-semibold tracking-wide text-lime">
            {state.profileCode}
          </div>
          <p className="text-center text-sm leading-6 text-mist">
            Kamarád si tě přidá opsáním tohoto kódu.
          </p>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">Check-in e-maily</h2>
        <p className="mt-2 text-sm text-mist">
          Přidej 1 až 2 e-maily. Při startu mise se otevře check-in zpráva ke sdílení.
        </p>
        <div className="mt-4 space-y-3">
          <input
            value={trustedContact1}
            onChange={(event) => setTrustedContact1(event.target.value)}
            placeholder="E-mail 1 (např. rodic@email.cz)"
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-mist"
          />
          <input
            value={trustedContact2}
            onChange={(event) => setTrustedContact2(event.target.value)}
            placeholder="E-mail 2 (volitelné)"
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-mist"
          />
          <button
            onClick={handleSaveTrustedContacts}
            className="w-full rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold"
          >
            Uložit e-maily
          </button>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">Přidat kamaráda</h2>
        {cloudReady === false ? (
          <div className="mt-3 rounded-2xl border border-coral/40 bg-coral/10 p-3">
            <p className="text-sm text-white">Cloud účet rodiče není přihlášený.</p>
            <button
              onClick={() => {
                openParentAuthGate();
                router.replace("/");
              }}
              className="mt-3 rounded-xl bg-coral px-3 py-2 text-xs font-semibold text-white"
            >
              Přihlásit rodiče
            </button>
          </div>
        ) : null}
        <div className="mt-4 space-y-3">
          <input
            value={friendCode}
            onChange={(event) => setFriendCode(event.target.value.toUpperCase())}
            placeholder="Kód kamaráda (např. BAT-AB12CD)"
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-mist"
          />
          <p className="text-sm text-mist">Zadej kód kamaráda.</p>
          <button
            onClick={handleAddFriend}
            disabled={savingFriend || cloudReady === false}
            className="w-full rounded-[20px] bg-coral px-4 py-3 text-sm font-semibold text-white"
          >
            {savingFriend ? "Přidávám..." : "Přidat kamaráda"}
          </button>
          {friendMessage ? <p className="text-sm text-mist">{friendMessage}</p> : null}
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">Kamarádi</h2>
        {friends.length === 0 ? (
          <p className="mt-4 text-sm text-mist">
            Zatím tu nikoho nemáš. Přidej prvního kamaráda přes kód.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {friends.map((friend) => (
              <div key={friend.id} className="flex items-center justify-between rounded-2xl bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold">
                    {friend.name.slice(0, 2).toUpperCase()}
                  </div>
                    <div>
                      <div className="font-medium">{friend.name}</div>
                      <div className="text-sm text-mist">Kód: {friend.id}</div>
                    </div>
                  </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-lime/12 px-3 py-2 text-xs font-medium text-lime">
                    {friend.joined ? "Ve výpravě" : "Mimo výpravu"}
                  </div>
                  <button
                    onClick={() => handleInviteFriend(friend.id, friend.name)}
                    disabled={invitingFriendCode === friend.id}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold"
                  >
                    {invitingFriendCode === friend.id ? "Posílám…" : "Pozvat"}
                  </button>
                  <button
                    onClick={() => handleBlockFriend(friend.id, friend.name)}
                    disabled={blockingFriendCode === friend.id}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-coral"
                  >
                    {blockingFriendCode === friend.id ? "Blokuju…" : "Blokovat"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {inviteMessage ? <p className="mt-3 text-sm text-mist">{inviteMessage}</p> : null}
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">Odeslané pozvánky</h2>
        {sentInvites.length === 0 ? (
          <p className="mt-4 text-sm text-mist">Teď nemáš žádnou čekající pozvánku.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {sentInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between rounded-2xl bg-white/5 p-4">
                <div>
                  <div className="font-medium">{invite.invitee_display_name}</div>
                  <div className="text-sm text-mist">Čeká na potvrzení</div>
                </div>
                <button
                  onClick={() => handleCancelInvite(invite.id)}
                  disabled={cancelingInviteId === invite.id}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-coral"
                >
                  {cancelingInviteId === invite.id ? "Ruším…" : "Zrušit"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

    </main>
  );
}
