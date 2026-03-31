"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/components/app-state-provider";
import { locations } from "@/lib/mock-data";

export function ProfileScreen() {
  const { state, updateProfile, resetProgress, isLocationUnlocked, addFriendByCode } = useAppState();
  const [friendCode, setFriendCode] = useState("");
  const [friendNickname, setFriendNickname] = useState("");
  const [friendMessage, setFriendMessage] = useState("");
  const unlockedCount = useMemo(
    () => locations.filter((location) => isLocationUnlocked(location.id, location.unlocked)).length,
    [isLocationUnlocked]
  );
  const friends = state.squadMembers.filter((member) => member.id !== "self");
  const score = unlockedCount * 120;

  function handleAddFriend() {
    const result = addFriendByCode({ friendCode, nickname: friendNickname });
    setFriendMessage(result.message);

    if (result.ok) {
      setFriendCode("");
      setFriendNickname("");
    }
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
            className="w-full rounded-[20px] bg-coral px-4 py-3 text-sm font-semibold text-white"
          >
            Přidat do party
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
            Zatím tu nikoho nemáš. Přidej prvního kamaráda přes QR nebo kód.
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
