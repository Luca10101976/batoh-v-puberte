// Obnova přihlášení hráče při neplatné session (R17 hotfix).
//
// Příčina chyby „Ověření odpovědi se nepodařilo“: zařízení má lokálně uložený JWT,
// který ještě nevypršel, ale server session zneplatnil (např. dřívější globální
// odhlášení z jiného zařízení). supabase-js pak refresh nezkouší, API vrátí 401
// a hráč nemá cestu k opětovnému přihlášení.
//
// Tento modul je čistý (bez závislostí), aby šel testovat:
//   fetchWithSessionRecovery: 401 → refresh session → zopakovat požadavek →
//   když ani to nepomůže, lokálně odhlásit (otevře se PlayerAuthGate → „Už mám Traki“).

export type RecoveryAuth = {
  getAccessToken: () => Promise<string | null>;
  /** Vrátí nový access token, nebo null, když refresh selže (session je mrtvá). */
  refreshAccessToken: () => Promise<string | null>;
  /** Lokální odhlášení tohoto zařízení (scope "local"), ostatní zařízení zůstávají. */
  signOutLocal: () => Promise<void>;
};

export type RecoveryResult<T> =
  | { kind: "ok"; response: T; refreshed: boolean }
  | { kind: "no_session" }
  | { kind: "network_error" }
  | { kind: "session_invalid" };

export async function fetchWithSessionRecovery<T extends { status: number }>(
  doFetch: (accessToken: string) => Promise<T | null>,
  auth: RecoveryAuth
): Promise<RecoveryResult<T>> {
  const token = await auth.getAccessToken();
  if (!token) {
    return { kind: "no_session" };
  }

  const first = await doFetch(token);
  if (first === null) {
    return { kind: "network_error" };
  }
  if (first.status !== 401) {
    return { kind: "ok", response: first, refreshed: false };
  }

  const refreshedToken = await auth.refreshAccessToken().catch(() => null);
  if (refreshedToken) {
    const second = await doFetch(refreshedToken);
    if (second === null) {
      return { kind: "network_error" };
    }
    if (second.status !== 401) {
      return { kind: "ok", response: second, refreshed: true };
    }
  }

  await auth.signOutLocal().catch(() => undefined);
  return { kind: "session_invalid" };
}

/**
 * Rozliší „server session zamítl“ (401/403, session_not_found, chybějící session)
 * od přechodné síťové chyby, kvůli které se hráč NESMÍ odhlásit (offline-first).
 */
export function isSessionInvalidAuthError(error: { name?: string; status?: number; message?: string } | null | undefined) {
  if (!error) {
    return false;
  }
  if (error.name === "AuthRetryableFetchError") {
    return false;
  }
  if (typeof error.status === "number") {
    if (error.status === 401 || error.status === 403) {
      return true;
    }
    if (error.status === 0 || error.status >= 500) {
      return false;
    }
  }
  return /session|jwt|token|missing/i.test(error.message ?? "") || error.name === "AuthSessionMissingError";
}
