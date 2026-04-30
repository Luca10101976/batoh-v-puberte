"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { ChildPinGate } from "@/components/child-pin-gate";
import { ParentAuthGate } from "@/components/parent-auth-gate";
import { useAppState } from "@/components/app-state-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function AppFrame({ children, appVersion }: { children: ReactNode; appVersion: string }) {
  const { hydrated, pinUnlocked, state } = useAppState();
  const pathname = usePathname();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasCloudSession, setHasCloudSession] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [refreshingUpdate, setRefreshingUpdate] = useState(false);
  const [autoRefreshScheduled, setAutoRefreshScheduled] = useState(false);
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  const hasRegistration = state.registrationCompleted;
  const isAdminRoute = pathname?.startsWith("/admin") || pathname?.startsWith("/mozek");
  const isPublicBrowseRoute =
    pathname === "/" ||
    pathname?.startsWith("/locations") ||
    pathname?.startsWith("/auth/callback") ||
    pathname === "/offline";
  const requiresPlayerAuth = !isAdminRoute && !isPublicBrowseRoute;
  const showPlayerNav = hasRegistration && !isPublicBrowseRoute;
  const needsManualRefresh =
    isAdminRoute ||
    pathname?.startsWith("/play") ||
    pathname?.startsWith("/paper-score") ||
    pathname?.startsWith("/profile");

  const refreshToLatestVersion = useCallback(() => {
    if (refreshingUpdate || !("serviceWorker" in navigator)) {
      return;
    }

    setRefreshingUpdate(true);
    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        window.setTimeout(() => {
          window.location.reload();
        }, 150);
        return;
      }

      void registration?.update().catch(() => undefined);
      window.location.reload();
    });
  }, [refreshingUpdate]);

  const scheduleAutoRefresh = useCallback(() => {
    if (autoRefreshScheduled || refreshingUpdate || needsManualRefresh) {
      return;
    }

    setAutoRefreshScheduled(true);
    window.setTimeout(() => {
      setUpdateReady(true);
      refreshToLatestVersion();
    }, 250);
  }, [autoRefreshScheduled, refreshingUpdate, needsManualRefresh, refreshToLatestVersion]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    let cancelled = false;
    let pollTimer: number | null = null;
    let focusHandler: (() => void) | null = null;
    let visibilityHandler: (() => void) | null = null;
    let pageShowHandler: ((event: PageTransitionEvent) => void) | null = null;

    const handleControllerChange = () => {
      if (cancelled) {
        return;
      }
      setUpdateReady(true);
      if (!needsManualRefresh) {
        scheduleAutoRefresh();
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    void navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (cancelled) {
          return;
        }

        const probeForUpdate = () => {
          void registration.update().catch(() => undefined);
        };

        const revealIfWaiting = () => {
          if (registration.waiting) {
            setUpdateReady(true);
            if (!needsManualRefresh) {
              scheduleAutoRefresh();
            }
          }
        };

        revealIfWaiting();
        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) {
            return;
          }

          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
              if (!needsManualRefresh) {
                scheduleAutoRefresh();
              }
            }
          });
        });

        visibilityHandler = () => {
          if (document.visibilityState === "visible") {
            probeForUpdate();
          }
        };

        focusHandler = probeForUpdate;
        pageShowHandler = (event) => {
          if (event.persisted) {
            probeForUpdate();
          }
        };
        window.addEventListener("focus", focusHandler);
        window.addEventListener("pageshow", pageShowHandler);
        document.addEventListener("visibilitychange", visibilityHandler);
        pollTimer = window.setInterval(probeForUpdate, 15_000);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      if (focusHandler) {
        window.removeEventListener("focus", focusHandler);
      }
      if (pageShowHandler) {
        window.removeEventListener("pageshow", pageShowHandler);
      }
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
    };
  }, [needsManualRefresh, scheduleAutoRefresh]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;
    let pageShowHandler: ((event: PageTransitionEvent) => void) | null = null;

    const checkVersion = async () => {
      try {
        const response = await fetch("/api/app-version", {
          method: "GET",
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache"
          }
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { version?: string };
        if (!cancelled && payload.version && payload.version !== appVersion) {
          setUpdateReady(true);
          if (!needsManualRefresh) {
            scheduleAutoRefresh();
          }
        }
      } catch {
        // Ignore version check errors and keep the current UI usable.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkVersion();
      }
    };

    pageShowHandler = (event) => {
      if (event.persisted) {
        void checkVersion();
      }
    };

    void checkVersion();
    window.addEventListener("focus", checkVersion);
    window.addEventListener("pageshow", pageShowHandler);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    pollTimer = window.setInterval(() => {
      void checkVersion();
    }, 15_000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", checkVersion);
      if (pageShowHandler) {
        window.removeEventListener("pageshow", pageShowHandler);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
    };
  }, [appVersion, needsManualRefresh, scheduleAutoRefresh]);

  const updateBanner = updateReady && needsManualRefresh ? (
    <div className="mb-4 rounded-[24px] border border-lime/30 bg-lime/12 px-4 py-3 text-sm text-white">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="leading-6 text-white/90">
          Je připravená nová verze aplikace. Obnovte stránku, ať vidíte poslední změny.
        </p>
        <button
          onClick={refreshToLatestVersion}
          disabled={refreshingUpdate}
          className="rounded-[18px] bg-lime px-4 py-2 text-sm font-semibold text-night disabled:cursor-not-allowed disabled:opacity-70"
        >
          {refreshingUpdate ? "Obnovuji…" : "Obnovit aplikaci"}
        </button>
      </div>
    </div>
  ) : null;

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!supabase) {
      setSessionChecked(true);
      setHasCloudSession(true);
      return;
    }

    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) {
        return;
      }
      setHasCloudSession(Boolean(data.session?.user));
      setSessionChecked(true);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) {
        return;
      }

      if (session?.user) {
        setHasCloudSession(true);
        setSessionChecked(true);
        return;
      }

      // Ignore transient null-session states; only hard-switch to signed-out UI on explicit sign-out.
      if (event === "SIGNED_OUT") {
        setHasCloudSession(false);
        setSessionChecked(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [hydrated, supabase]);

  if (isAdminRoute) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        {updateBanner}
        {children}
      </div>
    );
  }

  if (!hydrated) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
        <section className="glass-card w-full p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-sky">Batoh v pubertě</p>
          <h1 className="mt-3 text-2xl font-bold">Načítám hru…</h1>
          <p className="mt-2 text-sm text-mist">Kontroluji přihlášení a připravuji výpravu.</p>
        </section>
      </main>
    );
  }

  // Fast local startup: if we already have local registration,
  // don't block rendering on session check network latency.
  if (!requiresPlayerAuth && !sessionChecked && hasRegistration) {
    if (state.hasChildPin && !pinUnlocked) {
      return (
        <div className="app-shell">
          <div className="mx-auto w-full max-w-4xl">
            {updateBanner}
            {children}
          </div>
          {showPlayerNav ? <BottomNav /> : null}
        </div>
      );
    }

    return (
      <div className="app-shell">
        <div className="mx-auto w-full max-w-4xl">
          {updateBanner}
          {children}
        </div>
        {showPlayerNav ? <BottomNav /> : null}
      </div>
    );
  }

  if (!sessionChecked && hasRegistration) {
    if (state.hasChildPin && !pinUnlocked) {
      return <ChildPinGate />;
    }

    return (
      <div className="app-shell">
        <div className="mx-auto w-full max-w-4xl">
          {updateBanner}
          {children}
        </div>
        {showPlayerNav ? <BottomNav /> : null}
      </div>
    );
  }

  if (!requiresPlayerAuth) {
    return (
      <div className="app-shell">
        <div className="mx-auto w-full max-w-4xl">
          {updateBanner}
          {children}
        </div>
        {showPlayerNav ? <BottomNav /> : null}
      </div>
    );
  }

  // Do not block auth screen behind session loading spinner.
  // ParentAuthGate will resolve existing session/profile in background.
  if (!hasRegistration) {
    return <ParentAuthGate />;
  }

  if (sessionChecked && !hasCloudSession) {
    return <ParentAuthGate />;
  }

  if (state.hasChildPin && !pinUnlocked) {
    return <ChildPinGate />;
  }

  return (
    <div className="app-shell">
      <div className="mx-auto w-full max-w-4xl">
        {updateBanner}
        {children}
      </div>
      {showPlayerNav ? <BottomNav /> : null}
    </div>
  );
}
