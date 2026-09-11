"use client";

import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { type AvatarConfig, useAppState } from "@/components/app-state-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { NICKNAME_HINT, NICKNAME_LENGTH_MESSAGE, normalizeNickname, validateNickname } from "@/lib/nickname";
import { formatRecoveryKey, normalizeRecoveryKey } from "@/lib/recovery-key";
import { AVATAR_IDS, DEFAULT_AVATAR_ID, avatarSrc } from "@/lib/avatars";

// Přihlášení hráče (R17):
//   NOVÝ HRÁČ    -> přezdívka + avatar -> Supabase anonymní účet -> profil -> Traki klíč
//   UŽ MÁM TRAKI -> Traki klíč -> /api/recovery-key/redeem -> verifyOtp -> stejný účet
//
// R42: e-mail ani heslo v Traki neexistují. Hráčský účet je anonymní účet Supabase
// a jediná obnova je Traki klíč. Žádné "starší účty" už nejsou.
//
// R44: brána se ukazuje až u akce, která hráče doopravdy potřebuje (spuštění hry,
// profil, žebříček). Kam návštěvník mířil, si pamatuje a po založení nebo obnovení
// hráče ho tam vrátí – nikdy ho nevysype na domovskou stránku.
//
// Traki klíč = 4 česká slova (LAMA-MOST-KUFR-MRAK). Není to friend code.
// Plaintext klíče drží jen toto zařízení (localStorage), server má pouze hash.

export const RECOVERY_KEY_LOCAL_STORAGE_KEY = "pan-batoh-recovery-key";

type Screen = "start" | "new" | "key" | "recover";

