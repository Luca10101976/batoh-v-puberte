"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import type { FormState, MissionCharacterRow, MissionStopRow } from "@/app/admin/types";
import { UnsavedChangesBadge, useUnsavedChanges } from "@/components/admin/unsaved-changes";
import { EMPTY_FORM_STATE } from "@/app/admin/types";
import { AdminImageField } from "@/components/admin/image-field";

type StopFormProps = {
  stop: MissionStopRow;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  /** R51: postavy hry pro bublinu při příchodu. */
  characters?: MissionCharacterRow[];
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

export function StopForm({ stop, action, characters = [] }: StopFormProps) {
  const [state, formAction] = useFormState(action, EMPTY_FORM_STATE);
  const { dirty, formProps } = useUnsavedChanges(state.success, state.error);
  const router = useRouter();

  useEffect(() => {
    if (!state.success) {
      return;
    }

    router.refresh();
  }, [router, state.success]);

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-5" {...formProps}>
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
            <span className="text-sm text-mist">Text po dokončení zastavení (nepovinné)</span>
            <textarea
              name="transition_text"
              defaultValue={stop.transition_text ?? ""}
              rows={3}
              placeholder="Co hráč uvidí, až tuhle zastávku dokončí a půjde na další."
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
            />
            <span className="block text-xs text-mist">
              Tady hráči napiš, kudy se dostane na další zastavení. Když necháš prázdné,
              uvidí jen název dalšího místa a nic víc.
            </span>
          </label>

        </div>
      </section>

      {/* R51: bublina při příchodu na zastavení – kdo mluví a co říká. */}
      <section className="glass-card p-5">
        <h2 className="section-title">Bublina při příchodu</h2>
        <p className="mt-2 text-sm leading-6 text-mist">
          Hráč ji uvidí, když na zastavení dorazí – nad úkoly, s obrázkem postavy. Nepovinné.
        </p>
        {characters.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-sm text-mist">
            Hra zatím nemá žádnou postavu. Přidej ji na stránce hry v sekci{" "}
            <a href={`/mozek/missions/${stop.mission_id}`} className="font-semibold text-lime underline">
              Postavy
            </a>
            .
          </p>
        ) : null}
        <div className="mt-4 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-mist">Kdo mluví</span>
            <select
              name="bubble_character_id"
              defaultValue={stop.bubble_character_id ?? ""}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
            >
              <option value="">— bez bubliny —</option>
              {characters.map((postava) => (
                <option key={postava.id} value={postava.id}>
                  {postava.name}
                </option>
              ))}
            </select>
            {state.fieldErrors?.bubble_character_id ? (
              <p className="text-xs text-coral">{state.fieldErrors.bubble_character_id}</p>
            ) : null}
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-mist">Text bubliny</span>
            <textarea
              name="bubble_text"
              defaultValue={stop.bubble_text ?? ""}
              rows={3}
              placeholder="Co postava hráči řekne, když dorazí na místo."
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
            />
            {state.fieldErrors?.bubble_text ? <p className="text-xs text-coral">{state.fieldErrors.bubble_text}</p> : null}
          </label>
        </div>
      </section>

      <UnsavedChangesBadge dirty={dirty} />
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
