"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { EMPTY_FORM_STATE, type FormState } from "@/app/admin/types";
import type { City } from "@/lib/cities";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-2xl bg-lime px-4 py-3 text-base font-semibold text-night disabled:opacity-70"
    >
      {pending ? "Ukládám…" : label}
    </button>
  );
}

export function CityForm({
  action,
  submitLabel,
  city
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  city?: City;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="space-y-5">
      {city ? <input type="hidden" name="city_id" value={city.id} /> : null}

      <section className="glass-card p-5">
        <h2 className="section-title">Město</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm text-mist">Název</span>
            <input
              name="name"
              defaultValue={city?.name ?? ""}
              required
              maxLength={60}
              placeholder="Např. Olomouc"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
            />
            {state.fieldErrors?.name ? <p className="text-xs text-coral">{state.fieldErrors.name}</p> : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-mist">Tvar pro větu „Hry v …“</span>
            <input
              name="name_locative"
              defaultValue={city?.nameLocative ?? ""}
              maxLength={60}
              placeholder="Např. Olomouci"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
            />
            <span className="block text-xs text-mist">
              Bez vyplnění se použije název, jak je. Čeština ho z názvu neodvodí.
            </span>
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm text-mist">Identifikátor</span>
            <input
              name="slug"
              defaultValue={city?.slug ?? ""}
              maxLength={60}
              placeholder="Nech prázdné a odvodí se z názvu"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
            />
            {state.fieldErrors?.slug ? <p className="text-xs text-coral">{state.fieldErrors.slug}</p> : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-mist">Pořadí</span>
            <input
              name="display_order"
              type="number"
              min={0}
              defaultValue={city?.displayOrder ?? 0}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
            />
            {state.fieldErrors?.display_order ? (
              <p className="text-xs text-coral">{state.fieldErrors.display_order}</p>
            ) : null}
          </label>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">Poloha</h2>
        <p className="mt-1 text-xs text-mist">
          Používá se jako výchozí bod města pro hry, které vzniknou jen v Mozku. Nech prázdné, pokud ji zatím neznáš.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm text-mist">Zeměpisná šířka</span>
            <input
              name="lat"
              defaultValue={city?.lat ?? ""}
              placeholder="49.5938"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
            />
            {state.fieldErrors?.lat ? <p className="text-xs text-coral">{state.fieldErrors.lat}</p> : null}
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-mist">Zeměpisná délka</span>
            <input
              name="lng"
              defaultValue={city?.lng ?? ""}
              placeholder="17.2509"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
            />
            {state.fieldErrors?.lng ? <p className="text-xs text-coral">{state.fieldErrors.lng}</p> : null}
          </label>
        </div>
      </section>

      <section className="glass-card p-5">
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3">
          <div>
            <p className="font-medium">Město je aktivní</p>
            <p className="text-xs text-mist">Vypnuté město se nenabízí u nových her.</p>
          </div>
          <input
            name="is_active"
            type="checkbox"
            defaultChecked={city?.isActive ?? true}
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

      <SubmitButton label={submitLabel} />
    </form>
  );
}
