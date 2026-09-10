import { NextResponse } from "next/server";
import { constantTimeEquals } from "@/lib/constant-time";
import { locations } from "@/lib/mock-data";
import { getGameplayLocation, getGameplayLocationForExport, getPublishedLocationIds } from "@/lib/gameplay-server";
import { loadPrintAssets } from "@/lib/print-assets";
import { buildPrintDocument, type PrintableLocation } from "@/lib/print-document";
import { renderPrintPdf } from "@/lib/print-pdf";
import type { GameplayEpisode, GameplayTask , PublicGameplayEpisode, PublicGameplayTask } from "@/lib/gameplay-types";

type ExportRow = {
  city: string;
  locationId: string;
  locationName: string;
  section: "location" | "episode" | "task" | "clue" | "interlude";
  episodeIndex: number;
  taskIndex: number;
  itemId: string;
  title: string;
  content: string;
  taskType: string;
  illustrationImage: string;
  options: string;
  acceptedAnswers: string;
};

function unauthorizedAdminExportResponse() {
  return new NextResponse("Mozek vyžaduje přihlášení.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Mozek", charset="UTF-8"'
    }
  });
}

function parseBasicAuth(authorization: string) {
  if (!authorization.startsWith("Basic ")) {
    return null;
  }

  const encoded = authorization.slice(6).trim();
  if (!encoded) {
    return null;
  }

  try {
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}

async function isAuthorizedForAdminExport(request: Request) {
  const expectedUser = process.env.ADMIN_BASIC_USER?.trim();
  const expectedPass = process.env.ADMIN_BASIC_PASS?.trim();

  if (!expectedUser || !expectedPass) {
    return { ok: false as const, missingConfig: true as const };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const credentials = parseBasicAuth(authorization);
  if (!credentials) {
    return { ok: false as const, missingConfig: false as const };
  }

  const [userMatches, passMatches] = await Promise.all([
    constantTimeEquals(credentials.username, expectedUser),
    constantTimeEquals(credentials.password, expectedPass)
  ]);
  if (!userMatches || !passMatches) {
    return { ok: false as const, missingConfig: false as const };
  }

  return { ok: true as const, missingConfig: false as const };
}

function csvEscape(value: string | number) {
  const raw = String(value ?? "");
  const escaped = raw.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

function toCsv(rows: ExportRow[]) {
  const headers: Array<keyof ExportRow> = [
    "city",
    "locationId",
    "locationName",
    "section",
    "episodeIndex",
    "taskIndex",
    "itemId",
    "title",
    "content",
    "taskType",
    "illustrationImage",
    "options",
    "acceptedAnswers"
  ];

  const lines = [
    headers.join(";"),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(";"))
  ];

  return "\uFEFF" + lines.join("\n");
}

function isPresent<T>(location: T | null): location is T {
  return location !== null;
}

/**
 * R27: tiskový sešit odchází jako hotové PDF.
 *
 * Dřív se posílalo HTML, které si ilustrace tahalo z /_next/image. Po stažení na
 * disk se z nich staly rozbité obrázky, protože stránka už neměla svůj původ.
 * PDF se sází na serveru (lib/print-pdf.ts) a font i ilustrace nese uvnitř, takže
 * stažený soubor vypadá stejně i bez internetu, bez postope.cz a bez Supabase.
 */
async function buildPrintablePdf(locationId?: string) {
  const printableIds = locationId ? [locationId] : await getPublishedLocationIds();
  const gameplayLocations = (await Promise.all(printableIds.map((id) => getGameplayLocation(id)))).filter(
    isPresent
  );
  const printableLocations: PrintableLocation[] = gameplayLocations.map((location) => ({
    id: location.id,
    city: location.city,
    name: location.name,
    teaser: location.teaser,
    introStory: location.introStory,
    story: location.story,
    episodes: location.episodes
  }));

  const printDocument = buildPrintDocument(printableLocations);
  const assets = await loadPrintAssets();
  const bytes = await renderPrintPdf(printDocument, assets);
  return { bytes, printDocument };
}

async function buildRows(locationId?: string): Promise<ExportRow[]> {
  const rows: ExportRow[] = [];
  const exportIds = locationId ? [locationId] : await getPublishedLocationIds();
  // R25: administrační export za heslem je jediné místo, které smí vidět odpovědi.
  const gameplayLocations = (await Promise.all(exportIds.map((id) => getGameplayLocationForExport(id)))).filter(
    isPresent
  );

  for (const location of gameplayLocations) {
    rows.push({
      city: location.city,
      locationId: location.id,
      locationName: location.name,
      section: "location",
      episodeIndex: 0,
      taskIndex: 0,
      itemId: `${location.id}-intro`,
      title: `${location.name} – intro`,
      content: `${location.introStory}\n\n${location.story}`,
      taskType: "",
      illustrationImage: "",
      options: "",
      acceptedAnswers: ""
    });

    location.interludes.forEach((interlude, interludeIndex) => {
      rows.push({
        city: location.city,
        locationId: location.id,
        locationName: location.name,
        section: "interlude",
        episodeIndex: 0,
        taskIndex: interludeIndex + 1,
        itemId: `${location.id}-interlude-${interludeIndex + 1}`,
        title: `Mezitext ${interludeIndex + 1}`,
        content: interlude,
        taskType: "",
        illustrationImage: "",
        options: "",
        acceptedAnswers: ""
      });
    });

    location.episodes.forEach((episode, episodeIndex) => {
      rows.push({
        city: location.city,
        locationId: location.id,
        locationName: location.name,
        section: "episode",
        episodeIndex: episodeIndex + 1,
        taskIndex: 0,
        itemId: episode.id,
        title: episode.name,
        content: `${episode.intro}\n\n${episode.background}`,
        taskType: "",
        illustrationImage: "",
        options: "",
        acceptedAnswers: ""
      });

      episode.tasks.forEach((task, taskIndex) => {
        rows.push({
          city: location.city,
          locationId: location.id,
          locationName: location.name,
          section: "task",
          episodeIndex: episodeIndex + 1,
          taskIndex: taskIndex + 1,
          itemId: task.id,
          title: task.title,
          content: task.content,
          taskType: task.type,
          illustrationImage: task.illustrationImage ?? "",
          options: task.options?.join(" | ") ?? "",
          acceptedAnswers: task.correctAnswers.join(" | ")
        });
      });

      episode.clue.forEach((clue, clueIndex) => {
        rows.push({
          city: location.city,
          locationId: location.id,
          locationName: location.name,
          section: "clue",
          episodeIndex: episodeIndex + 1,
          taskIndex: clueIndex + 1,
          itemId: `${episode.id}-clue-${clueIndex + 1}`,
          title: `Stopa ${clueIndex + 1}`,
          content: clue,
          taskType: "",
          illustrationImage: "",
          options: "",
          acceptedAnswers: ""
        });
      });
    });
  }

  return rows;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  const locationId = url.searchParams.get("locationId") ?? "";

  if (format === "print" || format === "pdf") {
    const { bytes } = await buildPrintablePdf(locationId || undefined);
    const fileName = locationId ? `traki-tiskovy-sesit-${locationId}.pdf` : "traki-tiskovy-sesit.pdf";
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
      }
    });
  }

  const adminAccess = await isAuthorizedForAdminExport(request);
  if (!adminAccess.ok) {
    if (adminAccess.missingConfig) {
      return NextResponse.json({ ok: false, error: "missing_admin_basic_auth_env" }, { status: 503 });
    }
    return unauthorizedAdminExportResponse();
  }

  const rows = await buildRows(locationId || undefined);

  if (format === "json") {
    return NextResponse.json(
      {
        exportedAt: new Date().toISOString(),
        totalRows: rows.length,
        rows
      },
      {
        headers: {
          "Content-Disposition": 'attachment; filename="batuzek-ukoly-a-texty.json"'
        }
      }
    );
  }

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="batuzek-ukoly-a-texty.csv"'
    }
  });
}
