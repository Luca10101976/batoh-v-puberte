import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const routeModuleBundle = require(path.join(projectRoot, '.next/server/app/api/export/game-content/route.js'));
const { chromium } = require('/Users/lucielejnarova/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

process.env.ADMIN_BASIC_USER = process.env.ADMIN_BASIC_USER || 'local-review-export';
process.env.ADMIN_BASIC_PASS = process.env.ADMIN_BASIC_PASS || 'local-review-export-pass';

const authHeader = `Basic ${Buffer.from(`${process.env.ADMIN_BASIC_USER}:${process.env.ADMIN_BASIC_PASS}`).toString('base64')}`;
const request = new Request('http://localhost/api/export/game-content?format=json', {
  headers: {
    authorization: authHeader
  }
});

const response = await routeModuleBundle.routeModule.userland.GET(request);
if (!response.ok) {
  const text = await response.text();
  throw new Error(`Export route failed: ${response.status} ${text}`);
}

const payload = await response.json();
const rows = Array.isArray(payload?.rows) ? payload.rows : [];

const byLocation = new Map();
for (const row of rows) {
  const key = row.locationId;
  if (!byLocation.has(key)) {
    byLocation.set(key, {
      city: row.city,
      locationId: row.locationId,
      locationName: row.locationName,
      intro: null,
      interludes: [],
      episodes: new Map()
    });
  }

  const location = byLocation.get(key);
  if (row.section === 'location') {
    location.intro = row;
    continue;
  }

  if (row.section === 'interlude') {
    location.interludes.push(row);
    continue;
  }

  if (row.section === 'episode' || row.section === 'task' || row.section === 'clue') {
    if (!location.episodes.has(row.episodeIndex)) {
      location.episodes.set(row.episodeIndex, {
        meta: null,
        tasks: [],
        clues: []
      });
    }

    const episode = location.episodes.get(row.episodeIndex);
    if (row.section === 'episode') {
      episode.meta = row;
    } else if (row.section === 'task') {
      episode.tasks.push(row);
    } else if (row.section === 'clue') {
      episode.clues.push(row);
    }
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMultiline(value) {
  return escapeHtml(value).replace(/\n/g, '<br />');
}

function badge(label) {
  return `<span class="badge">${escapeHtml(label)}</span>`;
}

const locationBlocks = Array.from(byLocation.values())
  .sort((a, b) => `${a.city} ${a.locationName}`.localeCompare(`${b.city} ${b.locationName}`, 'cs'))
  .map((location, locationIndex) => {
    const episodesHtml = Array.from(location.episodes.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, episode], episodeIndex) => {
        const tasksHtml = episode.tasks
          .sort((a, b) => a.taskIndex - b.taskIndex)
          .map((task) => {
            const options = task.options
              ? `<div class="meta"><strong>Možnosti:</strong> ${formatMultiline(task.options)}</div>`
              : '';
            const answers = task.acceptedAnswers
              ? `<div class="meta answer"><strong>Správná odpověď / whitelist:</strong> ${formatMultiline(task.acceptedAnswers)}</div>`
              : '<div class="meta answer"><strong>Správná odpověď:</strong> neuvedena</div>';
            const taskType = task.taskType ? badge(task.taskType) : '';
            const image = task.illustrationImage
              ? `<div class="meta"><strong>Obrázek:</strong> ${escapeHtml(task.illustrationImage)}</div>`
              : '';
            return `
              <li class="task-card">
                <div class="task-head">
                  <div>
                    <div class="eyebrow">Úkol ${task.taskIndex}</div>
                    <h5>${escapeHtml(task.title)}</h5>
                  </div>
                  <div>${taskType}</div>
                </div>
                <div class="copy">${formatMultiline(task.content)}</div>
                ${options}
                ${answers}
                ${image}
                <div class="trace">ID: ${escapeHtml(task.itemId)}</div>
              </li>
            `;
          })
          .join('');

        const cluesHtml = episode.clues
          .sort((a, b) => a.taskIndex - b.taskIndex)
          .map((clue) => `<li>${formatMultiline(clue.content)}</li>`)
          .join('');

        return `
          <section class="episode-card">
            <div class="episode-kicker">Zastavení ${episodeIndex + 1}</div>
            <h4>${escapeHtml(episode.meta?.title || `Zastavení ${episodeIndex + 1}`)}</h4>
            <div class="copy">${formatMultiline(episode.meta?.content || '')}</div>
            ${tasksHtml ? `<ol class="tasks-list">${tasksHtml}</ol>` : ''}
            ${cluesHtml ? `<div class="clue-box"><strong>Stopy / nápovědy:</strong><ul>${cluesHtml}</ul></div>` : ''}
          </section>
        `;
      })
      .join('');

    const interludesHtml = location.interludes.length
      ? `
        <section class="interlude-box">
          <h4>Mezitexty</h4>
          <ul>
            ${location.interludes
              .sort((a, b) => a.taskIndex - b.taskIndex)
              .map((item) => `<li>${formatMultiline(item.content)}</li>`)
              .join('')}
          </ul>
        </section>
      `
      : '';

    return `
      <section class="location-page">
        <header class="location-hero">
          <div class="location-kicker">Lokace ${locationIndex + 1}</div>
          <h2>${escapeHtml(location.locationName)}</h2>
          <p>${escapeHtml(location.city)}</p>
        </header>
        <section class="intro-card">
          <h3>Intro mise</h3>
          <div class="copy">${formatMultiline(location.intro?.content || '')}</div>
          <div class="trace">ID lokace: ${escapeHtml(location.locationId)}</div>
        </section>
        ${interludesHtml}
        ${episodesHtml}
      </section>
    `;
  })
  .join('');

const generatedAt = new Date().toLocaleString('cs-CZ', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

const html = `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Batoh v pubertě - revize textů</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, Arial, sans-serif;
        color: #142235;
        background: #eef4ff;
        line-height: 1.5;
      }
      h1,h2,h3,h4,h5,p { margin: 0; }
      .header {
        padding: 20px;
        border-radius: 18px;
        color: white;
        background: linear-gradient(135deg, #0f2142 0%, #22457f 75%, #3e68a5 100%);
        margin-bottom: 12px;
      }
      .header h1 { font-size: 28px; font-weight: 800; }
      .header p { margin-top: 6px; font-size: 14px; color: rgba(255,255,255,0.92); }
      .note {
        margin: 0 2px 14px;
        color: #536b93;
        font-size: 12px;
      }
      .location-page {
        page-break-after: always;
        margin-bottom: 12px;
        border: 1px solid #d5e1f8;
        border-radius: 18px;
        overflow: hidden;
        background: white;
      }
      .location-page:last-child { page-break-after: auto; }
      .location-hero {
        padding: 18px;
        color: white;
        background: radial-gradient(circle at top right, rgba(190,247,121,0.25), transparent 32%), linear-gradient(135deg, #112341 0%, #1c3968 72%, #2a4f84 100%);
      }
      .location-kicker, .episode-kicker, .eyebrow {
        font-size: 11px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }
      .location-hero h2 { margin-top: 8px; font-size: 28px; }
      .location-hero p { margin-top: 6px; color: rgba(255,255,255,0.88); }
      .intro-card, .interlude-box, .episode-card {
        margin: 12px;
        border: 1px solid #dfe7fb;
        border-radius: 14px;
        background: #fbfdff;
        padding: 14px;
      }
      .intro-card h3, .interlude-box h4, .episode-card h4 { margin-bottom: 8px; }
      .copy { white-space: normal; font-size: 14px; color: #203553; }
      .trace { margin-top: 8px; font-size: 11px; color: #7188ad; }
      .tasks-list { list-style: none; padding: 0; margin: 12px 0 0; }
      .task-card {
        border: 1px dashed #bfd0f1;
        border-radius: 12px;
        background: white;
        padding: 12px;
      }
      .task-card + .task-card { margin-top: 8px; }
      .task-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        margin-bottom: 8px;
      }
      .task-head h5 { font-size: 18px; line-height: 1.2; }
      .badge {
        display: inline-block;
        border-radius: 999px;
        padding: 4px 10px;
        background: #e8f0ff;
        color: #264a83;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
      }
      .meta {
        margin-top: 8px;
        font-size: 13px;
        color: #355283;
      }
      .answer {
        padding: 8px 10px;
        border-radius: 10px;
        background: #f4fbeb;
        color: #2d4d17;
        border: 1px solid #cfe6ac;
      }
      .clue-box {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 10px;
        background: #f7faff;
        border: 1px solid #d7e3fb;
      }
      .clue-box ul, .interlude-box ul { margin: 8px 0 0 18px; padding: 0; }
      .clue-box li, .interlude-box li { margin-top: 4px; }
    </style>
  </head>
  <body>
    <header class="header">
      <h1>Batoh v pubertě - kompletní revize textů</h1>
      <p>Kanonický export hry včetně zastavení, úkolů, možností a správných odpovědí.</p>
      <p>Vygenerováno: ${escapeHtml(generatedAt)}</p>
    </header>
    <p class="note">Tento PDF export je interní revizní verze, ne hráčský tisk. Obsahuje i správné odpovědi a whitelisty pro kontrolu obsahu.</p>
    ${locationBlocks}
  </body>
</html>`;

const exportDir = path.join(projectRoot, 'exports');
await mkdir(exportDir, { recursive: true });
const htmlPath = path.join(exportDir, 'batoh-v-puberte-revize-textu.html');
const pdfPath = path.join(exportDir, 'batoh-v-puberte-revize-textu.pdf');
await writeFile(htmlPath, html, 'utf8');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' }
});
await browser.close();

console.log(JSON.stringify({ htmlPath, pdfPath, totalRows: rows.length, totalLocations: byLocation.size }, null, 2));
