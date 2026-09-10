"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AvatarPreview } from "@/components/avatar-preview";
import { useAppState } from "@/components/app-state-provider";
import { illustrationSrc } from "@/lib/illustrations";
import { getSupabaseBrowserClient } from "@/lib/supabase";

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
};

const EMPTY_BOARD: BoardState = { entries: [], you: null };

function formatGames(count: number) {
  if (count === 1) {
    return "1 dokončená hra";
  }
  if (count >= 2 && count <= 4) {
    return `${count} dokončené hry`;
  }
  return `${count} dokončených her`;
}

function EntryRow({
  rank,
  name,
  avatar,
  score,
  completed,
  isYou,
  highlight
}: {
  rank: number | null;
  name: string;
  avatar: string | null;
  score: number;
  completed: number;
  isYou: boolean;
  highlight?: boolean;
}) {
  return (
    <section
      className={`glass-card flex items-center justify-between gap-3 p-4 ${
        isYou || highlight ? "border-lime/30 bg-lime/8" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-base font-bold">
          {rank ?? "–"}
        </div>
        <AvatarPreview avatar={avatar} size={44} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{name}</div>
          <div className="text-xs text-mist">{formatGames(completed)}</div>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-lg font-semibold text-lime">{score}</div>
        <div className="text-xs uppercase tracking-[0.18em] text-mist">bodů</div>
        {isYou ? <div className="mt-1 text-[11px] text-mist">Ty</div> : null}
      </div>
    </section>
  );
}

export function LeaderboardScreen() {
  const [tab, setTab] = useState<"friends" | "global">("friends");
  const { state } = useAppState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [friendsBoard, setFriendsBoard] = useState<BoardState | null>(null);
  const [globalBoard, setGlobalBoard] = useState<BoardState | null>(null);

  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setFriendsBoard(null);
    setGlobalBoard(null);
  }, [state.playerCode]);

  useEffect(() => {
    async function loadActiveBoard() {
      if (!supabase || !state.playerCode) {
        setLoading(false);
        return;
      }

      const alreadyLoaded = tab === "friends" ? friendsBoard !== null : globalBoard !== null;
      if (alreadyLoaded) {
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

      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ scope: tab, playerCode: state.playerCode, limit: 20 })
      }).catch(() => null);

      if (!response?.ok) {
        setLoading(false);
        setError("Žebříček se teď nepodařilo načíst.");
        return;
      }

      const payload = (await response.json()) as { entries?: LeaderboardEntry[]; you?: LeaderboardYou | null };
      const board: BoardState = { entries: payload.entries ?? [], you: payload.you ?? null };
      if (tab === "friends") {
        setFriendsBoard(board);
      } else {
        setGlobalBoard(board);
      }
      setLoading(false);
    }

    void loadActiveBoard();
  }, [friendsBoard, globalBoard, state.playerCode, supabase, tab]);

  const board = (tab === "friends" ? friendsBoard : globalBoard) ?? EMPTY_BOARD;
  const you = board.you;
  const showOwnRowSeparately = Boolean(you && !you.inTop);

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24">
      <section className="glass-card flex items-start gap-4 p-5">
        <Image
          src={illustrationSrc("pohar")}
          alt=""
          width={92}
          height={92}
          className="h-16 w-16 shrink-0 object-contain sm:h-[92px] sm:w-[92px]"
        />
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-coral">Soutěž</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Žebříček objevitelů</h1>
          <p className="mt-2 text-sm leading-6 text-mist">
            Body se sčítají z tvých nejlepších výsledků v dokončených hrách. Lepší opakování body přidá, horší ti je
            nikdy nesebere.
          </p>
        </div>
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
            onClick={() => setTab("global")}
            className={`rounded-[20px] px-4 py-3 text-sm font-semibold ${
              tab === "global" ? "bg-white text-night" : "bg-white/5 text-mist"
            }`}
          >
            Všichni
          </button>
        </div>
      </section>

      {tab === "friends" ? (
        <section className="glass-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-mist">Chceš soutěžit s někým známým? Přidej si kamaráda podle kódu.</p>
            <Link
              href="/profile#add-friend"
              className="inline-flex items-center justify-center rounded-[20px] bg-lime px-4 py-3 text-sm font-semibold text-night"
            >
              Přidat kamaráda
            </Link>
          </div>
        </section>
      ) : null}

      {loading ? (
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

      {!loading && error ? <p className="text-sm text-mist">{error}</p> : null}

      {!loading && !error ? (
        <div className="space-y-3">
          {board.entries.length === 0 ? (
            <section className="glass-card p-4 text-sm text-mist">
              {tab === "friends"
                ? "Zatím tu nikdo nemá body. Dokonči hru a buď první."
                : "Zatím tu není dost dat pro žebříček všech hráčů."}
            </section>
          ) : null}

          {board.entries.map((entry) => (
            <EntryRow
              key={`${entry.rank}-${entry.name}`}
              rank={entry.rank}
              name={entry.name}
              avatar={entry.avatar}
              score={entry.score}
              completed={entry.completed}
              isYou={entry.isYou}
            />
          ))}

          {/* R33/6 + R33/11: vlastní řádek se ukáže vždy – i mimo TOP 20 a i s nulou. */}
          {showOwnRowSeparately && you ? (
            <section className="space-y-2 pt-1">
              <p className="text-xs uppercase tracking-[0.18em] text-mist">Ty</p>
              <EntryRow
                rank={you.rank}
                name={you.name}
                avatar={you.avatar}
                score={you.score}
                completed={you.completed}
                isYou
                highlight
              />
              {you.rank === null ? (
                <p className="text-sm text-mist">
                  {you.score === 0
                    ? "Dokonči první hru a dostaň se do žebříčku."
                    : "Tenhle profil se do pořadí nezapočítává."}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
