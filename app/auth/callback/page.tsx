"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type VerifyType = "signup" | "recovery" | "invite" | "magiclink" | "email_change";

const ALLOWED_VERIFY_TYPES = new Set<VerifyType>([
  "signup",
  "recovery",
  "invite",
  "magiclink",
  "email_change"
]);

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Potvrzuju účet…");
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    async function run() {
      if (!supabase) {
        setMessage("Chybí konfigurace přihlášení. Otevři aplikaci znovu.");
        return;
      }

      try {
        const url = new URL(window.location.href);
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
        const hashError = hashParams.get("error");
        const hashErrorDescription = hashParams.get("error_description");
        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash") || hashParams.get("token_hash");
        const type = url.searchParams.get("type") || hashParams.get("type");

        if (hashError) {
          const normalizedDescription = (hashErrorDescription || "").toLowerCase();
          if (normalizedDescription.includes("otp_expired")) {
            setMessage("Potvrzovací odkaz vypršel. Požádej prosím o nový.");
          } else {
            setMessage("Potvrzení se nepodařilo. Zkus otevřít nový odkaz z e-mailu.");
          }
          router.replace("/");
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            throw error;
          }
        } else if (tokenHash && type && ALLOWED_VERIFY_TYPES.has(type as VerifyType)) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as VerifyType
          });
          if (error) {
            throw error;
          }
        }

        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (session?.user) {
          setMessage("Účet je potvrzený. Přesměrovávám na přihlášení dítěte…");
          router.replace("/?auth=confirmed");
          return;
        }

        setMessage("Potvrzení proběhlo. Přihlas se prosím rodičovským e-mailem a heslem.");
        router.replace("/?auth=confirmed");
      } catch (error: any) {
        const msg = String(error?.message || "").toLowerCase();
        if (msg.includes("expired")) {
          setMessage("Potvrzovací odkaz vypršel. Požádej prosím o nový.");
        } else {
          setMessage("Potvrzení se nepodařilo dokončit. Zkus otevřít nový odkaz z e-mailu.");
        }
      }
    }

    void run();
  }, [router, supabase]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-6">
      <section className="glass-card w-full max-w-md p-6">
        <h1 className="text-2xl font-bold">Potvrzení účtu</h1>
        <p className="mt-3 text-sm text-mist">{message}</p>
      </section>
    </main>
  );
}
