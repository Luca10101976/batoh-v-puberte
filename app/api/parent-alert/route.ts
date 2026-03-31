import { NextResponse } from "next/server";

type ParentAlertPayload = {
  parentEmail?: string;
  childName?: string;
  childAge?: number;
  event?: "registration";
};

const RESEND_API_URL = "https://api.resend.com/emails";

export async function POST(request: Request) {
  const body = (await request.json()) as ParentAlertPayload;
  const parentEmail = body.parentEmail?.trim();
  const childName = body.childName?.trim();
  const childAge = body.childAge;
  const event = body.event;

  if (!parentEmail || !childName || !event) {
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

  const subject =
    event === "registration"
      ? `Batoh v pubertě: registrace hráče ${childName}`
      : "Batoh v pubertě: bezpečnostní upozornění";

  const text = [
    "Dobrý den,",
    "",
    `${childName} (${childAge ?? "?"} let) se právě zaregistroval/a do aplikace Batoh v pubertě.`,
    "Tohle je bezpečnostní informační e-mail pro rodiče.",
    "",
    "Tým Batoh v pubertě"
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <p>Dobrý den,</p>
      <p><strong>${childName}</strong> (${childAge ?? "?"} let) se právě zaregistroval/a do aplikace <strong>Batoh v pubertě</strong>.</p>
      <p>Tohle je bezpečnostní informační e-mail pro rodiče.</p>
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
