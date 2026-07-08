import { NextResponse } from "next/server";
import { constantTimeEquals } from "@/lib/constant-time";
import { locations } from "@/lib/mock-data";
import { getGameplayLocation, getPublishedLocationIds } from "@/lib/gameplay-server";
import type { GameplayEpisode, GameplayTask } from "@/lib/gameplay-types";

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatStopCount(count: number) {
  if (count === 1) {
    return "1 zastavení";
  }
  if (count >= 2 && count <= 4) {
    return `${count} zastavení`;
  }
  return `${count} zastavení`;
}

type PrintableLocation = {
  id: string;
  city: string;
  name: string;
  teaser: string;
  introStory: string;
  story: string;
  endingTitle: string;
  endingStory: string;
  playerMessage: string;
  episodes: GameplayEpisode[];
};

function isPrintableSourceLocation(
  location: Awaited<ReturnType<typeof getGameplayLocation>>
): location is NonNullable<Awaited<ReturnType<typeof getGameplayLocation>>> {
  return location !== null;
}

function renderPrintableTask(task: GameplayTask, taskIndex: number) {
  const options =
    task.options && task.options.length > 0
      ? `<div class="task-meta"><strong>Možnosti:</strong> ${escapeHtml(task.options.join(" | "))}</div>`
      : "";
  const answerLine =
    task.type === "photo"
      ? `<div class="answer-line">Splněno na místě: .................................................................</div>`
      : `<div class="answer-line">Odpověď: ....................................................................................</div>`;

  return `
    <li class="task-card">
      <div class="task-head">Úkol ${taskIndex + 1} • ${escapeHtml(task.title)}</div>
      <div class="task-copy">${escapeHtml(task.content)}</div>
      ${options}
      ${answerLine}
    </li>
  `;
}

function renderPrintableEpisode(episode: GameplayEpisode, episodeIndex: number) {
  const taskList = episode.tasks.map((task, taskIndex) => renderPrintableTask(task, taskIndex)).join("");

  return `
    <section class="episode-card">
      <div class="episode-kicker">Zastavení ${episodeIndex + 1}</div>
      <h3>${escapeHtml(episode.name)}</h3>
      <p class="episode-intro">${escapeHtml(episode.intro)}</p>
      <p class="episode-bg">${escapeHtml(episode.background)}</p>
      <ol class="tasks-list">${taskList}</ol>
    </section>
  `;
}

function renderPrintableLocation(location: PrintableLocation) {
  const episodeSections = location.episodes.map((episode, episodeIndex) => renderPrintableEpisode(episode, episodeIndex)).join("");

  return `
    <section class="location-page">
      <header class="location-hero">
        <div class="location-kicker">${escapeHtml(location.city)} • ${escapeHtml(formatStopCount(location.episodes.length))}</div>
        <h2>${escapeHtml(location.name)}</h2>
        <p>${escapeHtml(location.teaser)}</p>
      </header>
      <section class="story-card">
        <h3>Příběh mise</h3>
        <p>${escapeHtml(location.introStory)}</p>
        <p>${escapeHtml(location.story)}</p>
      </section>
      ${episodeSections}
      <section class="final-card">
        <h3>Závěr mise</h3>
        <p class="final-title">${escapeHtml(location.endingTitle)}</p>
        <p>${escapeHtml(location.endingStory)}</p>
        <p>${escapeHtml(location.playerMessage)}</p>
      </section>
      <section class="score-box">
        <div class="score-title">Výsledek hráče</div>
        <div>Jméno: ...............................................................</div>
        <div>Správně: ............</div>
        <div>Nevím: ............</div>
        <div>Body celkem: ............</div>
      </section>
    </section>
  `;
}

