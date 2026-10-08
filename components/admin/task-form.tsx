"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import type { FormState, MissionTaskRow, MissionTaskType } from "@/app/admin/types";
import { EMPTY_FORM_STATE } from "@/app/admin/types";
import { UnsavedChangesBadge, useUnsavedChanges } from "@/components/admin/unsaved-changes";

type TaskFormProps = {
  stopId: string;
  missionId: string;
  task?: MissionTaskRow;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
};

const TASK_TYPE_OPTIONS: Array<{ value: MissionTaskType; label: string }> = [
  { value: "otevrena", label: "Otevřená odpověď" },
  { value: "vyber", label: "Výběr z možností" },
  { value: "ano-ne", label: "Ano / ne" },
  { value: "serad", label: "Seřaď podle pořadí" }
];

function SubmitButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-lime px-4 py-2 text-sm font-semibold text-night disabled:opacity-70"
    >
      {pending ? "Ukládám..." : isEditing ? "Uložit úkol" : "Přidat úkol"}
    </button>
  );
}

export function TaskForm({ stopId, missionId, task, action }: TaskFormProps) {
  const [state, formAction] = useFormState(action, EMPTY_FORM_STATE);
  const { dirty, formProps } = useUnsavedChanges(state.success, state.error);
  const router = useRouter();
  const isEditing = Boolean(task?.id);
  const defaultOptions = Array.isArray(task?.options) ? task?.options.join("\n") : "";

  useEffect(() => {
    if (!state.success) {
      return;
    }

    router.refresh();
  }, [router, state.success]);

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4" {...formProps}>
      {task?.id ? <input type="hidden" name="task_id" value={task.id} /> : null}
      <input type="hidden" name="stop_id" value={stopId} />
      <input type="hidden" name="mission_id" value={missionId} />

      <div className="grid gap-4">
        <label className="block space-y-2">
          <span className="text-sm text-mist">Typ úkolu</span>
          <select
            name="type"
            defaultValue={task?.type ?? "otevrena"}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
          >
            {TASK_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {state.fieldErrors?.type ? <p className="text-xs text-coral">{state.fieldErrors.type}</p> : null}
        </label>

      </div>

      <label className="block space-y-2">
        <span className="text-sm text-mist">Zadání</span>
        <textarea
          name="question"
          defaultValue={task?.question ?? ""}
          rows={4}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
          required
        />
        {state.fieldErrors?.question ? <p className="text-xs text-coral">{state.fieldErrors.question}</p> : null}
      </label>

      <label className="block space-y-2">
        <span className="text-sm text-mist">Správná odpověď</span>
        <textarea
          name="correct_answer"
          defaultValue={task?.correct_answer ?? ""}
          rows={3}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
          placeholder="Např. 1, Nebe a peklo nebo Ano"
          required
        />
        <p className="text-xs text-mist">
          Povinné pole. U typu „Výběr z možností“ můžete zadat text možnosti nebo její pořadí `1 / 2 / 3`. Když je
          správných možností víc, napište každou na samostatný řádek – čárka možnosti nedělí. U typu
          „Ano / ne“ zadejte přesně `Ano` nebo `Ne`. U otevřených whitelist úkolů typu „napiš aspoň 3...“ zapište
          povolené odpovědi po řádcích, čárkou nebo středníkem. Nepište whitelist jako jednu větu se samými mezerami.
          U číselné odpovědi se slovní varianty můžou zapsat i jako `4 ctyri čtyři`.
        </p>
        {state.fieldErrors?.correct_answer ? <p className="text-xs text-coral">{state.fieldErrors.correct_answer}</p> : null}
      </label>

      <label className="block space-y-2">
        <span className="text-sm text-mist">Pro splnění stačí (nepovinné)</span>
        <input
          name="min_correct_matches"
          type="number"
          min={1}
          defaultValue={task?.min_correct_matches ?? ""}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
        />
        <p className="text-xs text-mist">
          Nechte prázdné, když musí sedět celá odpověď. Číslo použijte, když stačí trefit jen část ze seznamu
          uznávaných odpovědí, například tři státy z osmnácti. Nahrazuje dřívější psaní „alespoň 3“ do zadání.
        </p>
        {state.fieldErrors?.min_correct_matches ? (
          <p className="text-xs text-coral">{state.fieldErrors.min_correct_matches}</p>
        ) : null}
      </label>

      <label className="block space-y-2">
        <span className="text-sm text-mist">Nápověda pro hráče (nepovinné)</span>
        <textarea
          name="hint_text"
          defaultValue={task?.hint_text ?? ""}
          rows={3}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
          placeholder="Např. Podívej se nad vchod, čísla jsou vytesaná do kamene."
        />
        <p className="text-xs text-mist">
          Když nápovědu vyplníte, hráč uvidí tlačítko Nápověda. Po jejím otevření má za správnou odpověď 5 bodů
          místo 10. Bez vyplnění se tlačítko vůbec nezobrazí.
        </p>
      </label>

      <label className="block space-y-2">
        <span className="text-sm text-mist">Možnosti pro výběr</span>
        <textarea
          name="options"
          defaultValue={defaultOptions}
          rows={3}
          placeholder={"Jedna možnost na řádek"}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
        />
        <p className="text-xs text-mist">Použije se jen u typu „Výběr z možností“. U typu „Ano / ne“ se uloží automaticky možnosti Ano a Ne.</p>
        {state.fieldErrors?.options ? <p className="text-xs text-coral">{state.fieldErrors.options}</p> : null}
      </label>

      <UnsavedChangesBadge dirty={dirty} />
      {state.success ? <div className="rounded-2xl border border-lime/30 bg-lime/10 px-4 py-3 text-sm text-lime">{state.success}</div> : null}
      {state.error ? <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">{state.error}</div> : null}

      <SubmitButton isEditing={isEditing} />
    </form>
  );
}
