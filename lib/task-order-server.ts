import { getGameplayLocation } from "@/lib/gameplay-server";
import { loadRunTaskProgress } from "@/lib/game-run";
import { resolveTaskAvailability, type OrderedTaskRow, type TaskAvailability } from "@/lib/task-order";

// R26: serverová brána pořadí. Používají ji VŠECHNY zapisující herní cesty
// (odpověď, Nevím, nápověda), aby pravidlo existovalo jen jednou.
//
// Fail-closed: když se obsah hry nebo postup výpravy nepodaří načíst, úkol se
// nepovolí. Raději hráči řekneme „zkus to znovu“, než abychom pustili zápis
// mimo pořadí.

export type ServerTaskAvailability = TaskAvailability | { allowed: false; reason: "order_check_failed" };

export async function resolveServerTaskAvailability(
  admin: any,
  args: { runId: string | null; locationId: string; childProfileId: string; taskId: string }
): Promise<ServerTaskAvailability> {
  let episodes: Array<{ id: string; name: string; tasks: Array<{ id: string }> }>;
  let progress: OrderedTaskRow[];

  try {
    const location = await getGameplayLocation(args.locationId);
    if (!location) {
      return { allowed: false, reason: "unknown_task" };
    }
    episodes = location.episodes.map((episode) => ({
      id: episode.id,
      name: episode.name,
      tasks: episode.tasks.map((task) => ({ id: task.id }))
    }));

    const byChild = await loadRunTaskProgress(admin, {
      runId: args.runId,
      locationId: args.locationId,
      childProfileIds: [args.childProfileId]
    });
    progress = (byChild.get(args.childProfileId) ?? []).map((row) => ({
      task_id: row.task_id,
      status: row.status
    }));
  } catch {
    return { allowed: false, reason: "order_check_failed" };
  }

  return resolveTaskAvailability(episodes, progress, args.taskId);
}

/**
 * Odpověď pro klienta: proč to nešlo a kam se má vrátit.
 *
 * `allowClosed` používá uložení odpovědi: úkol uzavřený jiným zařízením není
 * přeskočení pořadí, ale souběh z R24 – endpoint na něj odpovídá uloženým
 * výsledkem s `locked`, ne chybou. Nápověda naopak k uzavřenému úkolu nepatří,
 * protože by dodatečně snížila hodnotu už zodpovězeného úkolu.
 */
export function taskAvailabilityResponse(
  availability: ServerTaskAvailability,
  options?: { allowClosed?: boolean }
) {
  if (availability.allowed) {
    return null;
  }
  if (options?.allowClosed && availability.reason === "already_closed") {
    return null;
  }
  if (availability.reason === "unknown_task") {
    return { status: 400, body: { ok: false as const, error: "unknown_location_or_task" } };
  }
  if (availability.reason === "order_check_failed") {
    return { status: 500, body: { ok: false as const, error: "order_check_failed" } };
  }
  return {
    status: 409,
    body: {
      ok: false as const,
      error: availability.reason === "already_closed" ? "task_already_closed" : "task_out_of_order",
      // Aplikace podle toho vrátí hráče na úkol, který je opravdu na řadě (Q2).
      currentTaskId: availability.currentTaskId,
      message:
        availability.reason === "already_closed"
          ? "Tenhle úkol už máš uzavřený."
          : "Tenhle úkol ještě není na řadě. Vracíme tě tam, kde jsi skončil."
    }
  };
}
