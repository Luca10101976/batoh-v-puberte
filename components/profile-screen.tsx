"use client";

import { useMemo } from "react";
import { useAppState } from "@/components/app-state-provider";
import { friends, locations } from "@/lib/mock-data";

export function ProfileScreen() {
  const { state, updateProfile, resetProgress, isLocationUnlocked } = useAppState();
  const unlockedCount = useMemo(
    () => locations.filter((location) => isLocationUnlocked(location.id, location.unlocked)).length,
    [isLocationUnlocked]
  );
  const score = unlockedCount * 120;

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
            <h2 className="mt-2 text-xl font-semibold">Tvoje karta hráče</h2>
          </div>
          <div className="rounded-full bg-lime/12 px-3 py-2 text-xs text-lime">
            {state.activeMode === "group" ? "Skupinový tah" : "Solo tah"}
          </div>
        </div>
        <div className="mt-4 rounded-[24px] bg-white/5 p-4">
          <p className="text-sm leading-6 text-mist">
            Nejvíc ti sedí městské záhady a lokace, kde je potřeba koukat kolem sebe. Profil se ukládá přímo v
            appce, takže si můžeš zkoušet mise opakovaně.
          </p>
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
        <div className="mt-4 space-y-3">
          {friends.map((friend) => (
            <div key={friend.name} className="flex items-center justify-between rounded-2xl bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold">
                  {friend.initials}
                </div>
                <div>
                  <div className="font-medium">{friend.name}</div>
                  <div className="text-sm text-mist">{friend.unlocked} odemčených lokací</div>
                </div>
              </div>
              <div className="text-right">
                <div className="rounded-full bg-lime/12 px-3 py-2 text-xs font-medium text-lime">{friend.streak}</div>
                <div className="mt-2 text-[11px] text-mist">{friend.status}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
