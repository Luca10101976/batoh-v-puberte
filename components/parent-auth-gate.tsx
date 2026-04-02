"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAppState } from "@/components/app-state-provider";
import { RegistrationGate } from "@/components/registration-gate";
import { hashPin, normalizePin } from "@/lib/pin";

type ChildProfileRow = {
  child_name: string;
  child_age: number;
  profile_code: string;
};

function generateProfileCode() {
  return `BAT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function ParentAuthGate() {
  const { completeRegistration, setTrustedContacts } = useAppState();
  const router = useRouter();
  const registrationAppliedRef = useRef(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [parentEmail, setParentEmail] = useState("");
  const [password, setPassword] = useState("");
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("11");
  const [childPin, setChildPin] = useState("");
  const [childPinConfirm, setChildPinConfirm] = useState("");
  const [loading, setLoading] = useState(true);
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

  const hydrateFromCloud = useCallback(
    async (parentUserId: string, parentUserEmail: string) => {
      if (!supabase || registrationAppliedRef.current) {
        return;
      }

      const { data: profileRows, error: profileError } = await supabase
        .from("child_profiles")
        .select("child_name, child_age, profile_code")
        .eq("parent_user_id", parentUserId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (profileError) {
        setParentEmail(parentUserEmail);
        setNeedsChildProfile(true);
        setInfo("Profil dítěte se nepodařilo načíst, pokračuj vytvořením nového profilu.");
        setLoading(false);
        return;
      }

      const data = (profileRows?.[0] as ChildProfileRow | undefined) ?? null;

      if (!data) {
        setParentEmail(parentUserEmail);
        setNeedsChildProfile(true);
        setLoading(false);
        return;
      }

      let childPinHash: string | null = null;
      const { data: pinRows } = await supabase
        .from("child_profiles")
        .select("pin_hash")
        .eq("parent_user_id", parentUserId)
        .order("created_at", { ascending: false })
        .limit(1);
      childPinHash = pinRows?.[0]?.pin_hash ?? null;

      registrationAppliedRef.current = true;
      completeRegistration({
        name: data.child_name,
        age: data.child_age,
        profileCode: data.profile_code,
        parentEmail: parentUserEmail,
        childPinHash
      });
      router.replace("/profile");
    },
    [completeRegistration, router, supabase]
  );

  useEffect(() => {
    async function bootstrap() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setLoading(false);
        return;
      }

      await hydrateFromCloud(session.user.id, session.user.email ?? "");
    }

    bootstrap();
  }, [hydrateFromCloud, supabase]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("auth") === "confirmed") {
      setInfo("E-mail rodiče je potvrzený. Teď se přihlas rodičovským e-mailem a heslem.");
      if (url.pathname === "/") {
        url.searchParams.delete("auth");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }
  }, []);

  async function handleParentAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfo("");

    if (!supabase) {
      setError("Supabase není nastavené. Dočasně použij lokální registraci.");
      return;
    }

    if (!parentEmail.includes("@") || password.length < 6) {
      setError("Zadej platný e-mail rodiče a heslo aspoň 6 znaků.");
      return;
    }

    setSaving(true);

    if (mode === "login") {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: parentEmail.trim(),
        password
      });

      if (loginError || !data.user) {
        setSaving(false);
        if (loginError?.message?.toLowerCase().includes("email not confirmed")) {
          setError("Nejdřív potvrď e-mail rodiče v doručené poště a pak se přihlas.");
        } else {
          setError(loginError?.message || "Přihlášení se nepodařilo.");
        }
        return;
      }

      setTrustedContacts([parentEmail.trim()]);

      await hydrateFromCloud(data.user.id, data.user.email ?? parentEmail.trim());
      setSaving(false);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parentEmail.trim(),
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined
      }
    });

    if (signUpError || !data.user) {
      setSaving(false);
      const message = String(signUpError?.message || "");
      const normalizedMessage = message.toLowerCase();
      if (normalizedMessage.includes("rate limit")) {
        setError("Limit pro odeslání e-mailu je teď vyčerpaný. Počkej chvíli a zkus to znovu.");
      } else if (normalizedMessage.includes("already registered")) {
        setError("Tento e-mail už je registrovaný. Přepni na Přihlášení dítěte.");
      } else {
        setError(message || "Registrace rodiče se nepodařila.");
      }
      return;
    }

    if (!data.session) {
      setParentEmail(parentEmail.trim());
      setMode("login");
      setLoading(false);
      setInfo("Na e-mail rodiče jsme poslali potvrzovací odkaz. Po potvrzení se přihlas stejným e-mailem a heslem.");
      setSaving(false);
      return;
    }

    setParentEmail(data.user.email ?? parentEmail.trim());
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
    const normalizedPin = normalizePin(childPin);
    const normalizedPinConfirm = normalizePin(childPinConfirm);

    if (trimmedName.length < 2) {
      setError("Napiš prosím jméno dítěte.");
      return;
    }

    if (!Number.isInteger(numericAge) || numericAge < 8 || numericAge > 16) {
      setError("Věk musí být číslo mezi 8 a 16.");
      return;
    }

    if (normalizedPin.length < 4 || normalizedPin.length > 6) {
      setError("PIN dítěte musí mít 4 až 6 číslic.");
      return;
    }

    if (normalizedPin !== normalizedPinConfirm) {
      setError("PIN a potvrzení PINu se neshodují.");
      return;
    }

    setSaving(true);

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.user) {
      setSaving(false);
      setError("Rodič není přihlášený. Přihlas se znovu.");
      setNeedsChildProfile(false);
      return;
    }

    const profileCode = generateProfileCode();

    const { error: insertError } = await supabase.from("child_profiles").insert({
      parent_user_id: session.user.id,
      child_name: trimmedName,
      child_age: numericAge,
      profile_code: profileCode
    });

    if (insertError) {
      setSaving(false);
      setError("Uložení profilu dítěte se nepodařilo.");
      return;
    }

    await supabase.from("child_profiles").update({ pin_hash: hashPin(normalizedPin) }).eq("profile_code", profileCode);

    const accessToken = session.access_token ?? "";
    const parentAlertResponse = await fetch("/api/parent-alert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({
        event: "registration",
        parentEmail: parentEmail || session.user.email,
        childName: trimmedName,
        childAge: numericAge
      })
    }).catch(() => null);

    if (!parentAlertResponse?.ok) {
      const responsePayload = await parentAlertResponse?.json().catch(() => null);
      const responseMessage =
        typeof responsePayload?.message === "string" ? responsePayload.message : "E-mail se nepodařilo odeslat.";
      setInfo(`Profil dítěte je uložený. Upozornění rodiči neodešlo: ${responseMessage}`);
    } else {
      setInfo("Profil dítěte je uložený a upozornění rodiči bylo odeslané.");
    }

    registrationAppliedRef.current = true;
    completeRegistration({
      name: trimmedName,
      age: numericAge,
      profileCode,
      parentEmail: parentEmail || session.user.email || "",
      childPin: normalizedPin
    });
    setTrustedContacts([parentEmail || session.user.email || ""]);
    setSaving(false);
    router.replace("/profile");
  }

  if (!supabase) {
    return <RegistrationGate />;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-6">
        <section className="glass-card w-full max-w-md p-6">
          <h1 className="text-2xl font-bold">Načítám rodičovský účet…</h1>
          <p className="mt-3 text-sm text-mist">Kontroluju přihlášení a profil dítěte.</p>
        </section>
      </main>
    );
  }

  if (needsChildProfile) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-6">
        <section className="glass-card w-full max-w-md p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-coral">Profil dítěte</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Ještě jeden krok</h1>
          <p className="mt-3 text-sm leading-6 text-mist">
            Rodič je přihlášený. Teď nastav profil dítěte, který se bude načítat i na dalších zařízeních.
          </p>

          <form onSubmit={handleChildProfile} className="mt-6 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm text-mist">Jméno dítěte</span>
              <input
                type="text"
                value={childName}
                onChange={(event) => setChildName(event.target.value)}
                placeholder="Pan Batůžek"
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
                max={16}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-mist">PIN dítěte</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={childPin}
                onChange={(event) => setChildPin(normalizePin(event.target.value))}
                placeholder="4 až 6 číslic"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-mist">Potvrdit PIN</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={childPinConfirm}
                onChange={(event) => setChildPinConfirm(normalizePin(event.target.value))}
                placeholder="Zopakuj stejný PIN"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
              />
            </label>

            {error ? <p className="text-sm text-coral">{error}</p> : null}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-coral px-4 py-3 text-base font-semibold text-white disabled:opacity-70"
            >
              {saving ? "Ukládám profil dítěte..." : "Dokončit nastavení"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-6">
      <section className="glass-card w-full max-w-md p-6">
        <div className="flex gap-2 rounded-2xl bg-white/5 p-2">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${mode === "login" ? "bg-white text-night" : "text-mist"}`}
          >
            Přihlášení dítěte
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${mode === "signup" ? "bg-white text-night" : "text-mist"}`}
          >
            Požádat rodiče o autorizaci
          </button>
        </div>

        <h1 className="mt-5 text-2xl font-bold">
          {mode === "login" ? "Přihlášení dítěte" : "Požádej rodiče o autorizaci"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-mist">
          {mode === "login"
            ? "Přihlas se rodičovským e-mailem a heslem. Profil se pak obnoví i po změně zařízení."
            : "Pro první spuštění: zadej e-mail rodiče a heslo. Rodiči přijde potvrzovací e-mail."}
        </p>

        <form onSubmit={handleParentAuth} className="mt-5 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-mist">E-mail rodiče</span>
            <input
              type="email"
              value={parentEmail}
              onChange={(event) => setParentEmail(event.target.value)}
              placeholder="rodic@email.cz"
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
            disabled={saving}
            className="w-full rounded-2xl bg-coral px-4 py-3 text-base font-semibold text-white disabled:opacity-70"
          >
            {saving
              ? "Ověřuju účet..."
              : mode === "login"
                ? "Přihlásit dítě"
                : "Požádat rodiče"}
          </button>
        </form>
      </section>
    </main>
  );
}
