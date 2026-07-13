"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAppState } from "@/components/app-state-provider";
import { RegistrationGate } from "@/components/registration-gate";
import type { AvatarConfig } from "@/components/app-state-provider";

type ChildProfileRow = {
  id?: string;
  child_name: string;
  child_age: number;
  profile_code: string;
  player_code?: string;
  contact_email?: string | null;
  has_pin?: boolean;
  pin_updated_at?: string | null;
  avatar?: string | null;
  avatar_config?: AvatarConfig | null;
};

export function ParentAuthGate() {
  const { completeRegistration, openParentAuthGate, setTrustedContacts } = useAppState();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const registrationAppliedRef = useRef(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [accountEmail, setAccountEmail] = useState("");
  const [password, setPassword] = useState("");
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("11");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [needsChildProfile, setNeedsChildProfile] = useState(false);

  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  const postAuthTarget = useMemo(() => {
    if (!pathname || pathname === "/" || pathname.startsWith("/auth/callback")) {
      return "/profile";
    }
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  async function handleForgotPassword() {
    setError("");
    setInfo("");

    if (!supabase) {
      setError("Chybí konfigurace přihlášení. Otevři aplikaci znovu.");
      return;
    }

    const email = accountEmail.trim().toLowerCase();
    if (!email.includes("@") || !email.includes(".")) {
      setError("Napiš nejdřív svůj e-mail a pak klikni na Zapomenuté heslo.");
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`
    });

    if (resetError) {
      setError("Odeslání odkazu se nepodařilo. Zkus to prosím za chvíli.");
      return;
    }

    setInfo("Poslali jsme ti e-mail s odkazem na obnovu hesla. Zkontroluj schránku i spam.");
  }

  const hydrateFromCloud = useCallback(
    async (parentUserEmail: string, providedAccessToken?: string) => {
      if (!supabase || registrationAppliedRef.current) {
        return;
      }

      const sessionAccessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      const accessToken = providedAccessToken || sessionAccessToken;
      let data: ChildProfileRow | null = null;
      if (accessToken) {
        const response = await fetch("/api/child-profile/me", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Cache-Control": "no-store"
          }
        }).catch(() => null);

        if (response?.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { profile?: ChildProfileRow | null }
            | null;
          data = payload?.profile ?? null;
        }
      }

      if (!data) {
        // Retry once: right after login, session propagation in browser can lag behind server token.
        if (providedAccessToken) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          const retryResponse = await fetch("/api/child-profile/me", {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${providedAccessToken}`,
              "Cache-Control": "no-store"
            }
          }).catch(() => null);

          if (retryResponse?.ok) {
            const retryPayload = (await retryResponse.json().catch(() => null)) as
              | { profile?: ChildProfileRow | null }
              | null;
            data = retryPayload?.profile ?? null;
          }
        }
      }

      if (!data) {
        setAccountEmail(parentUserEmail);
        setNeedsChildProfile(true);
        setInfo("Účet je přihlášený. Teď nastav jméno a věk hráče.");
        setLoading(false);
        return;
      }

      registrationAppliedRef.current = true;
      completeRegistration({
        name: data.child_name,
        age: data.child_age,
        playerCode: data.player_code || data.profile_code,
        profileCode: data.profile_code,
        profileRowId: (data as { id?: string | null }).id ?? null,
        parentEmail: parentUserEmail,
        hasChildPin: false,
        avatar: data.avatar ?? undefined,
        avatarConfig: data.avatar_config ?? undefined
      });
      router.replace(postAuthTarget);
    },
    [completeRegistration, postAuthTarget, router, supabase]
  );

  useEffect(() => {
    async function bootstrap() {
      if (!supabase) {
        return;
      }

      setLoading(true);
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setLoading(false);
        return;
      }

      await hydrateFromCloud(session.user.email ?? "");
      setLoading(false);
    }

    void bootstrap();
  }, [hydrateFromCloud, supabase]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("auth") === "confirmed") {
      setInfo("E-mail je potvrzený. Teď se přihlas stejným e-mailem a heslem.");
      if (url.pathname === "/") {
        url.searchParams.delete("auth");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }
  }, []);

  async function handleAccountAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfo("");

    if (!supabase) {
      setError("Supabase není nastavené. Dočasně použij lokální registraci.");
      return;
    }

    if (!accountEmail.includes("@") || password.length < 6) {
      setError("Zadej platný e-mail a heslo aspoň 6 znaků.");
      return;
    }

    setSaving(true);

    if (mode === "login") {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: accountEmail.trim(),
          password
        })
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | {
            ok?: boolean;
            code?: string;
            retry_after?: number;
            user?: { id: string; email?: string | null };
            session?: { access_token: string; refresh_token: string };
            profile?: ChildProfileRow | null;
          }
        | null;

      if (!response?.ok || !payload?.ok || !payload.user || !payload.session) {
        setSaving(false);
        if (payload?.code === "rate_limited") {
          const retryAfter = payload.retry_after ?? 60;
          setError(`Limit přihlášení je vyčerpaný. Zkus to znovu za ${retryAfter} s.`);
        } else if (payload?.code === "email_not_confirmed") {
          setError("Nejdřív potvrď e-mail v doručené poště a pak se přihlas.");
        } else {
          setError("Přihlášení se nepodařilo.");
        }
        return;
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: payload.session.access_token,
        refresh_token: payload.session.refresh_token
      });

      if (setSessionError) {
        setSaving(false);
        setError("Přihlášení proběhlo, ale nepodařilo se obnovit session.");
        return;
      }

      setTrustedContacts([accountEmail.trim()]);

      // Canonical-only hydration path:
      // Do not hydrate profile from login payload, because historical rows can make this stale.
      // Always fetch profile through /api/child-profile/me (single canonical source).
      await hydrateFromCloud(payload.user.email ?? accountEmail.trim(), payload.session.access_token);
      if (!registrationAppliedRef.current) {
        setNeedsChildProfile(true);
        setInfo("Účet je přihlášený. Teď nastav jméno a věk hráče.");
      }
      setSaving(false);
      return;
    }

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: accountEmail.trim(),
        password
      })
    }).catch(() => null);

    const payload = (await response?.json().catch(() => null)) as
      | {
          ok?: boolean;
          code?: string;
          retry_after?: number;
          user?: { id: string; email?: string | null };
          needs_email_confirmation?: boolean;
          session?: { access_token: string; refresh_token: string } | null;
        }
      | null;

    if (!response?.ok || !payload?.ok || !payload.user) {
      setSaving(false);
      if (payload?.code === "rate_limited") {
        const retryAfter = payload.retry_after ?? 60;
        setError(`Limit registrací je vyčerpaný. Zkus to znovu za ${retryAfter} s.`);
      } else if (payload?.code === "provider_rate_limited") {
        setError("E-mail služba je dočasně omezená. Počkej chvíli a zkus to znovu.");
      } else if (payload?.code === "already_registered") {
        setError("Tento e-mail už je registrovaný. Přepni na Přihlášení.");
      } else {
        setError("Registrace se nepodařila.");
      }
      return;
    }

    if (payload.needs_email_confirmation || !payload.session) {
      setAccountEmail(accountEmail.trim());
      setMode("login");
      setLoading(false);
      setInfo("Na e-mail jsme poslali potvrzovací odkaz. Po potvrzení se přihlas stejným e-mailem a heslem.");
      setSaving(false);
      return;
    }

    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: payload.session.access_token,
      refresh_token: payload.session.refresh_token
    });

    if (setSessionError) {
      setSaving(false);
      setError("Registrace proběhla, ale nepodařilo se obnovit session.");
      return;
    }

    setAccountEmail(payload.user.email ?? accountEmail.trim());
    setNeedsChildProfile(true);
    setLoading(false);
    setSaving(false);
  }

  async function handleChildProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!supabase) {
      return;
    }

    const trimmedName = childName.trim();
    const numericAge = Number(childAge);
    if (trimmedName.length < 2) {
      setError("Napiš prosím jméno hráče.");
      return;
    }

    if (!Number.isInteger(numericAge) || numericAge < 8) {
      setError("Věk musí být číslo od 8 výš.");
      return;
    }

    setSaving(true);

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.user) {
      setSaving(false);
      setError("Účet není přihlášený. Přihlas se znovu.");
      setNeedsChildProfile(false);
      return;
    }

    const accessToken = session.access_token ?? "";
    const profileResponse = await fetch("/api/child-profile/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        child_name: trimmedName,
        child_age: numericAge
      })
    }).catch(() => null);

    const profilePayload = (await profileResponse?.json().catch(() => null)) as
      | {
          ok?: boolean;
          profile?: ChildProfileRow;
          profile_id?: string | null;
        }
      | null;

    if (!profileResponse?.ok || !profilePayload?.ok || !profilePayload.profile?.profile_code) {
      setSaving(false);
      setError("Uložení profilu hráče se nepodařilo.");
      return;
    }

    const profileCode = profilePayload.profile.profile_code;
    const playerCode = profilePayload.profile.player_code || profileCode;

    setInfo("Profil hráče je uložený.");

    registrationAppliedRef.current = true;
    completeRegistration({
      name: trimmedName,
      age: numericAge,
      playerCode,
      profileCode,
      profileRowId: profilePayload.profile_id ?? null,
      parentEmail: accountEmail || session.user.email || "",
      hasChildPin: false
    });
    setTrustedContacts([accountEmail || session.user.email || ""]);
    setSaving(false);
    router.replace(postAuthTarget);
  }

  async function handleUseDifferentAccount() {
    setError("");
    setInfo("");

    if (supabase) {
      await supabase.auth.signOut().catch(() => null);
    }

    registrationAppliedRef.current = false;
    openParentAuthGate();
    setNeedsChildProfile(false);
    setMode("login");
    setAccountEmail("");
    setPassword("");
    setChildName("");
    setChildAge("11");
    setInfo("Přihlášení bylo zrušené. Můžeš použít jiný e-mail nebo vytvořit nový účet.");
  }

  if (!supabase) {
    return <RegistrationGate />;
  }

  if (needsChildProfile) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-6">
        <section className="glass-card w-full max-w-md p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-coral">Profil hráče</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Dokončení registrace hráče</h1>
          <p className="mt-3 text-sm leading-6 text-mist">
            Účet <span className="font-semibold text-white">{accountEmail || "pro potvrzený e-mail"}</span> je už potvrzený a
            přihlášený. Teď už jen dokonči jméno hráče a věk.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleUseDifferentAccount}
              className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-mist transition hover:border-white/20 hover:text-white"
            >
              Použít jiný e-mail
            </button>
          </div>

          <form onSubmit={handleChildProfile} className="mt-6 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm text-mist">Jméno hráče</span>
              <input
                type="text"
                value={childName}
                onChange={(event) => setChildName(event.target.value)}
                placeholder="Traki"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-mist">Věk</span>
              <input
                type="number"
                value={childAge}
                onChange={(event) => setChildAge(event.target.value)}
                min={8}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
              />
            </label>

            {error ? <p className="text-sm text-coral">{error}</p> : null}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-coral px-4 py-3 text-base font-semibold text-white disabled:opacity-70"
            >
              {saving ? "Ukládám profil hráče..." : "Dokončit nastavení"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-6">
      <section className="glass-card w-full max-w-md p-6">
        <div className="mb-5 text-center">
          <p className="text-xs uppercase tracking-[0.24em] text-lime">Traki na stopě</p>
          <p className="mt-1 text-sm text-mist">Choď městem, luště, objevuj.</p>
        </div>
        <div className="flex gap-2 rounded-2xl bg-white/5 p-2">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${mode === "login" ? "bg-white text-night" : "text-mist"}`}
          >
            Přihlášení
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${mode === "signup" ? "bg-white text-night" : "text-mist"}`}
          >
            Vytvořit účet
          </button>
        </div>

        <h1 className="mt-5 text-2xl font-bold">
          {mode === "login" ? "Přihlášení" : "Vytvoř účet"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-mist">
          {mode === "login"
            ? "Přihlas se e-mailem a heslem a pokračuj do hry."
            : "Nejdřív si vytvoř účet e-mailem a heslem. Hned potom nastavíš jméno hráče a věk."}
        </p>
        {loading ? <p className="mt-2 text-xs text-mist">Kontroluju, jestli už tenhle účet existuje…</p> : null}

        <form onSubmit={handleAccountAuth} className="mt-5 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-mist">E-mail</span>
            <input
              type="email"
              value={accountEmail}
              onChange={(event) => setAccountEmail(event.target.value)}
              placeholder="tvuj@email.cz"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-mist">Heslo</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="aspoň 6 znaků"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
            />
          </label>

          {error ? <p className="text-sm text-coral">{error}</p> : null}
          {info ? <p className="text-sm text-lime">{info}</p> : null}

          <button
            type="submit"
            disabled={saving || loading}
            className="w-full rounded-2xl bg-coral px-4 py-3 text-base font-semibold text-white disabled:opacity-70"
          >
            {saving || loading
              ? "Ověřuju účet..."
              : mode === "login"
                ? "Přihlásit"
                : "Vytvořit účet"}
          </button>

          {mode === "login" ? (
            <button
              type="button"
              onClick={handleForgotPassword}
              className="w-full pt-1 text-center text-sm text-mist underline underline-offset-4 transition hover:text-white"
            >
              Zapomenuté heslo?
            </button>
          ) : null}
        </form>
      </section>
    </main>
  );
}
