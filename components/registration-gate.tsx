"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/app-state-provider";

export function RegistrationGate() {
  const { completeRegistration } = useAppState();
  const router = useRouter();
  const [name, setName] = useState("");
  const [age, setAge] = useState("11");
  const [parentEmail, setParentEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const numericAge = Number(age);
    const trimmedEmail = parentEmail.trim();

    if (trimmedName.length < 2) {
      setError("Napiš prosím své jméno.");
      return;
    }

    if (!Number.isInteger(numericAge) || numericAge < 8 || numericAge > 16) {
      setError("Věk musí být číslo mezi 8 a 16.");
      return;
    }

    if (!trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
      setError("Zadej prosím platný e-mail na rodiče.");
      return;
    }

    setError("");
    setSubmitting(true);
    completeRegistration({ name: trimmedName, age: numericAge, parentEmail: trimmedEmail });
    router.replace("/profile");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-6">
      <section className="glass-card w-full max-w-md p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-coral">První spuštění</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Nejdřív krátká registrace</h1>
        <p className="mt-3 text-sm leading-6 text-mist">
          Vyplň základní údaje a můžeme jít hrát. E-mail rodiče slouží pro bezpečnostní upozornění.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-mist">Jméno hráče</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Pan Batůžek"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition focus:border-lime/60 focus:bg-white/10"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-mist">Věk</span>
            <input
              type="number"
              value={age}
              onChange={(event) => setAge(event.target.value)}
              min={8}
              max={16}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition focus:border-lime/60 focus:bg-white/10"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-mist">E-mail rodiče</span>
            <input
              type="email"
              value={parentEmail}
              onChange={(event) => setParentEmail(event.target.value)}
              placeholder="rodic@email.cz"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition focus:border-lime/60 focus:bg-white/10"
            />
          </label>

          {error ? <p className="text-sm text-coral">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-coral px-4 py-3 text-base font-semibold text-white transition hover:brightness-105"
          >
            {submitting ? "Dokončuji registraci..." : "Dokončit registraci"}
          </button>
        </form>
      </section>
    </main>
  );
}
