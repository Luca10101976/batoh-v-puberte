import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ParentAlertPayload = {
  childName?: string;
  childAge?: number;
  event?: "registration" | "checkin";
};

const RESEND_API_URL = "https://api.resend.com/emails";

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, message: "Supabase auth není nastavené." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ ok: false, message: "Neautorizovaný požadavek." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const {
    data: { user },
    error: authError
  } = await authClient.auth.getUser(accessToken);

  if (authError || !user?.email) {
    return NextResponse.json({ ok: false, message: "Neautorizovaný požadavek." }, { status: 401 });
  }

  const body = (await request.json()) as ParentAlertPayload;
  const parentEmail = user.email.trim();
  const childName = body.childName?.trim();
  const childAge = body.childAge;
  const event = body.event ?? "registration";

  if (!childName) {
    return NextResponse.json({ ok: false, message: "Chybí povinná data." }, { status: 400 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.PARENT_ALERT_FROM_EMAIL ?? "onboarding@resend.dev";

  if (!resendApiKey) {
    return NextResponse.json(
      { ok: false, message: "E-mail služba není nakonfigurovaná (RESEND_API_KEY)." },
      { status: 503 }
    );
  }

  const isRegistration = event === "registration";
  const subject = isRegistration
    ? `Batoh v pubertě: registrace hráče ${childName}`
    : `Batoh v pubertě: bezpečnostní check-in (${childName})`;
  const now = new Date().toLocaleString("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  const text = [
    "Dobrý den,",
    "",
    isRegistration
      ? `${childName} (${childAge ?? "?"} let) se právě zaregistroval/a do aplikace Batoh v pubertě.`
      : `${childName} (${childAge ?? "?"} let) právě spustil/a hru v aplikaci Batoh v pubertě.`,
    `Čas události: ${now}`,
    "Tohle je informační e-mail pro rodiče.",
    "",
    "Tým Batoh v pubertě"
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <p>Dobrý den,</p>
	      <p><strong>${childName}</strong> (${childAge ?? "?"} let) ${
          isRegistration ? "se právě zaregistroval/a" : "právě spustil/a hru"
        } do aplikace <strong>Batoh v pubertě</strong>.</p>
	      <p><strong>Čas události:</strong> ${now}</p>
	      <p>Tohle je informační e-mail pro rodiče.</p>
      <p style="margin-top: 18px;">Tým Batoh v pubertě</p>
    </div>
  `;

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [parentEmail],
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { ok: false, message: `Odeslání e-mailu selhalo: ${errorText}` },
      { status: response.status }
    );
  }

  return NextResponse.json({ ok: true });
}
