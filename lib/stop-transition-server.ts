import { isMissingColumnError } from "@/lib/game-run";

// R26/Q4: potvrzení přechodové obrazovky.
//
// Není to druhý zdroj pravdy o dokončení zastávky – to se dál odvozuje výhradně
// z uzavřených úkolů výpravy (Q3). Tohle je záznam o tom, že hráč na obrazovce
// klikl „pokračovat“. Bez něj by šla obrazovka zavřít jen do dalšího načtení,
// protože podmínka „předchozí zastávka je hotová“ platí i po reloadu.
//
// Patří k účastníkovi konkrétní výpravy, takže je zároveň per-session i per-player.

type PlayerRow = { confirmed_stop_transitions?: unknown };

function toStopIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function loadConfirmedStopTransitions(
  admin: any,
  args: { runId: string; childProfileId: string }
): Promise<string[]> {
  const { data, error } = (await admin
    .from("child_game_session_players")
    .select("confirmed_stop_transitions")
    .eq("session_id", args.runId)
    .eq("child_profile_id", args.childProfileId)
    .limit(1)
    .maybeSingle()) as { data: PlayerRow | null; error: { code?: string; message?: string } | null };

  if (error) {
    // Prostředí bez migrace R26 sloupec nemá; přechod se pak chová jako dřív.
    return [];
  }
  return toStopIds(data?.confirmed_stop_transitions);
}

export type ConfirmResult =
  | { ok: true; confirmedStopIds: string[] }
  | { ok: false; error: "not_a_participant" | "save_failed" | "unsupported" };

/** Idempotentní: opakované potvrzení téže zastávky seznam nezmění. */
export async function confirmStopTransition(
  admin: any,
  args: { runId: string; childProfileId: string; stopId: string }
): Promise<ConfirmResult> {
  const { data, error } = (await admin
    .from("child_game_session_players")
    .select("id, confirmed_stop_transitions")
    .eq("session_id", args.runId)
    .eq("child_profile_id", args.childProfileId)
    .limit(1)
    .maybeSingle()) as {
    data: (PlayerRow & { id: string }) | null;
    error: { code?: string; message?: string } | null;
  };

  if (isMissingColumnError(error)) {
    return { ok: false, error: "unsupported" };
  }
  if (error || !data?.id) {
    return { ok: false, error: "not_a_participant" };
  }

  const current = toStopIds(data.confirmed_stop_transitions);
  if (current.includes(args.stopId)) {
    return { ok: true, confirmedStopIds: current };
  }

  const next = [...current, args.stopId];
  const { error: updateError } = await admin
    .from("child_game_session_players")
    .update({ confirmed_stop_transitions: next })
    .eq("id", data.id);

  if (updateError) {
    return { ok: false, error: "save_failed" };
  }
  return { ok: true, confirmedStopIds: next };
}
