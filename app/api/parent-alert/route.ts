import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkInMemoryRateLimit, checkRateLimit, getRequestIpAddress } from "@/lib/rate-limit";
import { locations } from "@/lib/mock-data";

type ParentAlertPayload = {
  profileCode?: string;
  childName?: string;
  childAge?: number;
  locationId?: string;
  event?: "registration" | "checkin";
};

const RESEND_API_URL = "https://api.resend.com/emails";

type ParentAlertRateLimit = {
  action: string;
  limit: number;
  windowMinutes: number;
  blockMinutes: number;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizePlainText(value: string) {
  return value.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, message: "Supabase auth není nastavené." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as ParentAlertPayload | null;
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
  const authUserId = user?.id ?? "";

  const parentEmail = user?.email?.trim() ?? "";
  if (authError || !parentEmail) {
    return NextResponse.json({ ok: false, message: "Neautorizovaný požadavek." }, { status: 401 });
  }

  const childName = normalizePlainText(body?.childName ?? "");
  const childAge = typeof body?.childAge === "number" && Number.isInteger(body.childAge) ? body.childAge : null;
  const event = body?.event === "checkin" ? "checkin" : "registration";
  const locationId = normalizePlainText(body?.locationId ?? "");

  if (!childName || childName.length > 40 || (childAge !== null && (childAge < 8 || childAge > 18))) {
    return NextResponse.json({ ok: false, message: "Chybí povinná data." }, { status: 400 });
  }

  const safeLocationId = locationId || "unknown";
  const rateLimit: ParentAlertRateLimit =
    event === "checkin"
      ? {
          action: `parent_checkin_${safeLocationId}`,
          limit: 1,
          windowMinutes: 5,
          blockMinutes: 1
        }
      : {
          action: "parent_registration",
          limit: 3,
          windowMinutes: 60,
          blockMinutes: 15
        };
  const ipAddress = getRequestIpAddress(request);
  let limitResult;
  try {
    limitResult = await checkRateLimit({
      action: rateLimit.action,
      ip: ipAddress,
      userId: authUserId,
      limit: rateLimit.limit,
      windowMinutes: rateLimit.windowMinutes,
      blockMinutes: rateLimit.blockMinutes
    });
  } catch {
    limitResult = checkInMemoryRateLimit({
      action: rateLimit.action,
      ip: ipAddress,
      userId: authUserId,
      limit: rateLimit.limit,
      windowMinutes: rateLimit.windowMinutes,
      blockMinutes: rateLimit.blockMinutes
    });
  }

  if (!limitResult.allowed) {
    return NextResponse.json(
      { ok: event === "checkin", skipped: "rate_limited_parent_alert", retry_after: limitResult.retryAfterSeconds ?? 60 },
      { status: event === "checkin" ? 200 : 429 }
    );
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.PARENT_ALERT_FROM_EMAIL ?? "postope@panbatoh.cz";

  if (!resendApiKey) {
    return NextResponse.json(
      { ok: false, message: "E-mail služba není nakonfigurovaná (RESEND_API_KEY)." },
      { status: 503 }
    );
  }

  const isRegistration = event === "registration";
  const locationName =
    event === "checkin" && locationId ? locations.find((location) => location.id === locationId)?.name ?? locationId : "";
  const subject = isRegistration
    ? `Batoh v pubertě: registrace hráče ${childName}`
    : `Batoh v pubertě: zahájení mise (${childName})`;
  const now = new Date().toLocaleString("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short"
  });
  const safeChildName = escapeHtml(childName);
  const safeChildAge = childAge ?? "?";
  const safeLocationName = escapeHtml(locationName);
  const safeNow = escapeHtml(now);

  const text = [
    "Dobrý den,",
    "",
    isRegistration
      ? `${childName} (${safeChildAge} let) se právě zaregistroval/a do aplikace Batoh v pubertě.`
      : `${childName} (${safeChildAge} let) právě spustil/a misi v aplikaci Batoh v pubertě.`,
    !isRegistration && locationName ? `Mise: ${locationName}` : "",
    `Čas události: ${now}`,
    "Tohle je informační e-mail pro vlastníka účtu.",
    "",
    "Tým Batoh v pubertě"
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <p>Dobrý den,</p>
	      <p><strong>${safeChildName}</strong> (${safeChildAge} let) ${
          isRegistration ? "se právě zaregistroval/a" : "právě spustil/a misi"
        } do aplikace <strong>Batoh v pubertě</strong>.</p>
	      ${!isRegistration && locationName ? `<p><strong>Mise:</strong> ${safeLocationName}</p>` : ""}
	      <p><strong>Čas události:</strong> ${safeNow}</p>
	      <p>Tohle je informační e-mail pro vlastníka účtu.</p>
      <p style="margin-top: 18px;">Tým Batoh v pubertě</p>
    </div>
  `;

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "batoh-v-puberte/1.0 (+https://batoh-v-puberte.vercel.app)"
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
    if (response.status === 403 && errorText.includes("1010")) {
      return NextResponse.json(
        { ok: false, message: "Odeslání zablokováno (Resend 1010). Ověř User-Agent a doménu odesílatele." },
        { status: response.status }
      );
    }
    return NextResponse.json(
      { ok: false, message: `Odeslání e-mailu selhalo: ${errorText}` },
      { status: response.status }
    );
  }

  return NextResponse.json({ ok: true });
}
