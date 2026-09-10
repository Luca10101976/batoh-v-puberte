-- R37: Mozek jako plnohodnotná administrace obsahu.
--
-- Migrace je idempotentní a NIC nemaže: žádné drop table, delete ani truncate.
-- Nemění se žádná odpověď hráče, žádný výsledek, žádný profil a žádný text hry.
--
-- Před nasazením ověřeno na produkci: 2 mise (Klamovka publikovaná, Budějovice
-- koncept), 11 zastávek a 32 úkolů bez jediného duplicitního pořadí, dvě města
-- v textovém sloupci missions.city, tabulka cities zatím neexistuje.

-- ---------------------------------------------------------------------------
-- 1. MĚSTO JE SAMOSTATNÁ ENTITA (pravidlo A1)
-- ---------------------------------------------------------------------------
-- Dosud bylo město jen textem u mise a nové město nešlo v Mozku vůbec založit:
-- formulář nabízel jen města, která už nějaká mise měla. Souřadnice se navíc
-- braly z obsahu v kódu (lib/mock-data.ts) a skloňování pro „Hry v Praze“ bylo
-- pevnou mapou v komponentě.
create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  -- Tvar pro větu „Hry v …“. Čeština ho z názvu neodvodí, proto ho zadává autor.
  name_locative text not null default '',
  display_order integer not null default 0,
  is_active boolean not null default true,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cities
  add column if not exists name_locative text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'cities_name_length' and conrelid = 'public.cities'::regclass
  ) then
    alter table public.cities
      add constraint cities_name_length check (char_length(btrim(name)) between 2 and 60);
  end if;
end $$;

create unique index if not exists cities_slug_key on public.cities (lower(btrim(slug)));
create unique index if not exists cities_name_key on public.cities (lower(btrim(name)));
create index if not exists cities_order_idx on public.cities (display_order, name);

comment on table public.cities is
  'R37: města spravovaná v Mozku. Zdroj pravdy pro nabídku měst, jejich pořadí, skloňování a souřadnice.';

-- Backfill z existujících misí. Slug se odvodí bez rozšíření unaccent, aby
-- migrace nezávisela na tom, co je v projektu povolené.
insert into public.cities (slug, name, name_locative, display_order, lat, lng)
select
  trim(both '-' from regexp_replace(
    lower(translate(city, 'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ', 'acdeeinorstuuyzACDEEINORSTUUYZ')),
    '[^a-z0-9]+', '-', 'g'
  )) as slug,
  city as name,
  case city
    when 'Praha' then 'Praze'
    when 'České Budějovice' then 'Českých Budějovicích'
    else city
  end as name_locative,
  0 as display_order,
  case city when 'Praha' then 50.0717634 when 'České Budějovice' then 48.9747 else null end as lat,
  case city when 'Praha' then 14.3762351 when 'České Budějovice' then 14.4749 else null end as lng
from (select distinct btrim(city) as city from public.missions where btrim(coalesce(city, '')) <> '') as source
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. VAZBA MISE NA MĚSTO
-- ---------------------------------------------------------------------------
-- Textový sloupec missions.city zůstává zdrojem pro celou aplikaci, aby se
-- nemusel měnit katalog, gameplay ani žebříček. city_id je navíc, aby
-- přejmenování města v Mozku vědělo, které mise má srovnat.
alter table public.missions
  add column if not exists city_id uuid references public.cities(id) on delete set null;

update public.missions m
   set city_id = c.id
  from public.cities c
 where m.city_id is null
   and lower(btrim(m.city)) = lower(btrim(c.name));

comment on column public.missions.city_id is
  'R37: vazba na spravované město. missions.city zůstává zobrazovaným názvem a drží se s městem v souladu.';

-- ---------------------------------------------------------------------------
-- 3. JEDNOU ZÍSKANÉ BODY JSOU TRVALÉ (pravidlo A3)
-- ---------------------------------------------------------------------------
-- Po R33 se do žebříčku počítaly jen aktuálně publikované hry, takže by
-- odpublikování hry vzalo hráčům body. Nová pravda: rozhoduje, jestli hra
-- někdy legitimně vyšla ven. Koncept a testovací hra, která publikovaná nikdy
-- nebyla, nepřispívá ničím.
--
-- Žádná druhá tabulka bodů tím nevzniká – žebříček se dál počítá z výsledků.
alter table public.missions
  add column if not exists first_published_at timestamptz;

update public.missions
   set first_published_at = coalesce(first_published_at, created_at)
 where is_published = true
   and first_published_at is null;

comment on column public.missions.first_published_at is
  'R37: kdy byla hra poprvé publikovaná. Nenulová hodnota znamená, že hra legitimně vyšla ven, a její výsledky se proto počítají do žebříčku i po pozdějším odpublikování. Nikdy se nemaže.';

-- ---------------------------------------------------------------------------
-- 4. JEDNOZNAČNÉ POŘADÍ (pravidlo C)
-- ---------------------------------------------------------------------------
-- Pořadí se dosud psalo ručně jako číslo a nic nebránilo dvěma zastávkám mít
-- stejné. Řazení pak bylo náhodné a R26 vynucuje pořadí úkolů, takže by na tom
-- mohla uváznout rozehraná výprava.
--
-- Nejdřív se srovná případné duplicitní pořadí (stabilně podle stávajícího
-- pořadí a id), teprve pak se zamkne unikátním indexem.
with ranked as (
  select id, row_number() over (partition by mission_id order by "order", id) as position
    from public.mission_stops
)
update public.mission_stops s
   set "order" = ranked.position
  from ranked
 where s.id = ranked.id
   and s."order" is distinct from ranked.position;

with ranked as (
  select id, row_number() over (partition by stop_id order by "order", id) as position
    from public.mission_tasks
)
update public.mission_tasks t
   set "order" = ranked.position
  from ranked
 where t.id = ranked.id
   and t."order" is distinct from ranked.position;

create unique index if not exists mission_stops_mission_order_key
  on public.mission_stops (mission_id, "order");

create unique index if not exists mission_tasks_stop_order_key
  on public.mission_tasks (stop_id, "order");

-- ---------------------------------------------------------------------------
-- 5. OBSAH SE MĚNÍ JEN Z MOZKU
-- ---------------------------------------------------------------------------
-- Mozek píše service-role klíčem a stojí za admin ochranou. Nová tabulka proto
-- nemá žádnou politiku – přes veřejný anon klíč není čitelná ani zapisovatelná.
alter table public.cities enable row level security;
