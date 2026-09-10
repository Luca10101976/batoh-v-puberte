"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { EMPTY_FORM_STATE, type FormState, type MissionRow } from "@/app/admin/types";
import { AdminImageField } from "@/components/admin/image-field";
import type { City } from "@/lib/cities";

export type UnlockCandidate = { id: string; title: string; city: string; isPublished: boolean };

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

export function MissionForm({
  action,
  submitLabel,
  mission,
  cities,
  unlockCandidates
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  mission?: MissionRow;
  cities: City[];
  unlockCandidates: UnlockCandidate[];
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  const selectedCity = cities.find((city) => city.id === mission?.city_id) ?? cities[0];

  return (
    <form action={formAction} className="space-y-5">
      {mission ? <input type="hidden" name="mission_id" value={mission.id} /> : null}

      <section className="glass-card p-5">
        <h2 className="section-title">Základ</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
            {cities.length === 0 ? (
              <p className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                Zatím nemáš žádné aktivní město. Nejdřív ho založ v sekci Města.
              </p>
            ) : (
              <select
                name="city_id"
                defaultValue={selectedCity?.id ?? ""}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
                required
              >
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            )}
            {state.fieldErrors?.city_id ? <p className="text-xs text-coral">{state.fieldErrors.city_id}</p> : null}
          </label>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">Texty</h2>

        <label className="mt-4 block space-y-2">
          <span className="text-sm text-mist">Krátký popis do katalogu</span>
          <input
            name="short_description"
            defaultValue={mission?.short_description ?? ""}
            maxLength={200}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
            placeholder="Jedna věta, kterou hráč uvidí na kartě hry"
          />
          <span className="block text-xs text-mist">Bez vyplnění se použije první věta úvodního textu.</span>
        </label>

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

        <label className="mt-4 block space-y-2">
          <span className="text-sm text-mist">Závěr – titulek</span>
          <input
            name="ending_title"
            defaultValue={mission?.ending_title ?? ""}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
            placeholder="Např. Tajemství Klamovky odhaleno"
          />
        </label>

        <label className="mt-4 block space-y-2">
          <span className="text-sm text-mist">Závěr – text</span>
          <textarea
            name="ending_text"
            defaultValue={mission?.ending_text ?? ""}
            rows={4}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
            placeholder="Co se hráč dozví po dohrání..."
          />
        </label>

        <label className="mt-4 block space-y-2">
          <span className="text-sm text-mist">Závěr – vzkaz hráči</span>
          <textarea
            name="ending_player_message"
            defaultValue={mission?.ending_player_message ?? ""}
            rows={3}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
            placeholder="Osobní věta na konec, nepovinná"
          />
        </label>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">Titulní obrázek</h2>
        {typeof mission?.hero_image_url === "undefined" && mission ? (
          <p className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            Hlavní fotka mise je připravená v kódu, ale databáze ještě potřebuje migraci sloupce `hero_image_url`.
          </p>
        ) : (
          <div className="mt-4">
            <AdminImageField
              title="Titulní obrázek hry"
              alt="Titulní obrázek hry"
              imageUrl={mission?.hero_image_url}
              emptyLabel="Tady bude titulní obrázek"
              fileInputName="hero_image_file"
              urlInputName="hero_image_url"
              existingUrlInputName="existing_hero_image_url"
              fileError={state.fieldErrors?.hero_image_file}
              previewVariant="hero"
            />
          </div>
        )}
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title">Katalog</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block space-y-2">
            <span className="text-sm text-mist">Obtížnost</span>
            <select
              name="difficulty"
              defaultValue={mission?.difficulty ?? "lehka"}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
            >
              <option value="lehka">Lehká</option>
              <option value="stredni">Střední</option>
              <option value="tezka">Vyšší</option>
            </select>
            {state.fieldErrors?.difficulty ? <p className="text-xs text-coral">{state.fieldErrors.difficulty}</p> : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-mist">Délka (min)</span>
            <input
              name="duration_min"
              type="number"
              min={0}
              defaultValue={mission?.duration_min ?? 60}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
            />
            {state.fieldErrors?.duration_min ? (
              <p className="text-xs text-coral">{state.fieldErrors.duration_min}</p>
            ) : null}
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-mist">Pořadí v katalogu</span>
            <input
              name="catalog_order"
              type="number"
              min={0}
              defaultValue={mission?.catalog_order ?? 0}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
            />
            {state.fieldErrors?.catalog_order ? (
              <p className="text-xs text-coral">{state.fieldErrors.catalog_order}</p>
            ) : null}
          </label>
        </div>

        <label className="mt-4 block space-y-2">
          <span className="text-sm text-mist">Odemkne se až po dohrání</span>
          <select
            name="unlock_after_mission_id"
            defaultValue={mission?.unlock_after_mission_id ?? ""}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
          >
            <option value="">Hra je dostupná rovnou</option>
            {unlockCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title} ({candidate.city}){candidate.isPublished ? "" : " – zatím koncept"}
              </option>
            ))}
          </select>
          <span className="block text-xs text-mist">
            Vybraná hra musí být ze stejného města a publikovaná, jinak by tahle hra zůstala trvale zamčená.
          </span>
          {state.fieldErrors?.unlock_after_mission_id ? (
            <p className="text-xs text-coral">{state.fieldErrors.unlock_after_mission_id}</p>
          ) : null}
        </label>

        <input type="hidden" name="points" value={mission?.points ?? 0} />
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
            Smazat titulní obrázek
          </button>
        ) : null}
      </div>

      {/* R37: publikace se dělá výhradně tlačítkem „Publikovat", které vždy spustí
          kontrolu hratelnosti. Zaškrtávátko ve formuláři tuhle kontrolu obcházelo. */}
      <p className="text-xs text-mist">
        Publikace se řídí tlačítkem nahoře. Uložení konceptu hru hráčům nezveřejní.
      </p>
    </form>
  );
}
