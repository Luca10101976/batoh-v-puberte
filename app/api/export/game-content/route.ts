import { NextResponse } from "next/server";
import { locations } from "@/lib/mock-data";
import { taskAnswers } from "@/lib/task-answers";

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

function buildRows(): ExportRow[] {
  const rows: ExportRow[] = [];

  for (const location of locations) {
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
          acceptedAnswers: (taskAnswers[task.id] ?? []).join(" | ")
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

export function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  const rows = buildRows();

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
