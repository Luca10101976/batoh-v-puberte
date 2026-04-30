"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import type { FormState, MissionTaskRow, MissionTaskType } from "@/app/admin/types";
import { EMPTY_FORM_STATE } from "@/app/admin/types";

type TaskFormProps = {
  stopId: string;
  missionId: string;
  task?: MissionTaskRow;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
};

const TASK_TYPE_OPTIONS: Array<{ value: MissionTaskType; label: string }> = [
  { value: "otevrena", label: "Otevřená odpověď" },
  { value: "vyber", label: "Výběr z možností" },
  { value: "ano-ne", label: "Ano / ne" }
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
    <form action={formAction} className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
      {task?.id ? <input type="hidden" name="task_id" value={task.id} /> : null}
      <input type="hidden" name="stop_id" value={stopId} />
      <input type="hidden" name="mission_id" value={missionId} />

      <div className="grid gap-4 md:grid-cols-2">
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

        <label className="block space-y-2">
          <span className="text-sm text-mist">Pořadí</span>
          <input
            name="order"
            type="number"
            min={0}
            defaultValue={task?.order ?? 0}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
            required
          />
          {state.fieldErrors?.order ? <p className="text-xs text-coral">{state.fieldErrors.order}</p> : null}
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
          Povinné pole. U typu „Výběr z možností“ můžete zadat text možnosti nebo její pořadí `1 / 2 / 3`. U typu
          „Výběr z možností“ ukládejte vždy jen jednu správnou možnost, ne více odpovědí najednou. U typu
          „Ano / ne“ zadejte přesně `Ano` nebo `Ne`. U otevřených whitelist úkolů typu „napiš aspoň 3...“ zapište
          povolené odpovědi po řádcích, čárkou nebo středníkem. Nepište whitelist jako jednu větu se samými mezerami.
          U číselné odpovědi se slovní varianty můžou zapsat i jako `4 ctyri čtyři`.
        </p>
        {state.fieldErrors?.correct_answer ? <p className="text-xs text-coral">{state.fieldErrors.correct_answer}</p> : null}
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

      <section className="rounded-2xl border border-sky/20 bg-sky/10 px-4 py-4 text-sm text-white/90">
        <p className="text-xs uppercase tracking-[0.2em] text-sky">Nápověda pro odpovědi</p>
        <div className="mt-3 space-y-3 leading-6">
          <div>
            <p className="font-semibold text-white">Otevřená odpověď</p>
            <p className="text-mist">
              Když je správná jen jedna odpověď, napište ji normálně do pole. Když má mít víc správných variant,
              oddělte je nejlépe po řádcích, čárkou nebo středníkem.
            </p>
            <p className="mt-1 text-mist">
              Příklad: <span className="font-mono text-white">4, ctyri, čtyři</span>
            </p>
          </div>

          <div>
            <p className="font-semibold text-white">Úkol typu „napiš aspoň 3...“</p>
            <p className="text-mist">
              Do pole správné odpovědi napište whitelist povolených odpovědí. Hra pak uzná splnění, když hráč trefí
              alespoň požadovaný počet správných položek ze zadání.
            </p>
            <p className="mt-1 text-mist">
              Příklad: <span className="font-mono text-white">Rakousko; Polsko; Japonsko; Tunisko</span>
            </p>
            <p className="mt-1 text-mist">
              Nejbezpečnější formát je jedna povolená odpověď na řádek, případně čárka nebo středník. Tím se vyhnete
              tomu, že se více slov uloží jako jeden kus textu.
            </p>
          </div>

          <div>
            <p className="font-semibold text-white">Výběr z možností</p>
            <p className="text-mist">
              Do „Možnosti pro výběr“ napište jednu možnost na řádek. Do „Správná odpověď“ napište buď přesný text
              správné možnosti, nebo její pořadí <span className="font-mono text-white">1 / 2 / 3</span>.
              Nepřidávejte před ni <span className="font-mono text-white">Ano</span> ani{" "}
              <span className="font-mono text-white">Ne</span>; server uloží jen čistou vybranou možnost.
            </p>
          </div>

          <div>
            <p className="font-semibold text-white">Ano / ne</p>
            <p className="text-mist">
              Do správné odpovědi napište přesně <span className="font-mono text-white">Ano</span> nebo{" "}
              <span className="font-mono text-white">Ne</span>. Možnosti se doplní automaticky.
            </p>
          </div>
        </div>
      </section>

      {state.success ? <div className="rounded-2xl border border-lime/30 bg-lime/10 px-4 py-3 text-sm text-lime">{state.success}</div> : null}
      {state.error ? <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">{state.error}</div> : null}

      <SubmitButton isEditing={isEditing} />
    </form>
  );
}
