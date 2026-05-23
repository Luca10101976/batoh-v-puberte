"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import type { FormState, MissionDifficulty, MissionRow } from "@/app/admin/types";
import { EMPTY_FORM_STATE } from "@/app/admin/types";
import { AdminImageField } from "@/components/admin/image-field";

type MissionFormProps = {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  mission?: MissionRow;
  submitLabel: string;
  cities: string[];
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-2xl bg-lime px-4 py-3 text-base font-semibold text-night disabled:opacity-70"
    >
      {pending ? "Ukládám..." : label}
    </button>
  );
}

const DIFFICULTY_OPTIONS: Array<{ value: MissionDifficulty; label: string }> = [
  { value: "lehka", label: "Lehká" },
  { value: "stredni", label: "Střední" },
  { value: "tezka", label: "Těžká" }
];

export function MissionForm({ action, mission, submitLabel, cities }: MissionFormProps) {
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
      {mission ? <input type="hidden" name="mission_id" value={mission.id} /> : null}

      <section className="glass-card p-5">
        <h2 className="section-title">Základ mise</h2>
        <div className="mt-4 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-mist">Název</span>
            <input
              name="title"
              defaultValue={mission?.title ?? ""}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
              placeholder="Např. Ztracený příběh Klamovky"
              required
            />
            {state.fieldErrors?.title ? <p className="text-xs text-coral">{state.fieldErrors.title}</p> : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-mist">Město</span>
            <select
              name="city"
              defaultValue={mission?.city ?? cities[0] ?? "Praha"}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
              required
            >
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            {state.fieldErrors?.city ? <p className="text-xs text-coral">{state.fieldErrors.city}</p> : null}
          </label>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">Texty</h2>
        <label className="mt-4 block space-y-2">
          <span className="text-sm text-mist">Úvodní text</span>
          <textarea
            name="intro_text"
            defaultValue={mission?.intro_text ?? ""}
            rows={5}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
            placeholder="Krátký úvod mise..."
            required
          />
          {state.fieldErrors?.intro_text ? <p className="text-xs text-coral">{state.fieldErrors.intro_text}</p> : null}
        </label>
      </section>

      {mission ? (
        <section className="glass-card p-5">
          <h2 className="section-title">Hlavní fotka mise</h2>
          {typeof mission.hero_image_url === "undefined" ? (
            <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              Hlavní fotka mise je připravená v kódu, ale databáze ještě potřebuje migraci sloupce `hero_image_url`.
            </div>
          ) : (
            <div className="mt-4">
              <AdminImageField
                title="Hlavní fotka mise"
                imageUrl={mission.hero_image_url}
                alt={mission.title}
                fileInputName="hero_image_file"
                urlInputName="hero_image_url"
                existingUrlInputName="existing_hero_image_url"
                fileError={state.fieldErrors?.hero_image_file}
                emptyLabel="Tady bude hlavní fotka mise"
                helperText="Nahrajte hlavní hero fotku mise v JPG, PNG nebo WEBP do 5 MB."
                previewVariant="hero"
              />
            </div>
          )}
        </section>
      ) : null}

      <section className="glass-card p-5">
        <h2 className="section-title">Parametry</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block space-y-2">
            <span className="text-sm text-mist">Obtížnost</span>
            <select
              name="difficulty"
              defaultValue={mission?.difficulty ?? "lehka"}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
            >
              {DIFFICULTY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {state.fieldErrors?.difficulty ? <p className="text-xs text-coral">{state.fieldErrors.difficulty}</p> : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-mist">Délka (min)</span>
            <input
              name="duration_min"
              type="number"
              min={0}
              defaultValue={mission?.duration_min ?? 30}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
              required
            />
            {state.fieldErrors?.duration_min ? (
              <p className="text-xs text-coral">{state.fieldErrors.duration_min}</p>
            ) : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-mist">Max bodů (informativně)</span>
            <input
              name="points"
              type="number"
              min={0}
              defaultValue={mission?.points ?? 0}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
              required
            />
            <p className="text-xs text-mist">Ve veřejné hře se maximum počítá podle počtu úkolů krát 10. Tohle pole je jen doprovodná informace v Mozku.</p>
            {state.fieldErrors?.points ? <p className="text-xs text-coral">{state.fieldErrors.points}</p> : null}
          </label>
        </div>
      </section>

      <section className="glass-card p-5">
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3">
          <div>
            <p className="font-medium">Publikovat misi</p>
            <p className="text-xs text-mist">Zobrazit misi hráčům</p>
          </div>
          <input
            name="is_published"
            type="checkbox"
            defaultChecked={mission?.is_published ?? false}
            className="h-5 w-5 rounded border-white/20 bg-night"
          />
        </label>
      </section>

      {state.success ? (
        <div className="rounded-2xl border border-lime/30 bg-lime/10 px-4 py-3 text-sm text-lime">{state.success}</div>
      ) : null}
      {state.error ? (
        <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">{state.error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <SubmitButton label={submitLabel} />
        {mission?.hero_image_url ? (
          <button
            type="submit"
            name="intent"
            value="delete_hero_image"
            className="w-full rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-base font-semibold text-coral"
          >
            Smazat hlavní fotku
          </button>
        ) : null}
      </div>
    </form>
  );
}
