"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/components/app-state-provider";
import { leaderboard, squads, locations } from "@/lib/mock-data";

export function LeaderboardScreen() {
  const [tab, setTab] = useState<"players" | "groups">("players");
  const { state, isLocationUnlocked } = useAppState();
  const unlockedCount = locations.filter((location) => isLocationUnlocked(location.id, location.unlocked)).length;
  const groupScore = useMemo(
    () =>
      Object.values(state.groupCompletionMembers).reduce((sum, members) => sum + members.length * 120, 0),
    [state.groupCompletionMembers]
  );

  const playerBoard = useMemo(
    () =>
      [
        ...leaderboard,
        {
          name: state.profile.name,
          city: state.city,
          score: unlockedCount,
          squad: state.squadName,
          delta: "Právě teď"
        }
      ].sort((a, b) => b.score - a.score),
    [state.city, state.profile.name, state.squadName, unlockedCount]
  );

  const groupBoard = useMemo(
    () =>
      [
        ...squads,
        {
          name: state.squadName,
          members: state.squadMembers.length,
          score: groupScore,
          city: state.city
        }
      ].sort((a, b) => b.score - a.score),
    [groupScore, state.city, state.squadMembers.length, state.squadName]
  );

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <section className="glass-card p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-coral">Soutěž</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Žebříček objevitelů</h1>
        <p className="mt-2 text-sm leading-6 text-mist">
          Tady už se body počítají doopravdy podle toho, co sis v aplikaci odemkla.
        </p>
      </section>

      <section className="glass-card p-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setTab("players")}
            className={`rounded-[20px] px-4 py-3 text-sm font-semibold ${
              tab === "players" ? "bg-white text-night" : "bg-white/5 text-mist"
            }`}
          >
            Hráči
          </button>
          <button
            onClick={() => setTab("groups")}
            className={`rounded-[20px] px-4 py-3 text-sm font-semibold ${
              tab === "groups" ? "bg-white text-night" : "bg-white/5 text-mist"
            }`}
          >
            Skupiny
          </button>
        </div>
      </section>

      {tab === "players" ? (
        <div className="space-y-3">
          {playerBoard.map((entry, index) => (
            <section
              key={`${entry.name}-${entry.city}`}
              className={`glass-card flex items-center justify-between p-4 ${
                entry.name === state.profile.name ? "border-lime/30 bg-lime/8" : index === 0 ? "border-sky/20" : ""
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-lg font-bold">
                  {index + 1}
                </div>
                <div>
                  <div className="font-semibold">{entry.name}</div>
                  <div className="text-sm text-mist">
                    {entry.city} · {entry.squad}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold text-lime">{entry.score}</div>
                <div className="text-xs uppercase tracking-[0.18em] text-mist">lokací</div>
                <div className="mt-1 text-[11px] text-mist">{entry.delta}</div>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {groupBoard.map((squad, index) => (
            <div
              key={`${squad.name}-${squad.city}`}
              className={`glass-card flex items-center justify-between rounded-2xl p-4 ${
                squad.name === state.squadName ? "border-lime/30 bg-lime/8" : index === 0 ? "border-sky/20" : ""
              }`}
            >
              <div>
                <div className="font-semibold">{squad.name}</div>
                <div className="text-sm text-mist">
                  {squad.city} · {squad.members} členů
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-lime">{squad.score}</div>
                <div className="text-xs text-mist">celkem bodů</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
