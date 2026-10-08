"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { EMPTY_FORM_STATE, type FormState, type MissionBubbleRow, type MissionCharacterRow } from "@/app/admin/types";

// R52: editor bublin pro zastavení, úkol nebo závěr hry. Každá bublina je
// vlastní malý formulář (uložit), vedle něj šipky pořadí a smazání. Mluvčí je
// postava hry, nebo Traki – ten je k dispozici vždy.

type Target = { type: "stop"; stopId: string } | { type: "task"; taskId: string } | { type: "ending" };
type SaveAction = (prevState: FormState, formData: FormData) => Promise<FormState>;
type PlainAction = (formData: FormData) => Promise<void>;

const TRAKI = { name: "Traki", image: "/icons/traki-transparent.png" };

function targetFields(target: Target) {
  return (
    <>
      <input type="hidden" name="target_type" value={target.type} />
      {target.type === "stop" ? <input type="hidden" name="stop_id" value={target.stopId} /> : null}
      {target.type === "task" ? <input type="hidden" name="task_id" value={target.taskId} /> : null}
    </>
  );
}

function Ulozit({ nova }: { nova: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-xl bg-lime px-4 py-2 text-sm font-semibold text-night disabled:opacity-70">
      {pending ? "Ukládám…" : nova ? "Přidat bublinu" : "Uložit"}
    </button>
  );
}

function BublinaFormular({
  missionId,
  target,
  bublina,
  characters,
  saveAction
}: {
  missionId: string;
  target: Target;
  bublina?: MissionBubbleRow;
  characters: MissionCharacterRow[];
  saveAction: SaveAction;
}) {
  const [state, formAction] = useFormState(saveAction, EMPTY_FORM_STATE);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const nova = !bublina;

  useEffect(() => {
    if (!state.success) return;
    if (nova) formRef.current?.reset();
    router.refresh();
  }, [state.success, nova, router]);

  return (
    <form ref={formRef} action={formAction} className="min-w-0 flex-1 space-y-3">
      <input type="hidden" name="mission_id" value={missionId} />
      {bublina ? <input type="hidden" name="bubble_id" value={bublina.id} /> : null}
      {targetFields(target)}
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <label className="block space-y-1">
          <span className="text-xs text-mist">Kdo mluví</span>
          <select
            name="character_id"
            defaultValue={bublina?.character_id ?? ""}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            <option value="">Traki</option>
            {characters.map((postava) => (
              <option key={postava.id} value={postava.id}>
                {postava.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-mist">Text bubliny</span>
          <textarea
            name="text"
            defaultValue={bublina?.text ?? ""}
            rows={2}
            maxLength={1000}
            placeholder="Co postava hráči řekne."
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            required
          />
          {state.fieldErrors?.text ? <p className="text-xs text-coral">{state.fieldErrors.text}</p> : null}
        </label>
      </div>
      {state.error ? <p className="text-xs text-coral">{state.error}</p> : null}
      {state.success ? <p className="text-xs text-lime">{state.success}</p> : null}
      <Ulozit nova={nova} />
    </form>
  );
}

export function BubbleEditor({
  missionId,
  target,
  bubbles,
  characters,
  returnTo,
  title,
  hint,
  saveAction,
  deleteAction,
  moveAction
}: {
  missionId: string;
  target: Target;
  bubbles: MissionBubbleRow[];
  characters: MissionCharacterRow[];
  returnTo: string;
  title: string;
  hint: string;
  saveAction: SaveAction;
  deleteAction: PlainAction;
  moveAction: PlainAction;
}) {
  const mluvci = (id: string | null) => (id ? characters.find((c) => c.id === id) ?? null : TRAKI);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-mist">{hint}</p>

      <div className="mt-3 space-y-3">
        {bubbles.map((bublina, index) => {
          const kdo = mluvci(bublina.character_id);
          return (
            <div key={bublina.id} className="flex gap-3 rounded-xl border border-white/10 bg-night/30 p-3">
              <div className="flex w-16 shrink-0 flex-col items-center gap-2">
                {kdo && "image" in kdo && kdo.image ? (
                  <img src={kdo.image} alt="" className="h-12 w-12 object-contain" />
                ) : kdo && "image_url" in kdo && kdo.image_url ? (
                  <img src={kdo.image_url} alt="" className="h-12 w-12 object-contain" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-sm text-mist">?</span>
                )}
                <div className="flex gap-1">
                  {(["up", "down"] as const).map((direction) => (
                    <form key={direction} action={moveAction}>
                      <input type="hidden" name="mission_id" value={missionId} />
                      <input type="hidden" name="bubble_id" value={bublina.id} />
                      <input type="hidden" name="direction" value={direction} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <button
                        type="submit"
                        disabled={direction === "up" ? index === 0 : index === bubbles.length - 1}
                        aria-label={direction === "up" ? "Posunout nahoru" : "Posunout dolů"}
                        className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white disabled:opacity-30"
                      >
                        {direction === "up" ? "↑" : "↓"}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
              <BublinaFormular missionId={missionId} target={target} bublina={bublina} characters={characters} saveAction={saveAction} />
              <form
                action={deleteAction}
                className="shrink-0 self-start"
                onSubmit={(event) => {
                  if (!window.confirm("Opravdu smazat tuhle bublinu?")) event.preventDefault();
                }}
              >
                <input type="hidden" name="mission_id" value={missionId} />
                <input type="hidden" name="bubble_id" value={bublina.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <button type="submit" aria-label="Smazat bublinu" className="rounded-lg border border-coral/30 bg-coral/10 px-2 py-1 text-xs text-coral">
                  ✕
                </button>
              </form>
            </div>
          );
        })}

        <details className="rounded-xl border border-dashed border-lime/30 bg-lime/5 p-3" open={bubbles.length === 0}>
          <summary className="cursor-pointer list-none text-sm font-semibold text-lime">➕ Přidat bublinu</summary>
          <div className="mt-3">
            <BublinaFormular missionId={missionId} target={target} characters={characters} saveAction={saveAction} />
          </div>
        </details>
      </div>
    </div>
  );
}
