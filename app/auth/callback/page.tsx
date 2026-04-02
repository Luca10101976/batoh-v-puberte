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
        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (tokenHash && type && ALLOWED_VERIFY_TYPES.has(type as VerifyType)) {
          await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as VerifyType
          });
        }

        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (session?.user) {
          setMessage("Účet je potvrzený. Přesměrovávám…");
          router.replace("/profile");
          return;
        }

        setMessage("Potvrzení proběhlo, přihlas se prosím rodičovským e-mailem a heslem.");
        router.replace("/");
      } catch {
        setMessage("Potvrzení se nepodařilo dokončit. Zkus otevřít odkaz znovu.");
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
