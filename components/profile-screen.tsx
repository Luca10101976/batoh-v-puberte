"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/components/app-state-provider";
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

export function ProfileScreen() {
  const { state, updateProfile, resetProgress, isLocationUnlocked, addFriendByCode, setFriendsFromCloud } = useAppState();
  const [friendCode, setFriendCode] = useState("");
  const [friendNickname, setFriendNickname] = useState("");
  const [friendMessage, setFriendMessage] = useState("");
  const [savingFriend, setSavingFriend] = useState(false);
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
    const result = addFriendByCode({ friendCode, nickname: friendNickname });

    if (!result.ok) {
      setSavingFriend(false);
      setFriendMessage(result.message);
      return;
    }

    if (!supabase) {
      setSavingFriend(false);
      setFriendMessage("Kamarád přidán lokálně.");
      setFriendCode("");
      setFriendNickname("");
      return;
    }

    const normalizedCode = friendCode.trim().toUpperCase();
    const nickname = friendNickname.trim();

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

    setSavingFriend(false);
    setFriendMessage("Hotovo. Teď byste se měli vidět navzájem.");
    setFriendCode("");
    setFriendNickname("");
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <section className="glass-card overflow-hidden p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-lime to-sky text-2xl font-bold text-night">
            {state.profile.avatar}
          </div>
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
                <div className="rounded-full bg-lime/12 px-3 py-2 text-xs font-medium text-lime">
                  {friend.joined ? "Ve výpravě" : "Mimo výpravu"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
