/**
 * R37: automatické zpracování nahrávaného obrázku.
 *
 * Administrátorka nemá řešit velikost souboru. Fotka z telefonu má běžně 4–12 MB
 * a limit uploadu je 5 MB, takže dosud musela obrázek zmenšovat ručně.
 *
 * Zmenšení dělá prohlížeč ještě před odesláním: obrázek se vykreslí do canvasu
 * na rozumnou tiskovou i webovou velikost a uloží se jako JPEG. Menší obrázek,
 * než je limit, se nechá být, aby se zbytečně nepřekódovával.
 *
 * Kvalita zůstává vysoká: delší strana 2000 px pokryje i retina displeje a
 * kvalita 0,85 je vizuálně nerozlišitelná od originálu.
 */

export const MAX_IMAGE_EDGE = 2000;
export const IMAGE_QUALITY = 0.85;
/** Nad tuhle velikost se obrázek vždycky přepočítá. */
export const PROCESS_ABOVE_BYTES = 1_500_000;

export type ImagePlan =
  | { action: "keep"; reason: "small_enough" | "unsupported_type" }
  | { action: "resize"; targetWidth: number; targetHeight: number };

/**
 * Rozhodnutí, co s obrázkem udělat. Čistá funkce, aby se pravidlo dalo otestovat
 * bez prohlížeče.
 */
export function planImageProcessing(input: {
  type: string;
  size: number;
  width: number;
  height: number;
}): ImagePlan {
  if (!["image/jpeg", "image/png", "image/webp"].includes(input.type)) {
    return { action: "keep", reason: "unsupported_type" };
  }

  const longestEdge = Math.max(input.width, input.height);
  if (input.size <= PROCESS_ABOVE_BYTES && longestEdge <= MAX_IMAGE_EDGE) {
    return { action: "keep", reason: "small_enough" };
  }

  const scale = longestEdge > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longestEdge : 1;
  return {
    action: "resize",
    targetWidth: Math.max(1, Math.round(input.width * scale)),
    targetHeight: Math.max(1, Math.round(input.height * scale))
  };
}

export function processedFileName(originalName: string) {
  const base = originalName.replace(/\.[^.]+$/, "") || "obrazek";
  return `${base}.jpg`;
}

/**
 * Zmenší obrázek v prohlížeči. Vrátí původní soubor, když zmenšovat netřeba
 * nebo když se to nepovede – upload pak proběhne jako dřív.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const plan = planImageProcessing({
      type: file.type,
      size: file.size,
      width: bitmap.width,
      height: bitmap.height
    });

    if (plan.action === "keep") {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = plan.targetWidth;
    canvas.height = plan.targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close?.();
      return file;
    }

    // Průhlednost by se v JPEGu vykreslila černě, proto podklad.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", IMAGE_QUALITY);
    });

    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File([blob], processedFileName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  } catch {
    return file;
  }
}
