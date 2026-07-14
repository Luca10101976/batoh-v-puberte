"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function checkSession() {
      if (!supabase) {
        setChecking(false);
        return;
      }
      const {
        data: { session }
      } = await supabase.auth.getSession();
      setHasSession(Boolean(session?.user));
      setChecking(false);
    }
    void checkSession();
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!supabase) {
      setError("Chybí konfigurace přihlášení. Otevři aplikaci znovu.");
      return;
    }
    if (password.length < 6) {
      setError("Heslo musí mít aspoň 6 znaků.");
      return;
    }
    if (password !== passwordAgain) {
      setError("Hesla se neshodují.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError("Nastavení hesla se nepodařilo. Zkus odkaz z e-mailu otevřít znovu.");
      return;
    }

    setDone(true);
    setTimeout(() => router.replace("/?auth=confirmed"), 1500);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-6">
      <section className="glass-card w-full max-w-md p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-lime">Traki na stopě tajemství</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Nastav si nové heslo</h1>

        {checking ? (
          <p className="mt-3 text-sm text-mist">Ověřuju odkaz…</p>
        ) : done ? (
          <p className="mt-3 text-sm text-lime">Heslo je uložené. Přesměrovávám do hry…</p>
        ) : !hasSession ? (
          <p className="mt-3 text-sm text-mist">
            Odkaz na obnovu hesla není platný nebo vypršel. Vrať se do přihlášení a požádej o nový.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm text-mist">Nové heslo</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="aspoň 6 znaků"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition focus:border-lime/60 focus:bg-white/10"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-mist">Heslo znovu</span>
              <input
                type="password"
                value={passwordAgain}
                onChange={(event) => setPasswordAgain(event.target.value)}
                placeholder="zopakuj heslo"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition focus:border-lime/60 focus:bg-white/10"
              />
            </label>

            {error ? <p className="text-sm text-coral">{error}</p> : null}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-coral px-4 py-3 text-base font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
            >
              {saving ? "Ukládám…" : "Uložit nové heslo"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