type ChildProfileRow = {
  id?: string | null;
  child_name: string;
  profile_code: string;
  player_code?: string | null;
  avatar?: string | null;
  avatar_config?: AvatarConfig | null;
};


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
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR_ID);

  const [issuedKey, setIssuedKey] = useState("");
  const [copied, setCopied] = useState(false);
  // R44: klíč je jediná cesta zpátky k hráči, takže odsud se nejde dál jedním
  // klepnutím – hráč musí potvrdit, že si ho opravdu uložil.
  const [keySaved, setKeySaved] = useState(false);
  // R44: popisek průběhu zakládání – ať je vidět, že se pracuje, ne že to zamrzlo.
  const [creationStage, setCreationStage] = useState("Zakládám hráče…");

  // R44: klíč rozdělíme na dvojice slov, aby se na úzkém telefonu nezalomil
  // náhodně uprostřed (například 3+1).
  const keyLines = useMemo(() => {
    const words = issuedKey.split("-").filter(Boolean);
    if (words.length !== 4) {
      return issuedKey ? [issuedKey] : [];
    }
    return [`${words[0]}-${words[1]}`, `${words[2]}-${words[3]}`];
  }, [issuedKey]);

  const [recoverInput, setRecoverInput] = useState("");

  const registrationAppliedRef = useRef(false);

  // R44: kam návštěvník mířil. Bránu vyvolala buď přímo ta stránka (pak je to
  // aktuální cesta), nebo tlačítko, které si cíl předalo v ?next=. Bereme jen
  // vnitřní cesty, aby se přes parametr nedalo poslat nikam ven.
  const intendedDestination = useMemo(() => {
    const isInternal = (value: string) => value.startsWith("/") && !value.startsWith("//");

    const requested = searchParams?.get("next") ?? "";
    if (isInternal(requested)) {
      return requested;
    }
    if (pathname && pathname !== "/" && isInternal(pathname)) {
      // Parametry té stránky patří k záměru (třeba ?mode=solo u hry), jen si
      // s sebou nebereme vlastní ?next=.
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("next");
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    }
    return "/";
  }, [pathname, searchParams]);

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
    (profile: ChildProfileRow) => {
      if (registrationAppliedRef.current) {
        return;
      }
      registrationAppliedRef.current = true;
      completeRegistration({
        name: profile.child_name,
        playerCode: profile.player_code || profile.profile_code,
        profileCode: profile.profile_code,
        profileRowId: profile.id ?? null,
        avatar: profile.avatar ?? undefined,
        avatarConfig: profile.avatar_config ?? undefined
      });
      // R44: vrátíme hráče tam, kam mířil, než po něm Traki chtělo identitu.
      router.replace(intendedDestination);
    },
    [completeRegistration, intendedDestination, router]
  );

  // ---------------------------------------------------------------- nový hráč
  async function handleCreatePlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("Traki se teď nemůže připojit. Zkus to za chvíli.");
      return;
    }
    // R33: stejné pravidlo jako u pozdější změny přezdívky.
    const trimmed = normalizeNickname(nickname);
    if (!validateNickname(trimmed).ok) {
      setError(NICKNAME_LENGTH_MESSAGE);
      return;
    }
    setBusy(true);
    setCreationStage("Zakládám hráče…");

    // 1) stabilní hráčský účet bez e-mailu a hesla
    const { data: anon, error: anonError } = await supabase.auth.signInAnonymously();
    const accessToken = anon?.session?.access_token ?? "";
    if (anonError || !accessToken) {
      setBusy(false);
      setCreationStage("Zakládám hráče…");
      setError("Nepodařilo se založit hráče. Zkus to prosím znovu.");
      return;
    }

    // 2) profil hráče (stejný model jako dosud)
    setCreationStage("Ukládám přezdívku a avatara…");
    const profileResponse = await fetch("/api/child-profile/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ child_name: trimmed, avatar })
    }).catch(() => null);
    if (!profileResponse?.ok) {
      const profilePayload = (await profileResponse?.json().catch(() => null)) as
        | { code?: string; message?: string }
        | null;
      setBusy(false);
      // R33: obsazená přezdívka není technická chyba – hráč má vědět, že si má vybrat jinou.
      setError(
        profilePayload?.code === "nickname_taken" || profilePayload?.code === "invalid_child_name"
          ? profilePayload.message || "Tahle přezdívka už je obsazená. Zkus jinou."
          : "Profil se nepodařilo uložit. Zkus to prosím znovu."
      );
      return;
    }

    // 3) Traki klíč (generuje výhradně server)
    setCreationStage("Připravuji tvůj Traki klíč…");
    const keyResponse = await fetch("/api/recovery-key/create", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` }
    }).catch(() => null);
    const keyPayload = (await keyResponse?.json().catch(() => null)) as { ok?: boolean; recovery_key?: string } | null;
    if (!keyResponse?.ok || !keyPayload?.ok || !keyPayload.recovery_key) {
      setBusy(false);
      setCreationStage("Zakládám hráče…");
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
    finishWithProfile(profile);
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
    finishWithProfile(profile);
  }

  // ---------------------------------------------------------------- UI
  //
  // R44: brána nesmí návštěvníka uvěznit. Dokud si zakládá hráče, cesta ven
  // vede zpátky do katalogu; na obrazovce s klíčem ji schováme, protože v tu
  // chvíli už hráč existuje a odejít bez uložení klíče by ho stálo profil.
  const shell = (children: React.ReactNode, options?: { allowLeave?: boolean }) => (
    <main className="flex min-h-screen items-center justify-center px-4 py-6">
      <section className="glass-card w-full max-w-md p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-sky">Traki na stopě tajemství</p>
        {children}
        {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}
        {info ? <p className="mt-4 text-sm text-lime">{info}</p> : null}
        {options?.allowLeave === false ? null : (
          <div className="mt-6 border-t border-white/10 pt-4 text-center">
            <Link href="/" className={linkButton}>
              Zpět na hry
            </Link>
          </div>
        )}
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
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Na tohle potřebuješ hráče</h1>
        <p className="mt-3 text-sm leading-6 text-mist">
          Pátrej po městě, řeš úkoly a sbírej body. Stačí přezdívka a avatar – žádný e-mail ani heslo.
        </p>
        <div className="mt-6 space-y-3">
          <button type="button" className={primaryButton} onClick={() => setScreen("new")}>
            Vytvořit hráče
          </button>
          <button type="button" className={secondaryButton} onClick={() => setScreen("recover")}>
            Mám Traki klíč
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
          <span className="block text-xs text-mist">2–24 znaků. {NICKNAME_HINT}</span>
        </label>
        <div className="mt-4">
          <span className="text-sm text-mist">Vyber si avatara</span>
          <div className="mt-2 grid grid-cols-4 gap-2.5 sm:grid-cols-6">
            {AVATAR_IDS.map((option, index) => (
              <button
                key={option}
                type="button"
                onClick={() => setAvatar(option)}
                aria-label={`Avatar ${index + 1}`}
                aria-pressed={avatar === option}
                className={`relative aspect-square overflow-hidden rounded-2xl border-2 bg-white/5 ${
                  avatar === option ? "border-lime" : "border-white/10"
                }`}
              >
                <Image src={avatarSrc(option)} alt="" fill sizes="64px" className="object-contain p-1" />
              </button>
            ))}
          </div>
        </div>
        {/* R44: zakládání hráče trvá několik vteřin (anonymní účet → profil → klíč).
            Tlačítko je po celou dobu zablokované, takže akci nejde spustit dvakrát,
            a popisek říká, co se zrovna děje. */}
        <button type="submit" disabled={busy} className={`${primaryButton} mt-6`} aria-busy={busy}>
          {busy ? creationStage : "Jdeme na to"}
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
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Tenhle klíč si opravdu ulož.</h1>
        <p className="mt-3 text-sm leading-6 text-mist">
          Je to jediný způsob, jak se ke svému hráči dostaneš na jiném zařízení nebo po smazání dat. Bez klíče ti
          profil neumíme obnovit. Nikomu ho neukazuj.
        </p>
        {/* R44: klíč se nesmí zalomit náhodně (třeba 3+1). Dvě slova na řádek
            vždycky, na širší obrazovce se vejdou všechna čtyři vedle sebe. */}
        <div className="mt-5 rounded-2xl border border-lime/40 bg-lime/10 p-4 text-center">
          <p className="select-all text-lg font-bold leading-8 tracking-[0.12em] text-white sm:text-xl">
            {keyLines.map((lineWords, index) => (
              <span key={lineWords} className="block sm:inline">
                {lineWords}
                {index === 0 && keyLines.length > 1 ? <span className="hidden sm:inline">-</span> : null}
              </span>
            ))}
          </p>
        </div>
        {/* Rada, co s klíčem udělat, stojí před kopírováním do schránky – ze schránky
            se na telefonu snadno ztratí a dítě neví, kam ji vložit. */}
        <p className="mt-4 text-sm leading-6 text-white/80">
          Vyfoť si obrazovku nebo si slova napiš na papír. Klíč najdeš i v profilu, dokud ho z tohoto zařízení
          nesmažeš.
        </p>
        <button type="button" onClick={handleCopyKey} className={`${secondaryButton} mt-3`}>
          {copied ? "Zkopírováno ✓" : "Zkopírovat klíč"}
        </button>
        <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-white">
          <input
            type="checkbox"
            checked={keySaved}
            onChange={(event) => setKeySaved(event.target.checked)}
            className="mt-1 h-5 w-5 flex-none accent-lime"
          />
          <span>Mám Traki klíč uložený.</span>
        </label>
        <button
          type="button"
          onClick={() => void handleKeySaved()}
          disabled={busy || !keySaved}
          className={`${primaryButton} mt-4`}
        >
          {busy ? "Připravuji hru…" : "Jdeme hrát"}
        </button>
      </>,
      { allowLeave: false }
    );
  }

  return shell(
      <form onSubmit={handleRecover}>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Mám Traki klíč</h1>
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
