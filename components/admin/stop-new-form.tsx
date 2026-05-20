"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import type { FormState } from "@/app/admin/types";
import { EMPTY_FORM_STATE } from "@/app/admin/types";
import { AdminImageField } from "@/components/admin/image-field";

type StopNewFormProps = {
  missionId: string;
  initialOrder: number;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-2xl bg-lime px-4 py-3 text-base font-semibold text-night disabled:opacity-70"
    >
      {pending ? "Ukládám zastavení..." : "Vytvořit zastavení"}
    </button>
  );
}

export function StopNewForm({ missionId, initialOrder, action }: StopNewFormProps) {
  const [state, formAction] = useFormState(action, EMPTY_FORM_STATE);
  const router = useRouter();

  useEffect(() => {
    if (!state.success) {
      return;
    }

    router.refresh();
  }, [router, state.success]);

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-5">
      <input type="hidden" name="mission_id" value={missionId} />

      <section className="glass-card p-5">
        <h2 className="section-title">Nové zastavení</h2>
        <div className="mt-4 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-mist">Název</span>
            <input
              name="title"
              defaultValue=""
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
              placeholder="Např. Chrámek noci a poznání"
              required
            />
            {state.fieldErrors?.title ? <p className="text-xs text-coral">{state.fieldErrors.title}</p> : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-mist">Popis</span>
            <textarea
              name="description"
              rows={4}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
              placeholder="Krátký popis zastavení"
            />
          </label>

          <AdminImageField
            title="Fotografie zastavení"
            imageUrl=""
            alt="Nové zastavení"
            fileInputName="image_file"
            urlInputName="image_url"
            fileError={state.fieldErrors?.image_file}
            emptyLabel="Tady se po uložení ukáže nová fotka"
          />

          <label className="block space-y-2">
            <span className="text-sm text-mist">Pořadí</span>
            <input
              name="order"
              type="number"
              min={0}
              defaultValue={initialOrder}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
              required
            />
            {state.fieldErrors?.order ? <p className="text-xs text-coral">{state.fieldErrors.order}</p> : null}
          </label>
        </div>
      </section>

      {state.success ? (
        <div className="rounded-2xl border border-lime/30 bg-lime/10 px-4 py-3 text-sm text-lime">{state.success}</div>
      ) : null}
      {state.error ? (
        <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">{state.error}</div>
      ) : null}

      <SubmitButton />
    </form>
  );
}
