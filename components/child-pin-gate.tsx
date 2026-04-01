"use client";

import { FormEvent, useState } from "react";
import { useAppState } from "@/components/app-state-provider";
import { normalizePin } from "@/lib/pin";

export function ChildPinGate() {
  const { unlockWithPin } = useAppState();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const ok = unlockWithPin(pin);

    if (!ok) {
      setError("PIN nesedí. Zkus to znovu.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-6">
      <section className="glass-card w-full max-w-md p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-coral">Rychlý vstup</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Přihlášení dítěte</h1>
        <p className="mt-3 text-sm leading-6 text-mist">Zadej svůj PIN a pokračuj do hry.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-mist">PIN dítěte</span>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(normalizePin(event.target.value))}
              placeholder="4 až 6 číslic"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
            />
          </label>

          {error ? <p className="text-sm text-coral">{error}</p> : null}

          <button type="submit" className="w-full rounded-2xl bg-coral px-4 py-3 text-base font-semibold text-white">
            Odemknout hru
          </button>
        </form>
      </section>
    </main>
  );
}
