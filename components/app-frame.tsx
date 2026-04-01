"use client";

import { useEffect, type ReactNode } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { ChildPinGate } from "@/components/child-pin-gate";
import { ParentAuthGate } from "@/components/parent-auth-gate";
import { useAppState } from "@/components/app-state-provider";

export function AppFrame({ children }: { children: ReactNode }) {
  const { hydrated, pinUnlocked, state } = useAppState();
  const hasRegistration = state.registrationCompleted;

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  if (!hydrated) {
    return <div className="min-h-screen" />;
  }

  if (!hasRegistration) {
    return <ParentAuthGate />;
  }

  if (state.childPinHash && !pinUnlocked) {
    return <ChildPinGate />;
  }

  return (
    <div className="app-shell">
      {children}
      <BottomNav />
    </div>
  );
}
