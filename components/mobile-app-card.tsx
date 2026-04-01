"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/components/app-state-provider";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export function MobileAppCard() {
  const { state } = useAppState();
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installHintOpen, setInstallHintOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "enabled" | "blocked" | "unsupported">("idle");
  const [pushMessage, setPushMessage] = useState("");

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

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setPushStatus("blocked");
      return;
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (subscription) {
          setPushStatus("enabled");
        }
      })
      .catch(() => undefined);
  }, []);

  async function handleEnableNotifications() {
    setPushMessage("");

    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported");
      setPushMessage("Tenhle telefon nepodporuje web push notifikace.");
      return;
    }

    if (!state.profileCode) {
      setPushMessage("Nejdřív dokonči registraci profilu.");
      return;
    }

    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();

    if (permission !== "granted") {
      setPushStatus("blocked");
      setPushMessage("Notifikace nejsou povolené.");
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!publicKey) {
      setPushMessage("Chybí VAPID veřejný klíč.");
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileCode: state.profileCode,
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent
      })
    }).catch(() => null);

    if (!response?.ok) {
      setPushMessage("Nepodařilo se uložit notifikace.");
      return;
    }

    setPushStatus("enabled");
    setPushMessage("Notifikace jsou zapnuté.");
  }

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
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleEnableNotifications}
          disabled={pushStatus === "enabled"}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold"
        >
          {pushStatus === "enabled" ? "Notifikace zapnuté" : "Zapnout notifikace"}
        </button>
        {pushStatus === "blocked" ? <span className="text-xs text-coral">Blokováno v telefonu</span> : null}
      </div>
      {pushMessage ? <p className="mt-2 text-xs text-mist">{pushMessage}</p> : null}
    </section>
  );
}
