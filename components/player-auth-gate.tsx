"use client";

import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { type AvatarConfig, useAppState } from "@/components/app-state-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { formatRecoveryKey, normalizeRecoveryKey } from "@/lib/recovery-key";

// Přihlášení hráče (R17):
//   NOVÝ HRÁČ    -> přezdívka + avatar -> Supabase anonymní účet -> profil -> Traki klíč
//   UŽ MÁM TRAKI -> Traki klíč -> /api/recovery-key/redeem -> verifyOtp -> stejný účet
//   STARŠÍ ÚČET  -> e-mail + heslo (jen pro hráče vytvořené před R17)
//
// Traki klíč = 4 česká slova (LAMA-MOST-KUFR-MRAK). Není to friend code.
// Plaintext klíče drží jen toto zařízení (localStorage), server má pouze hash.

export const RECOVERY_KEY_LOCAL_STORAGE_KEY = "pan-batoh-recovery-key";

type Screen = "start" | "new" | "key" | "recover" | "email";

type ChildProfileRow = {
  id?: string | null;
  child_name: string;
  profile_code: string;
  player_code?: string | null;
  avatar?: string | null;
  avatar_config?: AvatarConfig | null;
};

const AVATAR_OPTIONS = Array.from({ length: 20 }, (_, index) => `batuzek-${String(index + 1).padStart(2, "0")}`);

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none placeholder:text-mist/60";
const primaryButton = "w-full rounded-[20px] bg-lime px-4 py-3 text-base font-semibold text-night disabled:opacity-60";
const secondaryButton =
  "w-full rounded-[20px] border border-white/15 bg-white/5 px-4 py-3 text-base font-semibold text-white disabled:opacity-60";
const linkButton = "text-sm text-mist underline underline-offset-4 hover:text-white";

export function saveRecoveryKeyLocally(formattedKey: string) {
  try {
    window.localStorage.setItem(RECOVERY_KEY_LOCAL_STORAGE_KEY, formattedKey);
  } catch {
    // localStorage nemusí být dostupný – klíč se pak jen nezobrazí znovu
  }
}

// Volat POUZE při explicitním "Odhlásit" hráče – ne při refreshi, zavření aplikace
// ani expiraci/obnově session.
export function clearRecoveryKeyLocally() {
  try {
    window.localStorage.removeItem(RECOVERY_KEY_LOCAL_STORAGE_KEY);
  } catch {
    // localStorage nemusí být dostupný
  }
}

