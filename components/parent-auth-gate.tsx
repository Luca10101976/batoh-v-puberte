"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAppState } from "@/components/app-state-provider";
import { RegistrationGate } from "@/components/registration-gate";
import { normalizePin } from "@/lib/pin";
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

function generateProfileCode() {
  return `BAT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function ParentAuthGate() {
  const { completeRegistration, setTrustedContacts } = useAppState();
  const router = useRouter();
  const registrationAppliedRef = useRef(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [accountEmail, setAccountEmail] = useState("");
  const [password, setPassword] = useState("");
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("11");
  const [childPin, setChildPin] = useState("");
  const [childPinConfirm, setChildPinConfirm] = useState("");
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

  const ensureProfileForLoggedUser = useCallback(
    async (parentUserId: string, parentUserEmail: string) => {
      if (!supabase) {
        return null;
      }

      const modern = await supabase
        .from("child_profiles")
        .select("id, child_name, child_age, profile_code, player_code, pin_hash, pin_updated_at, created_at")
        .eq("parent_user_id", parentUserId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1);

      if (!modern.error && modern.data?.[0]) {
        const row = modern.data[0] as {
          child_name: string;
          child_age: number;
          profile_code: string;
          player_code?: string | null;
          pin_hash?: string | null;
          pin_updated_at?: string | null;
        };
        return {
          name: row.child_name,
          age: row.child_age,
          profileCode: row.profile_code,
          playerCode: row.player_code || row.profile_code,
          profileRowId: (modern.data[0] as { id?: string | null }).id ?? null,
          hasChildPin: Boolean(row.pin_hash) || Boolean(row.pin_updated_at)
        };
      }

      if (modern.error?.code === "42703") {
        const legacy = await supabase
          .from("child_profiles")
          .select("child_name, child_age, profile_code, pin_updated_at")
          .eq("parent_user_id", parentUserId)
          .order("created_at", { ascending: true })
          .limit(1);

        if (!legacy.error && legacy.data?.[0]) {
          const row = legacy.data[0] as {
            child_name: string;
            child_age: number;
            profile_code: string;
            pin_updated_at?: string | null;
          };
          return {
            name: row.child_name,
            age: row.child_age,
            profileCode: row.profile_code,
          playerCode: row.profile_code,
          profileRowId: null,
          hasChildPin: Boolean(row.pin_updated_at)
        };
        }
      }

      const fallbackCode = generateProfileCode();
      const fallbackName = parentUserEmail.split("@")[0]?.slice(0, 40) || "Hráč";

      const createModern = await supabase.from("child_profiles").insert({
        parent_user_id: parentUserId,
        child_name: fallbackName,
        child_age: 11,
        profile_code: fallbackCode,
        player_code: fallbackCode,
        contact_email: parentUserEmail || null
      });

      if (createModern.error?.code === "42703") {
        const createLegacy = await supabase.from("child_profiles").insert({
          parent_user_id: parentUserId,
          child_name: fallbackName,
          child_age: 11,
          profile_code: fallbackCode
        });
        if (createLegacy.error) {
          return null;
        }
      } else if (createModern.error) {
        return null;
      }

      return {
        name: fallbackName,
        age: 11,
        profileCode: fallbackCode,
        playerCode: fallbackCode,
        profileRowId: null,
        hasChildPin: false
      };
    },
    [supabase]
  );

  const hydrateFromCloud = useCallback(
    async (parentUserId: string, parentUserEmail: string, providedAccessToken?: string) => {
      if (!supabase || registrationAppliedRef.current) {
        return;
      }

      const sessionAccessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      const accessToken = providedAccessToken || sessionAccessToken;
      let data: ChildProfileRow | null = null;
      let hasChildPin = false;

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
          hasChildPin = Boolean(data?.has_pin);
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
            hasChildPin = Boolean(data?.has_pin);
          }
        }
      }

      if (!data) {
        // Client-side fallback for older schema variants / transient API issues.
        const modernQuery = await supabase
          .from("child_profiles")
          .select("id, child_name, child_age, profile_code, player_code, contact_email, pin_hash, pin_updated_at, created_at")
          .eq("parent_user_id", parentUserId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(1);

        if (!modernQuery.error && modernQuery.data?.[0]) {
          data = modernQuery.data[0] as ChildProfileRow;
          hasChildPin = Boolean((modernQuery.data[0] as { pin_hash?: string | null; pin_updated_at?: string | null }).pin_hash)
            || Boolean((modernQuery.data[0] as { pin_hash?: string | null; pin_updated_at?: string | null }).pin_updated_at);
        } else if (modernQuery.error?.code === "42703") {
          const legacyQuery = await supabase
            .from("child_profiles")
            .select("child_name, child_age, profile_code, pin_updated_at")
            .eq("parent_user_id", parentUserId)
            .order("created_at", { ascending: true })
            .limit(1);

          if (!legacyQuery.error && legacyQuery.data?.[0]) {
            data = legacyQuery.data[0] as ChildProfileRow;
            hasChildPin = Boolean((legacyQuery.data[0] as { pin_updated_at?: string | null }).pin_updated_at);
          }
        }
      }

      if (!data) {
        setAccountEmail(parentUserEmail);
        setNeedsChildProfile(false);
        setMode("signup");
        setInfo("K tomuto e-mailu jsme nenašli profil hráče. Vytvoř ho v záložce Vytvořit účet.");
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
        hasChildPin,
        avatar: data.avatar ?? undefined,
        avatarConfig: data.avatar_config ?? undefined
      });
      router.replace("/profile");
    },
    [completeRegistration, router, supabase]
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

      await hydrateFromCloud(session.user.id, session.user.email ?? "");
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
      await hydrateFromCloud(payload.user.id, payload.user.email ?? accountEmail.trim(), payload.session.access_token);
      if (!registrationAppliedRef.current) {
        const ensured = await ensureProfileForLoggedUser(payload.user.id, payload.user.email ?? accountEmail.trim());
        if (ensured) {
          registrationAppliedRef.current = true;
          completeRegistration({
            name: ensured.name,
            age: ensured.age,
            playerCode: ensured.playerCode,
            profileCode: ensured.profileCode,
            profileRowId: ensured.profileRowId,
            parentEmail: payload.user.email ?? accountEmail.trim(),
            hasChildPin: ensured.hasChildPin
          });
          setSaving(false);
          router.replace("/profile");
          return;
        }
        setMode("signup");
        setInfo("Profil se nepodařilo načíst ani vytvořit. Zkus prosím Vytvořit účet.");
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
    const normalizedPin = normalizePin(childPin);
    const normalizedPinConfirm = normalizePin(childPinConfirm);

    if (trimmedName.length < 2) {
      setError("Napiš prosím jméno dítěte.");
      return;
    }

    if (!Number.isInteger(numericAge) || numericAge < 8) {
      setError("Věk musí být číslo od 8 výš.");
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
      setError("Účet není přihlášený. Přihlas se znovu.");
      setNeedsChildProfile(false);
      return;
    }

    // Canonical row = oldest — consistent with read path
    const { data: existingRows } = await supabase
      .from("child_profiles")
      .select("id, profile_code, player_code")
      .eq("parent_user_id", session.user.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1);

    const existing = existingRows?.[0] as { id: string; profile_code: string; player_code?: string | null } | undefined;
    const profileCode = existing?.profile_code || generateProfileCode();
    const playerCode = existing?.player_code || profileCode;
    const contactEmail = (session.user.email ?? accountEmail.trim()) || null;

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("child_profiles")
        .update({
          child_name: trimmedName,
          child_age: numericAge,
          player_code: playerCode,
          contact_email: contactEmail
        })
        .eq("id", existing.id);

      if (updateError?.code === "42703") {
        const legacyUpdate = await supabase
          .from("child_profiles")
          .update({
            child_name: trimmedName,
            child_age: numericAge
          })
          .eq("id", existing.id);

        if (legacyUpdate.error) {
          setSaving(false);
          setError("Uložení profilu dítěte se nepodařilo.");
          return;
        }
      } else if (updateError) {
        setSaving(false);
        setError("Uložení profilu dítěte se nepodařilo.");
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("child_profiles").insert({
        parent_user_id: session.user.id,
        child_name: trimmedName,
        child_age: numericAge,
        profile_code: profileCode,
        player_code: profileCode,
        contact_email: contactEmail
      });

      if (insertError?.code === "42703") {
        const legacyInsert = await supabase.from("child_profiles").insert({
          parent_user_id: session.user.id,
          child_name: trimmedName,
          child_age: numericAge,
          profile_code: profileCode
        });
        if (legacyInsert.error) {
          setSaving(false);
          setError("Uložení profilu dítěte se nepodařilo.");
          return;
        }
      } else if (insertError) {
        setSaving(false);
        setError("Uložení profilu dítěte se nepodařilo.");
        return;
      }
    }

    const accessToken = session.access_token ?? "";
    const setPinResponse = await fetch("/api/pin/set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({
        pin: normalizedPin,
        profileCode
      })
    }).catch(() => null);

    if (!setPinResponse?.ok) {
      setSaving(false);
      setError("Profil je uložený, ale PIN se nepodařilo bezpečně nastavit. Zkus to znovu.");
      return;
    }

    const parentAlertResponse = await fetch("/api/parent-alert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({
        event: "registration",
        childName: trimmedName,
        childAge: numericAge
      })
    }).catch(() => null);

    if (!parentAlertResponse?.ok) {
      const responsePayload = await parentAlertResponse?.json().catch(() => null);
      const responseMessage =
        typeof responsePayload?.message === "string" ? responsePayload.message : "E-mail se nepodařilo odeslat.";
      setInfo(`Profil hráče je uložený. Informační e-mail neodešel: ${responseMessage}`);
    } else {
      setInfo("Profil hráče je uložený a informační e-mail byl odeslaný.");
    }

    registrationAppliedRef.current = true;
    completeRegistration({
      name: trimmedName,
      age: numericAge,
      playerCode,
      profileCode,
      profileRowId: existing?.id ?? null,
      parentEmail: accountEmail || session.user.email || "",
      hasChildPin: true
    });
    setTrustedContacts([accountEmail || session.user.email || ""]);
    setSaving(false);
    router.replace("/profile");
  }

  if (!supabase) {
    return <RegistrationGate />;
  }

  if (needsChildProfile) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-6">
        <section className="glass-card w-full max-w-md p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-coral">Profil hráče</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Jednorázové nastavení hráče</h1>
          <p className="mt-3 text-sm leading-6 text-mist">
            Účet je přihlášený. Tohle není další přihlášení. Jen jednou nastav profil hráče pro všechna zařízení.
          </p>

          <form onSubmit={handleChildProfile} className="mt-6 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm text-mist">Jméno hráče</span>
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
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-mist">PIN hráče</span>
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
          {mode === "login" ? "Přihlášení hráče" : "Vytvoření účtu hráče"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-mist">
          {mode === "login"
            ? "Přihlas se e-mailem a heslem. Hráč pak pokračuje svým PINem."
            : "Pro první spuštění: vytvoř účet hráče. Po potvrzení e-mailu se přihlas stejnými údaji."}
        </p>
        {loading ? <p className="mt-2 text-xs text-mist">Kontroluju, jestli už tenhle účet existuje…</p> : null}

        <form onSubmit={handleAccountAuth} className="mt-5 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-mist">E-mail</span>
            <input
              type="email"
              value={accountEmail}
              onChange={(event) => setAccountEmail(event.target.value)}
              placeholder="postope@panbatoh.cz"
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
        </form>
      </section>
    </main>
  );
}
