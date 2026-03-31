"use client";

import { useEffect, useMemo, useState } from "react";
import { type AvatarConfig, useAppState } from "@/components/app-state-provider";
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
  const {
    state,
    updateProfile,
    resetProgress,
    isLocationUnlocked,
    addFriendByCode,
    setFriendsFromCloud,
    setActiveMode,
    setCurrentExpeditionId
  } = useAppState();
  const [friendCode, setFriendCode] = useState("");
  const [friendNickname, setFriendNickname] = useState("");
  const [friendMessage, setFriendMessage] = useState("");
  const [savingFriend, setSavingFriend] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [invitingFriendCode, setInvitingFriendCode] = useState<string | null>(null);
  const [avatarDraft, setAvatarDraft] = useState<AvatarConfig>(state.profile.avatarConfig);
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
  const friends = state.squadMembers.filter((member) => member.id !== "self");
  const score = unlockedCount * 120;

  useEffect(() => {
    setAvatarDraft(state.profile.avatarConfig);
  }, [state.profile.avatarConfig]);

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

      const { data: friendships } = await supabase
        .from("child_friendships")
        .select("friend_profile_code, friend_display_name")
        .eq("child_profile_id", ownProfile.id);

      if (!friendships) {
        return;
      }

      setFriendsFromCloud(
        (friendships as ChildFriendshipRow[]).map((row) => ({
          code: row.friend_profile_code,
          name: row.friend_display_name
        }))
      );
    }

    syncCloudFriends();
  }, [setFriendsFromCloud, state.profileCode, supabase]);

  async function handleAddFriend() {
    setSavingFriend(true);
    const normalizedCode = friendCode.trim().toUpperCase();
    const nickname = friendNickname.trim();

    if (!supabase) {
      const result = addFriendByCode({ friendCode, nickname: friendNickname });

      if (!result.ok) {
        setSavingFriend(false);
        setFriendMessage(result.message);
        return;
      }

      setSavingFriend(false);
      setFriendMessage("Kamarád přidán lokálně.");
      setFriendCode("");
      setFriendNickname("");
      return;
    }

    if (!normalizedCode || normalizedCode.length < 4) {
      setSavingFriend(false);
      setFriendMessage("Zadej platný kód kamaráda.");
      return;
    }

    if (!nickname) {
      setSavingFriend(false);
      setFriendMessage("Doplň přezdívku kamaráda.");
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

    const { data: ownProfile } = await supabase
      .from("child_profiles")
      .select("id, child_name, profile_code")
      .eq("profile_code", state.profileCode)
      .limit(1)
      .maybeSingle<ChildProfileRow>();

    if (!ownProfile) {
      setSavingFriend(false);
      setFriendMessage("Nejdřív je potřeba uložit profil dítěte v cloudu.");
      return;
    }

    const { data: targetProfile } = await supabase
      .from("child_profiles")
      .select("id, child_name, profile_code")
      .eq("profile_code", normalizedCode)
      .limit(1)
      .maybeSingle<ChildProfileRow>();

    if (!targetProfile) {
      setSavingFriend(false);
      setFriendMessage("Kamarád s tímto kódem nebyl nalezen.");
      return;
    }

    const { error: insertError } = await supabase.from("child_friendships").upsert(
      [
        {
          child_profile_id: ownProfile.id,
          friend_child_profile_id: targetProfile.id,
          friend_profile_code: targetProfile.profile_code,
          friend_display_name: nickname
        },
        {
          child_profile_id: targetProfile.id,
          friend_child_profile_id: ownProfile.id,
          friend_profile_code: ownProfile.profile_code,
          friend_display_name: ownProfile.child_name
        }
      ],
      { onConflict: "child_profile_id,friend_child_profile_id" }
    );

    if (insertError) {
      setSavingFriend(false);
      setFriendMessage("Přidání kamaráda do cloudu se nepodařilo.");
      return;
    }

    const localAddResult = addFriendByCode({ friendCode: normalizedCode, nickname });

    if (!localAddResult.ok) {
      setSavingFriend(false);
      setFriendMessage(localAddResult.message);
      return;
    }

    setSavingFriend(false);
    setFriendMessage("Hotovo. Teď byste se měli vidět navzájem.");
    setFriendCode("");
    setFriendNickname("");
  }

  async function handleInviteFriend(friendCode: string, friendName: string) {
    setInviteMessage("");

    if (!supabase) {
      setInviteMessage("Pozvánky fungují jen při připojení k cloudu.");
      return;
    }

    setInvitingFriendCode(friendCode);

    const { data: ownProfile } = await supabase
      .from("child_profiles")
      .select("id, child_name, profile_code")
      .eq("profile_code", state.profileCode)
      .limit(1)
      .maybeSingle<ChildProfileRow>();

    if (!ownProfile) {
      setInvitingFriendCode(null);
      setInviteMessage("Nejdřív je potřeba mít uložený profil dítěte v cloudu.");
      return;
    }

    const { data: targetProfile } = await supabase
      .from("child_profiles")
      .select("id, child_name, profile_code")
      .eq("profile_code", friendCode)
      .limit(1)
      .maybeSingle<ChildProfileRow>();

    if (!targetProfile) {
      setInvitingFriendCode(null);
      setInviteMessage("Kamarád s tímto kódem nebyl nalezen.");
      return;
    }

    const { data: existingPending } = await supabase
      .from("child_expedition_invites")
      .select("id")
      .eq("inviter_child_profile_id", ownProfile.id)
      .eq("invitee_child_profile_id", targetProfile.id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (existingPending?.id) {
      setInvitingFriendCode(null);
      setInviteMessage(`Pozvánka pro ${friendName} už čeká na potvrzení.`);
      return;
    }

    const { data: inviteRow, error: inviteError } = await supabase
      .from("child_expedition_invites")
      .insert({
        inviter_child_profile_id: ownProfile.id,
        inviter_profile_code: ownProfile.profile_code,
        inviter_display_name: ownProfile.child_name,
        invitee_child_profile_id: targetProfile.id,
        invitee_profile_code: targetProfile.profile_code,
        invitee_display_name: targetProfile.child_name,
        status: "pending"
      })
      .select("expedition_id")
      .single<{ expedition_id: string }>();

    if (inviteError) {
      setInvitingFriendCode(null);
      setInviteMessage("Pozvánku se nepodařilo odeslat.");
      return;
    }

    setActiveMode("group");
    setCurrentExpeditionId(inviteRow?.expedition_id ?? null);
    setInvitingFriendCode(null);
    setInviteMessage(`Pozvánka pro ${friendName} byla odeslaná.`);
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
            <div className="text-xl font-semibold">{state.squadMembers.filter((m) => m.joined).length}</div>
            <div className="text-xs text-mist">Parta</div>
          </div>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">Avatar studio</h2>
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
            onClick={() => updateProfile({ avatarConfig: avatarDraft })}
            className="w-full rounded-[20px] bg-lime px-4 py-3 text-sm font-semibold text-night"
          >
            Uložit avatar
          </button>
        </div>
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
        <h2 className="section-title">Přidat kamaráda</h2>
        <div className="mt-4 space-y-3">
          <input
            value={friendCode}
            onChange={(event) => setFriendCode(event.target.value.toUpperCase())}
            placeholder="Kód kamaráda (např. BAT-AB12CD)"
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-mist"
          />
          <input
            value={friendNickname}
            onChange={(event) => setFriendNickname(event.target.value)}
            placeholder="Jak se ti bude v appce zobrazovat"
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-mist"
          />
          <button
            onClick={handleAddFriend}
            disabled={savingFriend}
            className="w-full rounded-[20px] bg-coral px-4 py-3 text-sm font-semibold text-white"
          >
            {savingFriend ? "Přidávám..." : "Přidat do party"}
          </button>
          {friendMessage ? <p className="text-sm text-mist">{friendMessage}</p> : null}
        </div>
        <button
          onClick={resetProgress}
          className="mt-4 w-full rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold"
        >
          Resetovat postup
        </button>
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
                </div>
              </div>
            ))}
          </div>
        )}
        {inviteMessage ? <p className="mt-3 text-sm text-mist">{inviteMessage}</p> : null}
      </section>
    </main>
  );
}
