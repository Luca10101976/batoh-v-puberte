#!/usr/bin/env node

// Kontrola driftu: supabase/schema.sql vs. skutečná produkce.
//
// Porovnává tabulky, sloupce a cizí klíče, které produkce vydává přes PostgREST
// (OpenAPI popis na /rest/v1/). Nepotřebuje účtový token – jen klíč projektu
// z .env.local nebo prostředí (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
// případně NEXT_PUBLIC_SUPABASE_ANON_KEY). Nic nezapisuje. Do repozitáře se
// žádný klíč neukládá.
//
// Co nehlídá: omezení, indexy, spouštěče, funkce a politiky – ty vydá jen katalog
// (npm run schema:snapshot a git diff). Tohle je rychlá pojistka na nejčastější
// drift: sloupec přidaný ručně mimo migraci.
//
// Konec: 0 = bez driftu, 1 = drift, 2 = nelze ověřit (chybí přístup).

import fs from "node:fs";
import path from "node:path";

function nactiEnv() {
  const env = { ...process.env };
  const soubor = path.resolve(".env.local");
  if (fs.existsSync(soubor)) {
    for (const radek of fs.readFileSync(soubor, "utf8").split("\n")) {
      const i = radek.indexOf("="); if (i < 0 || radek.trim().startsWith("#")) continue;
      const k = radek.slice(0, i).trim(); if (!(k in env)) env[k] = radek.slice(i + 1).trim().replace(/^"|"$/g, "");
    }
  }
  return env;
}

function zeSnimku(sql) {
  const tabulky = {};
  for (const m of sql.matchAll(/^create table public\.("?[a-z_]+"?) \(\n([\s\S]*?)\n\);/gm)) {
    const nazev = m[1].replace(/"/g, "");
    tabulky[nazev] = { sloupce: new Set(), fk: new Set() };
    for (const r of m[2].split("\n")) { const s = r.trim().match(/^"?([a-z_]+)"?\s/); if (s) tabulky[nazev].sloupce.add(s[1]); }
  }
  for (const m of sql.matchAll(/^alter table public\.("?[a-z_]+"?) add constraint \S+ FOREIGN KEY \(([^)]+)\) REFERENCES (?:public\.)?([a-z_.]+)\(/gm)) {
    const t = m[1].replace(/"/g, ""); const cil = m[3].replace(/^public\./, "");
    if (cil.includes(".")) continue; // mimo public (auth.users) PostgREST nevidí
    const sloupce = m[2].split(",").map((c) => c.trim());
    if (sloupce.length > 1) continue; // složený klíč PostgREST nepopisuje – hlídá ho snímek z katalogu
    tabulky[t]?.fk.add(`${sloupce[0]} → ${cil}`);
  }
  return tabulky;
}

async function zProdukce(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, klic = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !klic) return null;
  const r = await fetch(`${url}/rest/v1/`, { headers: { apikey: klic, Authorization: `Bearer ${klic}`, Accept: "application/openapi+json" } });
  if (!r.ok) throw new Error(`PostgREST ${r.status}`);
  const spec = await r.json();
  const tabulky = {};
  for (const [nazev, def] of Object.entries(spec.definitions ?? {})) {
    tabulky[nazev] = { sloupce: new Set(Object.keys(def.properties ?? {})), fk: new Set() };
    for (const [sloupec, p] of Object.entries(def.properties ?? {})) {
      const fk = (p.description ?? "").match(/<fk table='([a-z_]+)' column='[a-z_]+'\/>/);
      if (fk) tabulky[nazev].fk.add(`${sloupec} → ${fk[1]}`);
    }
  }
  return tabulky;
}

const env = nactiEnv();
const snimek = zeSnimku(fs.readFileSync(path.resolve("supabase/schema.sql"), "utf8"));
const produkce = await zProdukce(env);
if (!produkce) { console.log("Kontrola driftu přeskočena: chybí NEXT_PUBLIC_SUPABASE_URL / klíč."); process.exit(2); }

const chyby = [];
const vse = new Set([...Object.keys(snimek), ...Object.keys(produkce)]);
for (const t of [...vse].sort()) {
  if (!snimek[t]) { chyby.push(`tabulka ${t}: na produkci je, ve snímku chybí`); continue; }
  if (!produkce[t]) { chyby.push(`tabulka ${t}: ve snímku je, na produkci není`); continue; }
  for (const s of produkce[t].sloupce) if (!snimek[t].sloupce.has(s)) chyby.push(`${t}.${s}: na produkci je, ve snímku chybí`);
  for (const s of snimek[t].sloupce) if (!produkce[t].sloupce.has(s)) chyby.push(`${t}.${s}: ve snímku je, na produkci není`);
  for (const f of produkce[t].fk) if (!snimek[t].fk.has(f)) chyby.push(`${t}: cizí klíč ${f} na produkci je, ve snímku chybí`);
  for (const f of snimek[t].fk) if (!produkce[t].fk.has(f)) chyby.push(`${t}: cizí klíč ${f} ve snímku je, na produkci není`);
}
if (chyby.length) { console.log(`DRIFT (${chyby.length}):`); for (const c of chyby) console.log("  " + c); process.exit(1); }
console.log(`Bez driftu: ${Object.keys(produkce).length} tabulek, ${Object.values(produkce).reduce((n, t) => n + t.sloupce.size, 0)} sloupců, ${Object.values(produkce).reduce((n, t) => n + t.fk.size, 0)} cizích klíčů sedí se snímkem ✓`);
