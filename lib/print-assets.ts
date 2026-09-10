/**
 * R27: soubory, které se zapékají do tiskového PDF.
 *
 * Font i ilustrace leží v repozitáři (assets/print), ne v public/ a ne na CDN.
 * Do PDF se vkládají jako data, takže stažené PDF funguje i bez internetu.
 * Aby je serverless funkce na Vercelu opravdu měla u sebe, je adresář uvedený
 * v next.config.mjs v outputFileTracingIncludes.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PRINT_ICON_NAMES, type PrintIconName } from "./print-document";
import type { PrintPdfAssets } from "./print-pdf";

const ASSET_ROOT = path.join(process.cwd(), "assets", "print");

let cached: Promise<PrintPdfAssets> | null = null;

async function readAsset(...segments: string[]) {
  const buffer = await readFile(path.join(ASSET_ROOT, ...segments));
  return new Uint8Array(buffer);
}

async function loadPrintAssetsOnce(): Promise<PrintPdfAssets> {
  const [regularFont, boldFont] = await Promise.all([
    readAsset("fonts", "DejaVuSans.ttf"),
    readAsset("fonts", "DejaVuSans-Bold.ttf")
  ]);

  const iconEntries = await Promise.all(
    PRINT_ICON_NAMES.map(async (name) => [name, await readAsset("illustrations", `${name}.png`)] as const)
  );

  const icons: Partial<Record<PrintIconName, Uint8Array>> = {};
  for (const [name, bytes] of iconEntries) {
    icons[name] = bytes;
  }

  return { regularFont, boldFont, icons };
}

export function loadPrintAssets() {
  if (!cached) {
    cached = loadPrintAssetsOnce().catch((error) => {
      // Bez cache se příští požadavek zkusí znovu – jinak by jedna chyba při
      // startu funkce zablokovala tisk až do dalšího nasazení.
      cached = null;
      throw error;
    });
  }
  return cached;
}