export function readRecoveryKeyLocally(): string | null {
  try {
    return window.localStorage.getItem(RECOVERY_KEY_LOCAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function PlayerAuthGate() {
  const router = useRouter();
  const { completeRegistration } = useAppState();
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  const [screen, setScreen] = useState<Screen>("start");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(AVATAR_OPTIONS[0]);

  const [issuedKey, setIssuedKey] = useState("");
  const [copied, setCopied] = useState(false);

  const [recoverInput, setRecoverInput] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const registrationAppliedRef = useRef(false);

  const fetchProfile = useCallback(async (accessToken: string): Promise<ChildProfileRow | null> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch("/api/child-profile/me", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}`, "Cache-Control": "no-store" }
      }).catch(() => null);
      if (response?.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { profile?: ChildProfileRow | null; profile_id?: string | null }
          | null;
        if (payload?.profile) {
          return { ...payload.profile, id: payload.profile.id ?? payload.profile_id ?? null };
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    return null;
  }, []);

  const finishWithProfile = useCallback(
    (profile: ChildProfileRow, accountEmail?: string | null) => {
      if (registrationAppliedRef.current) {
        return;
      }
      registrationAppliedRef.current = true;
      completeRegistration({
        name: profile.child_name,
        playerCode: profile.player_code || profile.profile_code,
        profileCode: profile.profile_code,
        profileRowId: profile.id ?? null,
        parentEmail: accountEmail ?? "",
        avatar: profile.avatar ?? undefined,
        avatarConfig: profile.avatar_config ?? undefined
      });
      router.replace("/");
    },
    [completeRegistration, router]
  );

  // ---------------------------------------------------------------- nový hráč
  async function handleCreatePlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("Traki se teď nemůže připojit. Zkus to za chvíli.");
      return;
    }
    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 24) {
      setError("Přezdívka musí mít 2 až 24 znaků.");
      return;
    }
    setBusy(true);

    // 1) stabilní hráčský účet bez e-mailu a hesla
    const { data: anon, error: anonError } = await supabase.auth.signInAnonymously();
    const accessToken = anon?.session?.access_token ?? "";
    if (anonError || !accessToken) {
      setBusy(false);
      setError("Nepodařilo se založit hráče. Zkus to prosím znovu.");
      return;
    }

    // 2) profil hráče (stejný model jako dosud)
    const profileResponse = await fetch("/api/child-profile/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ child_name: trimmed, avatar })
    }).catch(() => null);
    if (!profileResponse?.ok) {
      setBusy(false);
      setError("Profil se nepodařilo uložit. Zkus to prosím znovu.");
      return;
    }

    // 3) Traki klíč (generuje výhradně server)
    const keyResponse = await fetch("/api/recovery-key/create", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` }
    }).catch(() => null);
    const keyPayload = (await keyResponse?.json().catch(() => null)) as { ok?: boolean; recovery_key?: string } | null;
    if (!keyResponse?.ok || !keyPayload?.ok || !keyPayload.recovery_key) {
      setBusy(false);
      setError("Hráč je založený, ale Traki klíč se nepodařilo vytvořit. Zkus to prosím znovu.");
      return;
    }
    saveRecoveryKeyLocally(keyPayload.recovery_key);
    setIssuedKey(keyPayload.recovery_key);
    setBusy(false);
    setScreen("key");
  }

  async function handleKeySaved() {
    if (!supabase) {
      return;
    }
    setBusy(true);
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    const profile = accessToken ? await fetchProfile(accessToken) : null;
    if (!profile) {
      setBusy(false);
      setError("Profil se nepodařilo načíst. Zkus obnovit stránku.");
      return;
    }
    finishWithProfile(profile, null);
  }

  async function handleCopyKey() {
    try {
      await navigator.clipboard.writeText(issuedKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  // ---------------------------------------------------------------- už mám Traki
  const recoverCanonical = useMemo(() => normalizeRecoveryKey(recoverInput), [recoverInput]);

  async function handleRecover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("Traki se teď nemůže připojit. Zkus to za chvíli.");
      return;
    }
    if (!recoverCanonical) {
      setError("Traki klíč má 4 slova po 4 písmenech, třeba LAMA-MOST-KUFR-MRAK.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/recovery-key/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: recoverCanonical })
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as
      | { ok?: boolean; code?: string; retry_after?: number; token_hash?: string; verify_type?: "magiclink" }
      | null;
    if (!response?.ok || !payload?.ok || !payload.token_hash) {
      setBusy(false);
      if (payload?.code === "rate_limited") {
        setError(`Moc pokusů za sebou. Zkus to znovu za ${Math.ceil((payload.retry_after ?? 60) / 60)} min.`);
      } else if (payload?.code === "invalid_key") {
        setError("Tenhle Traki klíč nesedí. Zkontroluj všechna čtyři slova.");
      } else {
        setError("Obnovení se teď nepodařilo. Zkus to prosím znovu.");
      }
      return;
    }

    // jednorázový token -> session PŮVODNÍHO hráče (stejné auth user ID)
    const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: payload.token_hash,
      type: payload.verify_type ?? "magiclink"
    });
    const accessToken = verified?.session?.access_token ?? "";
    if (verifyError || !accessToken) {
      setBusy(false);
      setError("Klíč sedí, ale přihlášení se nepodařilo dokončit. Zkus to prosím znovu.");
      return;
    }
    const profile = await fetchProfile(accessToken);
    if (!profile) {
      setBusy(false);
      setError("Přihlášení proběhlo, ale profil se nenačetl. Zkus obnovit stránku.");
      return;
    }
    saveRecoveryKeyLocally(formatRecoveryKey(recoverCanonical));
    finishWithProfile(profile, null);
  }

  // ---------------------------------------------------------------- starší účet (e-mail)
  async function handleEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfo("");
    if (!supabase) {
      setError("Traki se teď nemůže připojit. Zkus to za chvíli.");
      return;
    }
    if (!email.includes("@") || password.length < 6) {
      setError("Zadej e-mail a heslo (aspoň 6 znaků).");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password })
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as
      | {
          ok?: boolean;
          code?: string;
          retry_after?: number;
          user?: { id: string; email?: string | null };
          session?: { access_token: string; refresh_token: string };
        }
      | null;
    if (!response?.ok || !payload?.ok || !payload.session) {
      setBusy(false);
      if (payload?.code === "rate_limited") {
        setError(`Moc pokusů za sebou. Zkus to znovu za ${payload.retry_after ?? 60} s.`);
      } else if (payload?.code === "email_not_confirmed") {
        setError("Nejdřív potvrď e-mail v doručené poště a pak se přihlas.");
      } else {
        setError("Přihlášení se nepodařilo.");
      }
      return;
    }
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: payload.session.access_token,
      refresh_token: payload.session.refresh_token
    });
    if (sessionError) {
      setBusy(false);
      setError("Přihlášení proběhlo, ale nepodařilo se obnovit session.");
      return;
    }
    const profile = await fetchProfile(payload.session.access_token);
    if (!profile) {
      setBusy(false);
      setError("Účet je přihlášený, ale profil hráče se nenašel.");
      return;
    }
    finishWithProfile(profile, payload.user?.email ?? email.trim());
  }

  async function handleForgotPassword() {
    setError("");
    setInfo("");
    if (!supabase || !email.includes("@")) {
      setError("Nejdřív vyplň e-mail, na který ti pošleme odkaz.");
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback`
    });
    setInfo(resetError ? "Odkaz se nepodařilo poslat. Zkus to za chvíli." : "Poslali jsme ti e-mail s odkazem na nové heslo.");
  }

  // ---------------------------------------------------------------- UI
  const shell = (children: React.ReactNode) => (
    <main className="flex min-h-screen items-center justify-center px-4 py-6">
      <section className="glass-card w-full max-w-md p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-sky">Traki na stopě tajemství</p>
        {children}
        {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}
        {info ? <p className="mt-4 text-sm text-lime">{info}</p> : null}
      </section>
    </main>
  );

  if (!supabase) {
    return shell(
      <p className="mt-4 text-sm text-mist">Traki se teď nemůže připojit k internetu. Zkus to prosím za chvíli.</p>
    );
  }

  if (screen === "start") {
    return shell(
      <>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Vítej v Traki</h1>
        <p className="mt-3 text-sm leading-6 text-mist">
          Objevuj tajemství měst, plň úkoly a sbírej body. Stačí přezdívka a avatar.
        </p>
        <div className="mt-6 space-y-3">
          <button type="button" className={primaryButton} onClick={() => setScreen("new")}>
            Začít hrát
          </button>
          <button type="button" className={secondaryButton} onClick={() => setScreen("recover")}>
            Už mám Traki
          </button>
        </div>
        <div className="mt-6 text-center">
          <button type="button" className={linkButton} onClick={() => setScreen("email")}>
            Mám starší účet
          </button>
        </div>
      </>
    );
  }

  if (screen === "new") {
    return shell(
      <form onSubmit={handleCreatePlayer}>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Jak ti máme říkat?</h1>
        <label className="mt-6 block space-y-2">
          <span className="text-sm text-mist">Přezdívka</span>
          <input
            type="text"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="např. Stopař"
            maxLength={24}
            autoComplete="off"
            className={inputClass}
          />
        </label>
        <div className="mt-4">
          <span className="text-sm text-mist">Vyber si avatara</span>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {AVATAR_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setAvatar(option)}
                aria-label={`Avatar ${option.replace("batuzek-", "")}`}
                aria-pressed={avatar === option}
                className={`relative aspect-square overflow-hidden rounded-2xl border-2 ${
                  avatar === option ? "border-lime" : "border-white/10"
                }`}
              >
                <Image src={`/avatars/batuzek/${option}.png`} alt="" fill sizes="64px" className="object-cover" />
              </button>
            ))}
          </div>
        </div>
        <button type="submit" disabled={busy} className={`${primaryButton} mt-6`}>
          {busy ? "Zakládám hráče…" : "Jdeme na to"}
        </button>
        <div className="mt-4 text-center">
          <button type="button" className={linkButton} onClick={() => setScreen("start")}>
            Zpět
          </button>
        </div>
      </form>
    );
  }

  if (screen === "key") {
    return shell(
      <>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Tohle je tvůj Traki klíč</h1>
        <p className="mt-3 text-sm leading-6 text-mist">
          Jsou to čtyři slova, která patří jen tobě. Budeš je potřebovat, když si Traki otevřeš na jiném telefonu
          nebo tabletu, nebo když se ti tenhle vymaže. Nikomu je neukazuj.
        </p>
        <div className="mt-5 rounded-2xl border border-lime/40 bg-lime/10 p-4 text-center">
          <p className="select-all text-xl font-bold tracking-[0.12em] text-white">{issuedKey}</p>
        </div>
        <button type="button" onClick={handleCopyKey} className={`${secondaryButton} mt-3`}>
          {copied ? "Zkopírováno ✓" : "Zkopírovat klíč"}
        </button>
        <p className="mt-4 text-xs leading-5 text-mist/80">
          Tip: vyfoť si obrazovku nebo si slova napiš na papír. Klíč najdeš i v profilu, dokud ho z tohoto zařízení
          nesmažeš.
        </p>
        <button type="button" onClick={() => void handleKeySaved()} disabled={busy} className={`${primaryButton} mt-6`}>
          {busy ? "Připravuji hru…" : "Mám klíč uložený, jdeme hrát"}
        </button>
      </>
    );
  }

  if (screen === "recover") {
    return shell(
      <form onSubmit={handleRecover}>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Už mám Traki</h1>
        <p className="mt-3 text-sm leading-6 text-mist">
          Napiš svůj Traki klíč – čtyři slova. Na velkých písmenech, pomlčkách ani háčcích nezáleží.
        </p>
        <input
          type="text"
          value={recoverInput}
          onChange={(event) => setRecoverInput(event.target.value)}
          placeholder="LAMA-MOST-KUFR-MRAK"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={`${inputClass} mt-5 text-center tracking-[0.1em]`}
        />
        <p className="mt-2 text-xs text-mist/80">
          {recoverCanonical ? `Rozumím: ${formatRecoveryKey(recoverCanonical)}` : "Klíč má 4 slova po 4 písmenech."}
        </p>
        <button type="submit" disabled={busy || !recoverCanonical} className={`${primaryButton} mt-5`}>
          {busy ? "Hledám tvůj profil…" : "Otevřít můj profil"}
        </button>
        <div className="mt-4 text-center">
          <button type="button" className={linkButton} onClick={() => setScreen("start")}>
            Zpět
          </button>
        </div>
      </form>
    );
  }

  return shell(
    <form onSubmit={handleEmailLogin}>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Starší účet</h1>
      <p className="mt-3 text-sm leading-6 text-mist">
        Přihlášení e-mailem je jen pro hráče založené dřív. Po přihlášení si v profilu můžeš vytvořit Traki klíč.
      </p>
      <label className="mt-5 block space-y-2">
        <span className="text-sm text-mist">E-mail</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className={inputClass} />
      </label>
      <label className="mt-4 block space-y-2">
        <span className="text-sm text-mist">Heslo</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={busy} className={`${primaryButton} mt-6`}>
        {busy ? "Přihlašuji…" : "Přihlásit se"}
      </button>
      <div className="mt-4 flex justify-between">
        <button type="button" className={linkButton} onClick={() => setScreen("start")}>
          Zpět
        </button>
        <button type="button" className={linkButton} onClick={() => void handleForgotPassword()}>
          Zapomenuté heslo
        </button>
      </div>
    </form>
  );
}
