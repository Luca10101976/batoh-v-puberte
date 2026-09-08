import test from "node:test";
import assert from "node:assert/strict";
import { fetchWithSessionRecovery, isSessionInvalidAuthError } from "./session-recovery.ts";

function harness(opts: { token?: string | null; refreshTo?: string | null; statuses: Array<number | null> }) {
  const calls: string[] = [];
  const statuses = [...opts.statuses];
  let signedOut = false;
  const auth = {
    getAccessToken: async () => opts.token === undefined ? "tok-1" : opts.token,
    refreshAccessToken: async () => { calls.push("refresh"); return opts.refreshTo === undefined ? "tok-2" : opts.refreshTo; },
    signOutLocal: async () => { signedOut = true; calls.push("signOutLocal"); }
  };
  const doFetch = async (token: string) => { calls.push(`fetch:${token}`); const s = statuses.shift(); return s === null ? null : { status: s as number }; };
  return { auth, doFetch, calls, get signedOut() { return signedOut; } };
}

test("REPRO: 401 s mrtvou session (refresh selže) → lokální odhlášení, ne tichá obecná chyba", async () => {
  const h = harness({ statuses: [401], refreshTo: null });
  const r = await fetchWithSessionRecovery(h.doFetch, h.auth);
  assert.equal(r.kind, "session_invalid");
  assert.equal(h.signedOut, true, "zařízení se musí lokálně odhlásit, aby se otevřel PlayerAuthGate");
  assert.deepEqual(h.calls, ["fetch:tok-1", "refresh", "signOutLocal"]);
});

test("401 s obnovitelnou session → refresh → opakovaný požadavek uspěje, bez odhlášení", async () => {
  const h = harness({ statuses: [401, 200] });
  const r = await fetchWithSessionRecovery(h.doFetch, h.auth);
  assert.equal(r.kind, "ok");
  assert.equal(r.kind === "ok" && r.refreshed, true);
  assert.equal(h.signedOut, false);
  assert.deepEqual(h.calls, ["fetch:tok-1", "refresh", "fetch:tok-2"]);
});

test("401 i po refreshi → odhlášení (fail-closed)", async () => {
  const h = harness({ statuses: [401, 401] });
  const r = await fetchWithSessionRecovery(h.doFetch, h.auth);
  assert.equal(r.kind, "session_invalid");
  assert.equal(h.signedOut, true);
});

test("200 / 400 / 429 / 500 = běžná odpověď bez zásahu do session", async () => {
  for (const s of [200, 400, 403, 429, 500]) {
    const h = harness({ statuses: [s] });
    const r = await fetchWithSessionRecovery(h.doFetch, h.auth);
    assert.equal(r.kind, "ok"); assert.equal(r.kind === "ok" && r.response.status, s); assert.equal(h.signedOut, false);
  }
});

test("bez tokenu = no_session; síťová chyba = network_error (bez odhlášení – offline-first)", async () => {
  assert.equal((await fetchWithSessionRecovery(harness({ token: null, statuses: [] }).doFetch, harness({ token: null, statuses: [] }).auth)).kind, "no_session");
  const h = harness({ statuses: [null] });
  assert.equal((await fetchWithSessionRecovery(h.doFetch, h.auth)).kind, "network_error");
  assert.equal(h.signedOut, false);
});

test("isSessionInvalidAuthError: 401/403/session_not_found ano; síťové a 5xx chyby ne", () => {
  assert.equal(isSessionInvalidAuthError({ status: 401, message: "invalid JWT" }), true);
  assert.equal(isSessionInvalidAuthError({ status: 403, message: "session_not_found" }), true);
  assert.equal(isSessionInvalidAuthError({ name: "AuthSessionMissingError", message: "Auth session missing!" }), true);
  assert.equal(isSessionInvalidAuthError({ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }), false);
  assert.equal(isSessionInvalidAuthError({ status: 503, message: "upstream" }), false);
  assert.equal(isSessionInvalidAuthError(null), false);
});
