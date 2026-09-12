"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AvatarPreview } from "@/components/avatar-preview";
import { useAppState } from "@/components/app-state-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  type BoardLoadStatus,
  resolveBoardView,
  resolveFriendsBoardView
} from "@/lib/leaderboard-model";

// R33: žebříček ukazuje výhradně to, co spočítal server.
//
// Dřív měla obrazovka náhradní řádek složený z localStorage, takže hráč mohl
// vidět jiné číslo, než jaké má uložené. Skóre, pořadí i vlastní pozice teď
// přicházejí z /api/leaderboard a nikde se nedopočítávají.

type LeaderboardEntry = {
  rank: number;
  name: string;
  avatar: string | null;
  score: number;
  completed: number;
  isYou: boolean;
};

type LeaderboardYou = {
  name: string;
  avatar: string | null;
  score: number;
  completed: number;
  rank: number | null;
  inTop: boolean;
  excluded: boolean;
};

type BoardState = {
  entries: LeaderboardEntry[];
  you: LeaderboardYou | null;
  friendCount: number;
};

/**
 * R44 krok 6: každá záložka má vlastní stav načítání i vlastní data.
 * Dřív byly `loading` a `error` sdílené, takže chyba v jednom pohledu schovala
 * už načtený seznam v tom druhém – a u načtené záložky se chyba nikdy
 * nevyčistila, protože ta se znovu nenačítá.
 */
type TabState = { status: BoardLoadStatus; board: BoardState | null };

const INITIAL_TAB: TabState = { status: "idle", board: null };

