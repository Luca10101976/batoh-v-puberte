"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import type { FormState, MissionStopRow } from "@/app/admin/types";
import { EMPTY_FORM_STATE } from "@/app/admin/types";
import { AdminImageField } from "@/components/admin/image-field";

type StopFormProps = {
  stop: MissionStopRow;
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
      {pending ? "Ukládám zastavení..." : "Uložit zastavení"}
    </button>
  );
}

export function StopForm({ stop, action }: StopFormProps) {
  const [state, formAction] = useFormState(action, EMPTY_FORM_STATE);
  const router = useRouter();

  useEffect(() => {
    if (!state.success) {
      return;
    }

    router.refresh();
  }, [router, state.success]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="stop_id" value={stop.id} />
      <input type="hidden" name="mission_id" value={stop.mission_id} />

      <section className="glass-card p-5">
        <h2 className="section-title">Základ zastavení</h2>
        <div className="mt-4 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-mist">Název</span>
            <input
              name="title"
              defaultValue={stop.title}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
              required
            />
            {state.fieldErrors?.title ? <p className="text-xs text-coral">{state.fieldErrors.title}</p> : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-mist">Popis</span>
            <textarea
              name="description"
              defaultValue={stop.description ?? ""}
              rows={4}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
            />
          </label>

          <AdminImageField
            title="Fotografie zastavení"
            imageUrl={stop.image_url}
            alt={stop.title}
            fileInputName="image_file"
            urlInputName="image_url"
            existingUrlInputName="existing_image_url"
            fileError={state.fieldErrors?.image_file}
            emptyLabel="Tady bude náhled zastavení"
          />

          <label className="block space-y-2">
            <span className="text-sm text-mist">Pořadí</span>
            <input
              name="order"
              type="number"
              min={0}
              defaultValue={stop.order}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <SubmitButton />
        {stop.image_url ? (
          <button
            type="submit"
            name="intent"
            value="delete_image"
            className="w-full rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-base font-semibold text-coral"
          >
            Smazat fotografii
          </button>
        ) : null}
      </div>
    </form>
  );
}
