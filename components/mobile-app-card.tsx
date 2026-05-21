"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function MobileAppCard() {
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installHintOpen, setInstallHintOpen] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);

    if (isStandalone) {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);
  async function handleInstallClick() {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);

    if (isStandalone) {
      return;
    }

    if (deferredInstallPrompt) {
      await deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice.catch(() => undefined);
      setDeferredInstallPrompt(null);
      return;
    }

    setInstallHintOpen(true);
  }

  return (
    <section className="glass-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-lime">Aplikace do telefonu</p>
          <h2 className="mt-2 text-xl font-semibold">Mít hru na ploše</h2>
        </div>
        <button onClick={handleInstallClick} className="rounded-full bg-lime px-4 py-2 text-sm font-semibold text-night">
          Stáhnout
        </button>
      </div>
      <p className="mt-3 text-sm text-mist">
        Android: instalace se spustí hned. iPhone: otevři Safari a dej Sdílet → Přidat na plochu.
      </p>
      {installHintOpen ? (
        <div className="mt-3 rounded-2xl bg-white/5 p-3 text-sm text-mist">
          Postup pro iPhone: otevři stránku v Safari, klepni na Sdílet a vyber Přidat na plochu.
        </div>
      ) : null}
    </section>
  );
}