async function buildPrintableHtml(locationId?: string) {
  const printableIds = locationId ? [locationId] : await getPublishedLocationIds();
  const gameplayLocations = (await Promise.all(printableIds.map((id) => getGameplayLocation(id)))).filter(
    isPrintableSourceLocation
  );
  const printableLocations: PrintableLocation[] = gameplayLocations.map((location) => ({
    id: location.id,
    city: location.city,
    name: location.name,
    teaser: location.teaser,
    introStory: location.introStory,
    story: location.story,
    endingTitle: location.endingTitle,
    endingStory: location.endingStory,
    playerMessage: location.playerMessage,
    episodes: location.episodes
  }));

  const title = printableLocations.length === 1 ? printableLocations[0].name : "Pan Batůžek - herní sešit";

  const locationSections =
    printableLocations.length > 0
      ? printableLocations.map((location) => renderPrintableLocation(location)).join("")
      : `
        <section class="location-page">
          <section class="story-card">
            <h3>Tisková verze není dostupná</h3>
            <p>Pro tuhle misi teď nemáme připravený živý tiskový export.</p>
          </section>
        </section>
      `;

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - tisk</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body {
        font-family: "Inter", "Segoe UI", "Arial", sans-serif;
        line-height: 1.45;
        color: #112038;
        margin: 0;
        background: #f5f8ff;
      }
      h1, h2, h3 { margin: 0; line-height: 1.2; }
      p { margin: 0; }
      .sheet-header {
        border-radius: 16px;
        padding: 14px 16px;
        margin-bottom: 12px;
        color: #fff;
        background: linear-gradient(135deg, #0f2142 0%, #1f3a71 70%, #3a4f87 100%);
      }
      .sheet-title { font-size: 24px; font-weight: 800; }
      .sheet-sub { margin-top: 6px; font-size: 13px; color: rgba(255,255,255,0.9); }
      .location-page {
        page-break-after: always;
        border: 1px solid #d9e5ff;
        border-radius: 16px;
        background: #fff;
        overflow: hidden;
        margin-bottom: 10px;
      }
      .location-page:last-child { page-break-after: auto; }
      .location-hero {
        padding: 16px;
        color: #fff;
        background: radial-gradient(circle at top right, rgba(182,240,122,0.28), transparent 45%), linear-gradient(135deg, #0f2142 0%, #1f3a71 70%, #2e4f82 100%);
      }
      .location-kicker {
        font-size: 11px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.82);
      }
      .location-hero h2 { margin-top: 8px; font-size: 28px; }
      .location-hero p { margin-top: 6px; font-size: 14px; color: rgba(255,255,255,0.92); }
      .story-card, .episode-card, .final-card, .score-box {
        margin: 12px;
        border: 1px solid #dfe8ff;
        border-radius: 14px;
        padding: 12px;
        background: #fbfdff;
      }
      .story-card h3, .episode-card h3, .final-card h3 { font-size: 17px; margin-bottom: 8px; }
      .story-card p + p { margin-top: 8px; }
      .episode-kicker {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #1f3a71;
        background: #e8f0ff;
        margin-bottom: 8px;
      }
      .episode-intro {
        margin-top: 8px;
        font-weight: 700;
      }
      .episode-bg {
        margin-top: 8px;
        color: #2c3f60;
      }
      .tasks-list {
        margin: 10px 0 0;
        padding: 0;
        list-style: none;
      }
      .task-card {
        border: 1px dashed #c6d6ff;
        border-radius: 12px;
        padding: 10px;
        background: #ffffff;
      }
      .task-card + .task-card { margin-top: 8px; }
      .task-head { font-size: 14px; font-weight: 800; margin-bottom: 5px; }
      .task-copy { font-size: 14px; }
      .task-meta {
        margin-top: 6px;
        font-size: 13px;
        color: #38548c;
      }
      .answer-line {
        margin-top: 8px;
        font-size: 14px;
        color: #2a3f6b;
      }
      .final-title { font-weight: 800; margin-bottom: 6px; }
      .final-card p + p { margin-top: 8px; }
      .score-box {
        border-color: #b9d595;
        background: #f8fff0;
      }
      .score-title {
        font-size: 15px;
        font-weight: 800;
        color: #324f1a;
        margin-bottom: 8px;
      }
      .score-box div + div { margin-top: 6px; }
      .print-note {
        margin: 0 2px 10px;
        font-size: 12px;
        color: #556b90;
      }
      .sheet-footer {
        border-radius: 16px;
        padding: 14px 16px;
        margin-top: 4px;
        color: #fff;
        background: linear-gradient(135deg, #0f2142 0%, #1f3a71 70%, #3a4f87 100%);
        page-break-inside: avoid;
      }
      .sheet-footer .cta-title { font-size: 16px; font-weight: 800; }
      .sheet-footer .cta-url {
        margin-top: 6px;
        font-size: 20px;
        font-weight: 800;
        letter-spacing: 0.04em;
        color: #b6f07a;
      }
      .sheet-footer .cta-sub { margin-top: 6px; font-size: 12px; color: rgba(255,255,255,0.88); }
    </style>
  </head>
  <body>
    <header class="sheet-header">
      <div class="sheet-title">Pan Batůžek - tisková hra</div>
      <div class="sheet-sub">Vytiskni, hraj venku, doma přepiš výsledek do aplikace na www.postope.cz</div>
    </header>
    <p class="print-note">Tip: ideální je oboustranný tisk. Odpovědi piš přímo do listu.</p>
    ${locationSections}
    <footer class="sheet-footer">
      <div class="cta-title">Bavilo tě to? Zahraj si další hry v aplikaci</div>
      <div class="cta-url">www.postope.cz</div>
      <div class="cta-sub">Body za odpovědi, žebříček s kamarády a nové mise. Funguje na mobilu, bez instalace a zdarma.</div>
    </footer>
  </body>
</html>`;
}

async function buildRows(locationId?: string): Promise<ExportRow[]> {
  const rows: ExportRow[] = [];
  const exportIds = locationId ? [locationId] : await getPublishedLocationIds();
  const gameplayLocations = (await Promise.all(exportIds.map((id) => getGameplayLocation(id)))).filter(
    isPrintableSourceLocation
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

  if (format === "print") {
    const html = await buildPrintableHtml(locationId || undefined);
    const fileName = locationId ? `pan-batuzek-${locationId}-tisk.html` : "pan-batuzek-tiskovy-sesit.html";
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`
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
