"use client";

import { type ReactNode } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { ParentAuthGate } from "@/components/parent-auth-gate";
import { useAppState } from "@/components/app-state-provider";

export function AppFrame({ children }: { children: ReactNode }) {
  const { hydrated, state } = useAppState();
  const hasRegistration = state.registrationCompleted && state.parentEmail.trim().length > 3;

  if (!hydrated) {
    return <div className="min-h-screen" />;
  }

  if (!hasRegistration) {
    return <ParentAuthGate />;
  }

  return (
    <div className="app-shell">
      {children}
      <BottomNav />
    </div>
  );
}
