import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const routeModuleBundle = require(path.join(projectRoot, '.next/server/app/api/export/game-content/route.js'));

process.env.ADMIN_BASIC_USER = process.env.ADMIN_BASIC_USER || 'local-review-export';
process.env.ADMIN_BASIC_PASS = process.env.ADMIN_BASIC_PASS || 'local-review-export-pass';

const authHeader = `Basic ${Buffer.from(`${process.env.ADMIN_BASIC_USER}:${process.env.ADMIN_BASIC_PASS}`).toString('base64')}`;
const request = new Request('http://localhost/api/export/game-content?format=json', {
  headers: { authorization: authHeader }
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
      location.episodes.set(row.episodeIndex, { meta: null, tasks: [], clues: [] });
    }
    const episode = location.episodes.get(row.episodeIndex);
    if (row.section === 'episode') episode.meta = row;
    if (row.section === 'task') episode.tasks.push(row);
    if (row.section === 'clue') episode.clues.push(row);
  }
}

const parts = [];
parts.push('# Batoh v pubertě - kompletní revize textů');
parts.push('');
parts.push(`Vygenerováno: ${new Date().toLocaleString('cs-CZ')}`);
parts.push('');
parts.push('Poznámka: Toto je interní revizní export z kanonického obsahu hry. Obsahuje i správné odpovědi a whitelisty.');
parts.push('');

for (const location of Array.from(byLocation.values()).sort((a, b) => `${a.city} ${a.locationName}`.localeCompare(`${b.city} ${b.locationName}`, 'cs'))) {
  parts.push('---');
  parts.push('');
  parts.push(`## ${location.locationName}`);
  parts.push(`Město: ${location.city}`);
  parts.push(`ID lokace: ${location.locationId}`);
  parts.push('');
  parts.push('### Intro mise');
  parts.push(location.intro?.content || '');
  parts.push('');

  if (location.interludes.length > 0) {
    parts.push('### Mezitexty');
    for (const interlude of location.interludes.sort((a, b) => a.taskIndex - b.taskIndex)) {
      parts.push(`- ${interlude.content}`);
    }
    parts.push('');
  }

  for (const [, episode] of Array.from(location.episodes.entries()).sort((a, b) => a[0] - b[0])) {
    parts.push(`### ${episode.meta?.title || 'Zastavení'}`);
    parts.push('');
    if (episode.meta?.content) {
      parts.push(episode.meta.content);
      parts.push('');
    }

    for (const task of episode.tasks.sort((a, b) => a.taskIndex - b.taskIndex)) {
      parts.push(`#### Úkol ${task.taskIndex}: ${task.title}`);
      parts.push(`Typ: ${task.taskType || 'neuveden'}`);
      parts.push(task.content || '');
      if (task.options) {
        parts.push(`Možnosti: ${task.options}`);
      }
      if (task.acceptedAnswers) {
        parts.push(`Správná odpověď / whitelist: ${task.acceptedAnswers}`);
      }
      if (task.illustrationImage) {
        parts.push(`Obrázek: ${task.illustrationImage}`);
      }
      parts.push(`ID: ${task.itemId}`);
      parts.push('');
    }

    if (episode.clues.length > 0) {
      parts.push('#### Stopy / nápovědy');
      for (const clue of episode.clues.sort((a, b) => a.taskIndex - b.taskIndex)) {
        parts.push(`- ${clue.content}`);
      }
      parts.push('');
    }
  }
}

const exportDir = path.join(projectRoot, 'exports');
await mkdir(exportDir, { recursive: true });
const markdownPath = path.join(exportDir, 'batoh-v-puberte-revize-textu.md');
await writeFile(markdownPath, parts.join('\n'), 'utf8');
console.log(JSON.stringify({ markdownPath, totalRows: rows.length, totalLocations: byLocation.size }, null, 2));
