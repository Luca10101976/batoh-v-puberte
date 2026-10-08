-- R51: postavy hry a bublina při příchodu na zastavení.
--
-- Postava (např. Atbaliba v Klamovce) patří ke konkrétní hře: jméno a obrázek,
-- spravuje se v Mozku na stránce hry. Zastavení může mít jednu bublinu, kterou
-- hráč uvidí při příchodu na místo, nad úkoly: kdo mluví + text.
--
-- Bezpečnost: tabulka má zapnuté RLS bez politik – stejně jako mission_stops ji
-- čte a zapisuje jen server (service role). Prohlížeč k ní nemá přístup.
-- Postava z jiné hry se k zastavení přiřadit nedá: cizí klíč hlídá dvojici
-- (postava, hra). Smazání postavy bublinu jen odpojí, zastavení zůstane.
--
-- Migrace je idempotentní a jen přidává. Nic nemaže, žádná data nemění.

create table if not exists public.mission_characters (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  name text not null,
  image_url text,
  created_at timestamptz not null default now(),
  constraint mission_characters_name_length check (char_length(btrim(name)) between 1 and 60),
  constraint mission_characters_id_mission_key unique (id, mission_id)
);

create index if not exists mission_characters_mission_idx on public.mission_characters (mission_id);

alter table public.mission_characters enable row level security;

comment on table public.mission_characters is
  'Postavy konkrétní hry (jméno + obrázek). Mluví v bublinách při příchodu na zastavení.';

alter table public.mission_stops add column if not exists bubble_character_id uuid;
alter table public.mission_stops add column if not exists bubble_text text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mission_stops_bubble_character_fk'
      and conrelid = 'public.mission_stops'::regclass
  ) then
    alter table public.mission_stops
      add constraint mission_stops_bubble_character_fk
      foreign key (bubble_character_id, mission_id)
      references public.mission_characters (id, mission_id)
      on delete set null (bubble_character_id);
  end if;
end $$;

comment on column public.mission_stops.bubble_character_id is
  'Kdo mluví v bublině při příchodu na zastavení. Prázdné = bez bubliny.';
comment on column public.mission_stops.bubble_text is
  'Text bubliny při příchodu na zastavení.';
