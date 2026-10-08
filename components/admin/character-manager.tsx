"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { EMPTY_FORM_STATE, type FormState, type MissionCharacterRow } from "@/app/admin/types";
import { AdminImageField } from "@/components/admin/image-field";

// R51: postavy hry v Mozku. Každá má jméno a obrázek; mluví v bublinách při
// příchodu na zastavení (bublinu nastavíš u konkrétního zastavení).

type SaveAction = (prevState: FormState, formData: FormData) => Promise<FormState>;
type DeleteAction = (formData: FormData) => Promise<void>;

function UlozitTlacitko({ novaPostava }: { novaPostava: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-2xl bg-lime px-4 py-3 text-sm font-semibold text-night disabled:opacity-70"
    >
      {pending ? "Ukládám…" : novaPostava ? "Přidat postavu" : "Uložit postavu"}
    </button>
  );
}

function PostavaFormular({
  missionId,
  postava,
  saveAction
}: {
  missionId: string;
  postava?: MissionCharacterRow;
  saveAction: SaveAction;
}) {
  const [state, formAction] = useFormState(saveAction, EMPTY_FORM_STATE);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const novaPostava = !postava;

  useEffect(() => {
    if (!state.success) return;
    if (novaPostava) formRef.current?.reset();
    router.refresh();
  }, [state.success, novaPostava, router]);

  return (
    <form ref={formRef} action={formAction} encType="multipart/form-data" className="space-y-4">
      <input type="hidden" name="mission_id" value={missionId} />
      {postava ? <input type="hidden" name="character_id" value={postava.id} /> : null}

      <label className="block space-y-2">
        <span className="text-sm text-mist">Jméno postavy</span>
        <input
          name="name"
          defaultValue={postava?.name ?? ""}
          maxLength={60}
          placeholder="Např. Atbaliba"
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
          required
        />
        {state.fieldErrors?.name ? <p className="text-xs text-coral">{state.fieldErrors.name}</p> : null}
      </label>

      <AdminImageField
        title="Obrázek postavy"
        imageUrl={postava?.image_url}
        alt={postava?.name ?? "Nová postava"}
        fileInputName="image_file"
        urlInputName="image_url"
        existingUrlInputName="existing_image_url"
        fileError={state.fieldErrors?.image_file}
        emptyLabel="Zatím bez obrázku"
        helperText="Nejlépe obrázek s průhledným pozadím (PNG nebo WEBP), jako má Traki. Velikost řešit nemusíte."
      />

      {state.success ? (
        <p className="rounded-2xl border border-lime/30 bg-lime/10 px-4 py-3 text-sm text-lime">{state.success}</p>
      ) : null}
      {state.error ? (
        <p className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">{state.error}</p>
      ) : null}

      <UlozitTlacitko novaPostava={novaPostava} />
    </form>
  );
}

export function CharacterManager({
  missionId,
  characters,
  saveAction,
  deleteAction
}: {
  missionId: string;
  characters: MissionCharacterRow[];
  saveAction: SaveAction;
  deleteAction: DeleteAction;
}) {
  return (
    <section className="glass-card p-5">
      <h2 className="section-title">Postavy</h2>
      <p className="mt-2 text-sm leading-6 text-mist">
        Postavy, které ve hře mluví v bublinách. Bublinu nastavíš u konkrétního zastavení – hráč ji uvidí,
        když na místo dorazí, nad úkoly.
      </p>

      <div className="mt-4 space-y-3">
        {characters.map((postava) => (
          <details key={postava.id} className="group rounded-2xl border border-white/10 bg-white/5 p-4">
            <summary className="flex cursor-pointer list-none items-center gap-3">
              {postava.image_url ? (
                <img src={postava.image_url} alt="" className="h-12 w-12 shrink-0 object-contain" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">?</span>
              )}
              <span className="min-w-0 flex-1 font-semibold text-white">{postava.name}</span>
              <span className="text-sm text-lime group-open:hidden">Upravit</span>
              <span className="hidden text-sm text-mist group-open:inline">Zavřít</span>
            </summary>
            <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
              <PostavaFormular missionId={missionId} postava={postava} saveAction={saveAction} />
              <form
                action={deleteAction}
                onSubmit={(event) => {
                  if (!window.confirm(`Opravdu smazat postavu „${postava.name}“?`)) event.preventDefault();
                }}
              >
                <input type="hidden" name="mission_id" value={missionId} />
                <input type="hidden" name="character_id" value={postava.id} />
                <button
                  type="submit"
                  className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral"
                >
                  Smazat postavu
                </button>
              </form>
            </div>
          </details>
        ))}

        <details className="group rounded-2xl border border-dashed border-lime/30 bg-lime/5 p-4" open={characters.length === 0}>
          <summary className="cursor-pointer list-none text-sm font-semibold text-lime">➕ Přidat postavu</summary>
          <div className="mt-4">
            <PostavaFormular missionId={missionId} saveAction={saveAction} />
          </div>
        </details>
      </div>
    </section>
  );
}
