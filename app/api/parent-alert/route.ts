import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ParentAlertPayload = {
  parentEmail?: string;
  profileCode?: string;
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

  const body = (await request.json()) as ParentAlertPayload;
  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

  let parentEmail = "";
  if (accessToken) {
    const {
      data: { user },
      error: authError
    } = await authClient.auth.getUser(accessToken);

    if (!authError && user?.email) {
      parentEmail = user.email.trim();
    }
  }

  if (!parentEmail) {
    const fallbackEmail = body.parentEmail?.trim() ?? "";
    const profileCode = body.profileCode?.trim() ?? "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey || !fallbackEmail || !profileCode) {
      return NextResponse.json({ ok: false, message: "Neautorizovaný požadavek." }, { status: 401 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: profileRow, error: profileError } = await adminClient
      .from("child_profiles")
      .select("parent_user_id")
      .eq("profile_code", profileCode)
      .limit(1)
      .maybeSingle<{ parent_user_id: string }>();

    if (profileError || !profileRow?.parent_user_id) {
      return NextResponse.json({ ok: false, message: "Nelze ověřit profil dítěte." }, { status: 403 });
    }

    const { data: parentUser, error: parentUserError } = await adminClient.auth.admin.getUserById(
      profileRow.parent_user_id
    );

    const parentUserEmail = parentUser?.user?.email?.trim().toLowerCase() ?? "";
    if (parentUserError || !parentUserEmail || parentUserEmail !== fallbackEmail.toLowerCase()) {
      return NextResponse.json({ ok: false, message: "E-mail neodpovídá registrovanému rodiči." }, { status: 403 });
    }

    parentEmail = fallbackEmail;
  }

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
