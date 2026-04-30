"use client";
/* eslint-disable @next/next/no-img-element */

type AdminImageFieldProps = {
  title: string;
  imageUrl?: string | null;
  alt: string;
  fileInputName: string;
  urlInputName: string;
  existingUrlInputName?: string;
  fileError?: string;
  urlPlaceholder?: string;
  emptyLabel?: string;
  helperText?: string;
  previewVariant?: "square" | "hero";
};

export function AdminImageField({
  title,
  imageUrl,
  alt,
  fileInputName,
  urlInputName,
  existingUrlInputName,
  fileError,
  urlPlaceholder = "https://...",
  emptyLabel = "Zatím bez fotky",
  helperText = "Nahrajte JPG, PNG nebo WEBP do 5 MB. Když vyberete soubor, použije se místo URL.",
  previewVariant = "square"
}: AdminImageFieldProps) {
  const isSquare = previewVariant === "square";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-mist">{title}</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-mist">
          {imageUrl ? "Aktuální fotka" : "Bez fotky"}
        </span>
      </div>

      <div
        className={`overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] ${
          isSquare ? "max-w-[420px]" : ""
        }`}
      >
        {imageUrl ? (
          <div className="relative">
            <img
              src={imageUrl}
              alt={alt}
              className={isSquare ? "aspect-square w-full object-cover" : "h-64 w-full object-cover sm:h-72"}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night/80 to-transparent px-4 py-4">
              <p className="text-sm font-medium text-white">Aktuální náhled</p>
              <p className="text-xs text-white/70">
                {isSquare ? "Ve hře se tahle fotka používá jako kompaktní čtvercový náhled." : "Po uložení se nová fotka propíše do hry."}
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_20%_20%,rgba(82,200,255,0.12),transparent_30%),radial-gradient(circle_at_80%_80%,rgba(178,247,93,0.12),transparent_35%),linear-gradient(180deg,#152133_0%,#101827_100%)] px-6 text-center ${
              isSquare ? "aspect-square w-full" : "h-64 sm:h-72"
            }`}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-2xl text-mist">
              +
            </div>
            <div>
              <p className="text-base font-semibold text-white">{emptyLabel}</p>
              <p className="mt-1 text-sm text-mist">
                {isSquare
                  ? "Nahrajte čitelnou fotku na čtvercový výřez. Po uložení se objeví tady."
                  : "Nahrajte obrázek nebo vložte URL a po uložení se objeví tady."}
              </p>
            </div>
          </div>
        )}
      </div>

      {existingUrlInputName ? <input type="hidden" name={existingUrlInputName} value={imageUrl ?? ""} /> : null}

      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <label className="flex min-h-[128px] cursor-pointer flex-col justify-between rounded-[24px] border border-dashed border-lime/35 bg-lime/8 p-5 transition hover:border-lime/60 hover:bg-lime/12">
            <div className="space-y-2">
              <span className="inline-flex rounded-full bg-lime px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-night">
                Nahrát soubor
              </span>
              <div>
                <p className="text-base font-semibold text-white">Přetáhněte nebo vyberte fotku</p>
                <p className="mt-1 text-sm leading-6 text-mist">{helperText}</p>
              </div>
            </div>

            <input
              name={fileInputName}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-4 block w-full text-sm text-white file:mr-3 file:rounded-xl file:border-0 file:bg-night/80 file:px-4 file:py-2 file:font-semibold file:text-white"
            />
          </label>

          <label className="block space-y-2 rounded-[24px] border border-white/10 bg-night/25 p-5">
            <span className="text-sm font-medium text-white">Nebo vložte URL obrázku</span>
            <input
              name={urlInputName}
              defaultValue={imageUrl ?? ""}
              placeholder={urlPlaceholder}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white"
            />
            <p className="text-xs leading-5 text-mist">Tohle se hodí, když už máte obrázek uložený jinde a nechcete ho nahrávat znovu.</p>
          </label>
        </div>

        {fileError ? <p className="mt-3 text-xs text-coral">{fileError}</p> : null}
      </div>
    </section>
  );
}
