"use client";

import { FormEvent, useState } from "react";
import { useAppState } from "@/components/app-state-provider";
import { normalizePin } from "@/lib/pin";

export function ChildPinGate() {
  const { unlockWithPin } = useAppState();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const result = await unlockWithPin(pin);
    setLoading(false);

    if (!result.ok) {
      if (result.code === "too_many_attempts") {
        setError("Příliš mnoho pokusů. PIN je dočasně zablokovaný na 15 minut.");
        return;
      }
      setError(result.message || "PIN nesedí. Zkus to znovu.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-6">
      <section className="glass-card w-full max-w-md p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-coral">Rychlý vstup</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Přihlášení hráče</h1>
        <p className="mt-3 text-sm leading-6 text-mist">Zadej svůj PIN a pokračuj do hry.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-mist">PIN hráče</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={pin}
              onChange={(event) => setPin(normalizePin(event.target.value))}
              placeholder="4 až 6 číslic"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
              style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
            />
          </label>

          {error ? <p className="text-sm text-coral">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-coral px-4 py-3 text-base font-semibold text-white disabled:opacity-70"
          >
            {loading ? "Ověřuji PIN..." : "Odemknout hru"}
          </button>
        </form>
      </section>
    </main>
  );
}
