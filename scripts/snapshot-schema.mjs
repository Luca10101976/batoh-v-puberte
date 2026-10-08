#!/usr/bin/env node

// Snímek skutečného produkčního schématu → supabase/schema.sql
//
// Čte katalog Postgresu přes Supabase Management API v ČISTĚ ČTECÍ transakci
// (read_only: true) a z něj generuje DDL. Nic nevymýšlí, nic neformátuje podle
// domněnek – každá definice pochází z pg_get_*def nebo information_schema.
//
// Přihlášení: SUPABASE_ACCESS_TOKEN z prostředí, jinak soubor ~/.supabase/access-token
// (ten si spravuje `supabase login`). Token se nikde neukládá ani nevypisuje.
//
// Použití:
//   npm run schema:snapshot              # živě z produkce
//   node scripts/snapshot-schema.mjs --from katalog.json   # z dřív uloženého katalogu
//   node scripts/snapshot-schema.mjs --save-catalog k.json # uložit i surový katalog

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const VYSTUP = path.resolve("supabase/schema.sql");

async function nactiKatalog() {
  const from = arg("--from");
  if (from) return JSON.parse(fs.readFileSync(from, "utf8"));

  const ref = fs.readFileSync(path.resolve("supabase/.temp/project-ref"), "utf8").trim();
  const tokenSoubor = path.join(os.homedir(), ".supabase", "access-token");
  const token = process.env.SUPABASE_ACCESS_TOKEN || (fs.existsSync(tokenSoubor) ? fs.readFileSync(tokenSoubor, "utf8").trim() : "");
  if (!token) { console.error("Chybí přihlášení: nastav SUPABASE_ACCESS_TOKEN nebo spusť `supabase login`."); process.exit(2); }

  async function q(query) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, read_only: true })
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Management API ${r.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  }

  const k = {};
  k.overeni = await q("select current_setting('transaction_read_only') as ro");
  if (k.overeni?.[0]?.ro !== "on") throw new Error("Transakce není jen pro čtení – přerušuji.");
  k.tabulky = await q(`select c.relname, c.relrowsecurity, c.relforcerowsecurity, obj_description(c.oid,'pg_class') as komentar
    from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by 1`);
  k.sloupce = await q(`select c.table_name, c.column_name, c.ordinal_position, format_type(a.atttypid, a.atttypmod) as typ,
    c.is_nullable, c.column_default, c.is_identity, c.identity_generation, col_description(a.attrelid, a.attnum) as komentar
    from information_schema.columns c
    join pg_attribute a on a.attrelid = ('public.'||quote_ident(c.table_name))::regclass and a.attname = c.column_name
    where c.table_schema='public' order by c.table_name, c.ordinal_position`);
  k.constrainty = await q(`select conrelid::regclass::text as tabulka, conname, contype, pg_get_constraintdef(oid) as def, convalidated
    from pg_constraint where connamespace='public'::regnamespace order by 1,2`);
  k.indexy = await q(`select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by 1,2`);
  k.funkce = await q(`select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as def
    from pg_proc p where p.pronamespace='public'::regnamespace order by 1`);
  k.triggery = await q(`select c.relname as tabulka, t.tgname, pg_get_triggerdef(t.oid) as def, t.tgenabled
    from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace='public'::regnamespace order by 1,2`);
  k.politiky = await q(`select tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname='public' order by 1,2`);
  k.pohledy = await q(`select table_name, view_definition from information_schema.views where table_schema='public' order by 1`);
  k.enumy = await q(`select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as hodnoty from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typnamespace='public'::regnamespace group by 1 order by 1`);
  k.sekvence = await q(`select sequencename, data_type, start_value, increment_by from pg_sequences where schemaname='public' order by 1`);
  k.rozsireni = await q(`select extname, extversion from pg_extension order by 1`);
  const ulozit = arg("--save-catalog");
  if (ulozit) fs.writeFileSync(ulozit, JSON.stringify(k, null, 2));
  return k;
}

const id = (n) => (/^[a-z_][a-z0-9_]*$/.test(n) ? n : `"${n.replace(/"/g, '""')}"`);
const lit = (s) => `$txt$${s}$txt$`;
const roleSeznam = (r) => String(r).replace(/^\{|\}$/g, "").split(",").map((x) => x.trim()).filter(Boolean);

