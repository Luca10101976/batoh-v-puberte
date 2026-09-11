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
      {/* R44: instalace je jednorázová věc, na profilu proto zůstává sbalená. */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-white">Traki v telefonu</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-lime group-open:hidden">Zobrazit</span>
          <span className="hidden shrink-0 text-sm font-semibold text-mist group-open:block">Skrýt</span>
        </summary>

        <div className="mt-4">
          <button
            onClick={handleInstallClick}
            className="w-full rounded-[20px] bg-lime px-4 py-3 text-sm font-semibold text-night"
          >
            Stáhnout
          </button>
          <p className="mt-3 text-sm leading-6 text-mist">
            Android: instalace se spustí hned. iPhone: otevři Safari a dej Sdílet → Přidat na plochu.
          </p>
          {installHintOpen ? (
            <div className="mt-3 rounded-2xl bg-white/5 p-3 text-sm text-mist">
              Postup pro iPhone: otevři stránku v Safari, klepni na Sdílet a vyber Přidat na plochu.
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}
