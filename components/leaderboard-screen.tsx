"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/components/app-state-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type LeaderboardEntry = {
  name: string;
  score: number;
  completed: number;
  isYou: boolean;
};

export function LeaderboardScreen() {
  const [tab, setTab] = useState<"friends" | "city">("friends");
  const { state, getPlayerScore } = useAppState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [friendsBoard, setFriendsBoard] = useState<LeaderboardEntry[]>([]);
  const [cityBoard, setCityBoard] = useState<LeaderboardEntry[]>([]);
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);
  const playerScore = getPlayerScore();

  useEffect(() => {
    async function loadBoards() {
      if (!supabase || !state.profileCode) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";

      if (!accessToken) {
        setLoading(false);
        setError("Pro načtení žebříčku je potřeba být přihlášený.");
        return;
      }

      const [friendsResponse, cityResponse] = await Promise.all([
        fetch("/api/leaderboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            scope: "friends",
            profileCode: state.profileCode,
            city: state.city,
            limit: 20
          })
        }).catch(() => null),
        fetch("/api/leaderboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            scope: "city",
            profileCode: state.profileCode,
            city: state.city,
            limit: 20
          })
        }).catch(() => null)
      ]);

      if (!friendsResponse?.ok || !cityResponse?.ok) {
        setLoading(false);
        setError("Žebříček se teď nepodařilo načíst.");
        return;
      }

      const friendsPayload = (await friendsResponse.json()) as { entries?: LeaderboardEntry[] };
      const cityPayload = (await cityResponse.json()) as { entries?: LeaderboardEntry[] };

      setFriendsBoard(friendsPayload.entries ?? []);
      setCityBoard(cityPayload.entries ?? []);
      setLoading(false);
    }

    void loadBoards();
  }, [state.city, state.profileCode, supabase]);

  const fallbackFriendsBoard = useMemo(
    () =>
      [
        {
          name: state.profile.name,
          score: playerScore,
          completed: Math.round(playerScore / 120),
          isYou: true
        },
        ...state.squadMembers
          .filter((member) => member.id !== "self")
          .map((member) => ({
            name: member.name,
            score: 0,
            completed: 0,
            isYou: false
          }))
      ].sort((a, b) => b.score - a.score),
    [playerScore, state.profile.name, state.squadMembers]
  );

  const visibleFriendsBoard = friendsBoard.length > 0 ? friendsBoard : fallbackFriendsBoard;
  const visibleCityBoard = cityBoard;

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <section className="glass-card p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-coral">Soutěž</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Žebříček objevitelů</h1>
        <p className="mt-2 text-sm leading-6 text-mist">
          Můžeš si přepnout soutěž mezi kamarády nebo širší žebříček hráčů v aktuálním městě.
        </p>
      </section>

      <section className="glass-card p-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setTab("friends")}
            className={`rounded-[20px] px-4 py-3 text-sm font-semibold ${
              tab === "friends" ? "bg-white text-night" : "bg-white/5 text-mist"
            }`}
          >
            Kamarádi
          </button>
          <button
            onClick={() => setTab("city")}
            className={`rounded-[20px] px-4 py-3 text-sm font-semibold ${
              tab === "city" ? "bg-white text-night" : "bg-white/5 text-mist"
            }`}
          >
            {state.city}
          </button>
        </div>
      </section>

      {loading ? <p className="text-sm text-mist">Načítám žebříček…</p> : null}
      {!loading && error ? <p className="text-sm text-mist">{error}</p> : null}

      {!loading ? (
        tab === "friends" ? (
          <div className="space-y-3">
            {visibleFriendsBoard.map((entry, index) => (
              <section
                key={`${entry.name}-${index}`}
                className={`glass-card flex items-center justify-between p-4 ${
                  entry.isYou ? "border-lime/30 bg-lime/8" : index === 0 ? "border-sky/20" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-lg font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-semibold">{entry.name}</div>
                    <div className="text-sm text-mist">{entry.completed} dokončených misí</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-semibold text-lime">{entry.score}</div>
                  <div className="text-xs uppercase tracking-[0.18em] text-mist">bodů</div>
                  {entry.isYou ? <div className="mt-1 text-[11px] text-mist">Ty</div> : null}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleCityBoard.length === 0 ? (
              <section className="glass-card p-4 text-sm text-mist">
                Zatím tu není dost dat pro městský žebříček.
              </section>
            ) : null}
            {visibleCityBoard.map((entry, index) => (
              <section
                key={`${entry.name}-${index}`}
                className={`glass-card flex items-center justify-between rounded-2xl p-4 ${
                  entry.isYou ? "border-lime/30 bg-lime/8" : index === 0 ? "border-sky/20" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-lg font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-semibold">{entry.name}</div>
                    <div className="text-sm text-mist">
                      {entry.completed} dokončených misí v {state.city}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-lime">{entry.score}</div>
                  <div className="text-xs text-mist">bodů</div>
                </div>
              </section>
            ))}
          </div>
        )
      ) : null}
    </main>
  );
}