function generuj(k) {
  const radky = [];
  const p = (...r) => radky.push(...r);
  const dnes = new Date().toISOString().slice(0, 10);

  p(`-- ============================================================================`,
    `-- SNÍMEK SKUTEČNÉHO PRODUKČNÍHO SCHÉMATU (schéma public) – stav k ${dnes}`,
    `-- ============================================================================`,
    `--`,
    `-- Vygenerováno skriptem scripts/snapshot-schema.mjs z katalogu Postgresu`,
    `-- (pg_get_constraintdef, pg_get_functiondef, pg_get_triggerdef, pg_policies,`,
    `-- pg_indexes, information_schema). Nic tu není psané rukou ani podle domněnky.`,
    `--`,
    `-- K ČEMU JE: jediný věrný popis toho, co na produkci skutečně je. Migrace`,
    `-- 0001_baseline.sql a 0002_production_snapshot_2026-09-07.sql to NEJSOU –`,
    `-- baseline se na produkci nikdy nespustil (audit 8. 10. 2026).`,
    `--`,
    `-- NESPOUŠTĚT NA PRODUKCI. Změny schématu jdou jen migracemi; po každé migraci`,
    `-- se tenhle soubor obnoví příkazem \`npm run schema:snapshot\` a drift hlídá`,
    `-- \`npm run schema:verify\`.`,
    `--`,
    `-- CO TU NENÍ: práva rolí (GRANT) – Management API je nevrací, neověřeno;`,
    `-- schémata auth, storage, realtime, vault (spravuje Supabase); data.`,
    ``);

  p(`-- ---------------------------------------------------------------------------`, `-- Rozšíření na produkci (jen záznam – spravuje Supabase, schéma neznámé)`, `-- ---------------------------------------------------------------------------`);
  for (const e of k.rozsireni) p(`--   ${e.extname} ${e.extversion}`);
  p(``);

  if (k.enumy.length) { p(`-- Enumy`); for (const e of k.enumy) p(`create type public.${id(e.typname)} as enum (${(Array.isArray(e.hodnoty)?e.hodnoty:roleSeznam(e.hodnoty)).map((h)=>`'${h.replace(/'/g,"''")}'`).join(", ")});`); p(``); }
  if (k.sekvence.length) { p(`-- Sekvence`); for (const s of k.sekvence) p(`create sequence public.${id(s.sequencename)} as ${s.data_type} start ${s.start_value} increment ${s.increment_by};`); p(``); }

  p(`-- ---------------------------------------------------------------------------`, `-- Funkce`, `-- ---------------------------------------------------------------------------`);
  for (const f of k.funkce) p(f.def.trim().replace(/;?\s*$/, ";"), ``);

  p(`-- ---------------------------------------------------------------------------`, `-- Tabulky`, `-- ---------------------------------------------------------------------------`);
  const sloupcePodle = {};
  for (const s of k.sloupce) (sloupcePodle[s.table_name] ??= []).push(s);
  for (const t of k.tabulky) {
    const sl = (sloupcePodle[t.relname] ?? []).sort((a, b) => a.ordinal_position - b.ordinal_position);
    p(`create table public.${id(t.relname)} (`);
    p(sl.map((s) => {
      let d = `  ${id(s.column_name)} ${s.typ}`;
      if (s.is_identity === "YES") d += ` generated ${s.identity_generation === "ALWAYS" ? "always" : "by default"} as identity`;
      if (s.is_nullable === "NO") d += ` not null`;
      if (s.column_default != null && s.is_identity !== "YES") d += ` default ${s.column_default}`;
      return d;
    }).join(",\n"));
    p(`);`);
    if (t.komentar) p(`comment on table public.${id(t.relname)} is ${lit(t.komentar)};`);
    for (const s of sl) if (s.komentar) p(`comment on column public.${id(t.relname)}.${id(s.column_name)} is ${lit(s.komentar)};`);
    p(``);
  }

  p(`-- ---------------------------------------------------------------------------`, `-- Omezení: primární klíče, unikátnost, CHECK`, `-- ---------------------------------------------------------------------------`);
  const jmenaOmezeni = new Set(k.constrainty.map((c) => c.conname));
  for (const c of k.constrainty.filter((c) => c.contype !== "f")) {
    p(`alter table public.${id(c.tabulka.replace(/^public\./, ""))} add constraint ${id(c.conname)} ${c.def}${c.convalidated === false ? " not valid" : ""};`);
  }
  p(``, `-- Cizí klíče`);
  for (const c of k.constrainty.filter((c) => c.contype === "f")) {
    p(`alter table public.${id(c.tabulka.replace(/^public\./, ""))} add constraint ${id(c.conname)} ${c.def}${c.convalidated === false ? " not valid" : ""};`);
  }
  p(``);

  p(`-- ---------------------------------------------------------------------------`, `-- Indexy (mimo ty, které vytvářejí omezení výše)`, `-- ---------------------------------------------------------------------------`);
  for (const i of k.indexy) if (!jmenaOmezeni.has(i.indexname)) p(`${i.indexdef};`);
  p(``);

  p(`-- ---------------------------------------------------------------------------`, `-- Spouštěče`, `-- ---------------------------------------------------------------------------`);
  for (const t of k.triggery) p(`${t.def};${t.tgenabled !== "O" ? `  -- stav: ${t.tgenabled}` : ""}`);
  p(``);

  p(`-- ---------------------------------------------------------------------------`, `-- RLS`, `-- ---------------------------------------------------------------------------`);
  for (const t of k.tabulky) {
    if (t.relrowsecurity) p(`alter table public.${id(t.relname)} enable row level security;`);
    if (t.relforcerowsecurity) p(`alter table public.${id(t.relname)} force row level security;`);
  }
  p(``);
  for (const pol of k.politiky) {
    const role = roleSeznam(pol.roles).map((r) => (r === "public" ? "public" : id(r))).join(", ");
    let d = `create policy "${pol.policyname.replace(/"/g, '""')}" on public.${id(pol.tablename)}`;
    d += ` as ${String(pol.permissive).toLowerCase() === "permissive" ? "permissive" : "restrictive"} for ${String(pol.cmd).toLowerCase()} to ${role}`;
    if (pol.qual) d += `\n  using (${pol.qual})`;
    if (pol.with_check) d += `\n  with check (${pol.with_check})`;
    p(`${d};`);
  }
  p(``);

  if (k.pohledy.length) { p(`-- Pohledy`); for (const v of k.pohledy) p(`create view public.${id(v.table_name)} as\n${v.view_definition}`); p(``); }
  return radky.join("\n") + "\n";
}

const katalog = await nactiKatalog();
const sql = generuj(katalog);
if (argv.includes("--stdout")) { process.stdout.write(sql); }
else { fs.writeFileSync(VYSTUP, sql); console.log(`zapsáno ${path.relative(process.cwd(), VYSTUP)} (${sql.split("\n").length} řádků, ${katalog.tabulky.length} tabulek)`); }