function EntryRow({
  rank,
  name,
  avatar,
  score,
  isYou,
  highlight
}: {
  rank: number | null;
  name: string;
  avatar: string | null;
  score: number;
  isYou: boolean;
  highlight?: boolean;
}) {
  return (
    <li
      className={`glass-card flex items-center justify-between gap-3 p-4 ${
        isYou || highlight ? "border-lime/30 bg-lime/8" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-base font-bold">
          {rank ?? "–"}
        </div>
        <AvatarPreview avatar={avatar} size={44} />
        {/* R33: přezdívka se nezkracuje – radši se zalomí na víc řádků. */}
        <div className="min-w-0 break-words font-semibold">{name}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-lg font-semibold text-lime">{score}</div>
        <div className="text-xs uppercase tracking-[0.18em] text-mist">bodů</div>
        {isYou ? <div className="mt-1 text-[11px] text-mist">Ty</div> : null}
      </div>
    </li>
  );
}

export function LeaderboardScreen() {
  const [tab, setTab] = useState<"friends" | "global">("friends");
  const { state } = useAppState();
  const [friendsTab, setFriendsTab] = useState<TabState>(INITIAL_TAB);
  const [globalTab, setGlobalTab] = useState<TabState>(INITIAL_TAB);

  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setFriendsTab(INITIAL_TAB);
    setGlobalTab(INITIAL_TAB);
  }, [state.playerCode]);

  const active = tab === "friends" ? friendsTab : globalTab;

  useEffect(() => {
    const setTabState = tab === "friends" ? setFriendsTab : setGlobalTab;

    async function loadActiveBoard() {
      if (!supabase || !state.playerCode) {
        setTabState((current) => (current.board ? current : { status: "error", board: null }));
        return;
      }

      // Jednou načtená záložka se nenačítá znovu; její data ani stav se
      // nedotýkají té druhé.
      if (active.board !== null || active.status === "loading") {
        return;
      }

      setTabState((current) => ({ ...current, status: "loading" }));

      const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      if (!accessToken) {
        setTabState((current) => ({ ...current, status: "error" }));
        return;
      }

      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ scope: tab, playerCode: state.playerCode, limit: 20 })
      }).catch(() => null);

      if (!response?.ok) {
        setTabState((current) => ({ ...current, status: "error" }));
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        entries?: LeaderboardEntry[];
        you?: LeaderboardYou | null;
        friendCount?: number;
      } | null;

      if (!payload) {
        setTabState((current) => ({ ...current, status: "error" }));
        return;
      }

      setTabState({
        status: "ready",
        board: {
          entries: payload.entries ?? [],
          you: payload.you ?? null,
          friendCount: Math.max(0, Number(payload.friendCount) || 0)
        }
      });
    }

    void loadActiveBoard();
  }, [active.board, active.status, state.playerCode, supabase, tab]);

  const view = resolveBoardView(active.status, active.board !== null);
  const board = active.board;
  const you = board?.you ?? null;
  const friendsView =
    tab === "friends" && board
      ? resolveFriendsBoardView({ friendCount: board.friendCount, entries: board.entries })
      : "board";
  // Hráč bez kamarádů nevidí žebříček o jednom člověku, takže ani vlastní řádek.
  const showOwnRowSeparately = Boolean(you && !you.inTop && friendsView !== "no-friends");
  const panelId = `leaderboard-panel-${tab}`;

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <section className="glass-card p-5">
        <h1 className="text-3xl font-bold tracking-tight">Žebříček</h1>
        <p className="mt-2 text-sm leading-6 text-mist">
          Počítají se tvoje nejlepší výsledky z dokončených her.
        </p>
      </section>

      <section className="glass-card p-2">
        <div role="tablist" aria-label="Žebříček" className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "friends" as const, label: "Kamarádi" },
              { value: "global" as const, label: "Všichni" }
            ]
          ).map((item) => (
            <button
              key={item.value}
              role="tab"
              id={`leaderboard-tab-${item.value}`}
              aria-selected={tab === item.value}
              aria-controls={`leaderboard-panel-${item.value}`}
              tabIndex={tab === item.value ? 0 : -1}
              onClick={() => setTab(item.value)}
              className={`rounded-[20px] px-4 py-3 text-sm font-semibold ${
                tab === item.value ? "bg-white text-night" : "bg-white/5 text-mist"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div role="tabpanel" id={panelId} aria-labelledby={`leaderboard-tab-${tab}`} className="flex flex-col gap-3">
        {view === "loading" ? (
          <div className="space-y-3">
            <section className="glass-card animate-pulse p-4">
              <div className="h-4 w-28 rounded bg-white/10" />
              <div className="mt-3 h-3 w-40 rounded bg-white/10" />
            </section>
            <section className="glass-card animate-pulse p-4">
              <div className="h-4 w-24 rounded bg-white/10" />
              <div className="mt-3 h-3 w-36 rounded bg-white/10" />
            </section>
          </div>
        ) : null}

        {view === "error" ? <p className="text-sm text-mist">Žebříček se teď nepodařilo načíst.</p> : null}

        {view === "ready" && board ? (
          <>
            {friendsView === "no-friends" ? (
              <section className="glass-card p-5">
                <p className="text-sm text-mist">Zatím tady nemáš žádné kamarády.</p>
                <Link
                  href="/profile#pridat-kamarada"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-[20px] bg-lime px-4 py-3 text-sm font-semibold text-night"
                >
                  Přidat kamaráda
                </Link>
              </section>
            ) : null}

            {friendsView === "friends-without-score" ? (
              <section className="glass-card p-5">
                <p className="text-sm text-mist">Tvoji kamarádi zatím nemají žádné body.</p>
                <p className="mt-1 text-sm text-mist">Tak vyrazíte spolu?</p>
              </section>
            ) : null}

            {friendsView !== "no-friends" && board.entries.length === 0 && tab === "global" ? (
              <section className="glass-card p-4 text-sm text-mist">
                Zatím tu není dost dat pro žebříček všech hráčů.
              </section>
            ) : null}

            {friendsView !== "no-friends" && board.entries.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {board.entries.map((entry) => (
                  <EntryRow
                    key={`${entry.rank}-${entry.name}`}
                    rank={entry.rank}
                    name={entry.name}
                    avatar={entry.avatar}
                    score={entry.score}
                    isYou={entry.isYou}
                  />
                ))}
              </ul>
            ) : null}

            {/* R33/6 + R33/11: vlastní řádek se ukáže vždy – i mimo TOP 20 a i s nulou. */}
            {showOwnRowSeparately && you ? (
              <section className="space-y-2 pt-1">
                <p className="text-xs uppercase tracking-[0.18em] text-mist">Ty</p>
                <ul>
                  <EntryRow rank={you.rank} name={you.name} avatar={you.avatar} score={you.score} isYou highlight />
                </ul>
                {you.rank === null ? (
                  <p className="text-sm text-mist">
                    {you.score === 0
                      ? "Dokonči první hru a dostaň se do žebříčku."
                      : "Tenhle profil se do pořadí nezapočítává."}
                  </p>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
