-- R52: bubliny postav – jedna tabulka pro zastavení, úkoly i závěr hry.
--
-- R51 dala bublinu jen zastavení (dva sloupce v mission_stops). Rozhodnutí
-- 8. 10. 2026: bubliny i u úkolů a závěr hry jako sled bublin. Místo dalších
-- sloupců je jedna tabulka: ke komu bublina patří (target_type + stop_id /
-- task_id, závěr bez vazby), kdo mluví (character_id; NULL = Traki, který je
-- k dispozici vždy bez zakládání postavy), text a pořadí.
--
-- Bezpečnost: RLS zapnuté bez politik – čte a zapisuje jen server, stejně jako
-- ostatní obsah her. Cizí klíč (character_id, mission_id) hlídá, že mluvčí je
-- postava TÉŽE hry; postavu, která v bublině mluví, databáze smazat nedovolí
-- (Mozek to hlídá dřív a řekne kde). Smazání zastavení/úkolu/hry bubliny
-- smaže s sebou.
--
-- Přesun R51: stávající bubliny zastavení se zkopírují do nové tabulky,
-- počet se ověří (při neshodě migrace selže a nic se nezmění) a teprve potom
-- se staré sloupce odstraní. Jiná data se nemění.

create table if not exists public.mission_bubbles (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  target_type text not null,
  stop_id uuid references public.mission_stops (id) on delete cascade,
  task_id uuid references public.mission_tasks (id) on delete cascade,
  character_id uuid,
  text text not null,
  "order" integer not null default 1,
  created_at timestamptz not null default now(),
  constraint mission_bubbles_target_type_check check (target_type = any (array['stop'::text, 'task'::text, 'ending'::text])),
  constraint mission_bubbles_target_check check (
    (target_type = 'stop' and stop_id is not null and task_id is null)
    or (target_type = 'task' and task_id is not null and stop_id is null)
    or (target_type = 'ending' and stop_id is null and task_id is null)
  ),
  constraint mission_bubbles_text_length check (char_length(btrim(text)) between 1 and 1000),
  constraint mission_bubbles_character_fk
    foreign key (character_id, mission_id) references public.mission_characters (id, mission_id)
);

create index if not exists mission_bubbles_mission_idx on public.mission_bubbles (mission_id);
create index if not exists mission_bubbles_stop_idx on public.mission_bubbles (stop_id);
create index if not exists mission_bubbles_task_idx on public.mission_bubbles (task_id);

alter table public.mission_bubbles enable row level security;

comment on table public.mission_bubbles is
  'Bubliny postav: u zastavení (při příchodu), u úkolu (nad zadáním) a v závěru hry (sled). character_id NULL = mluví Traki.';

-- Přesun bublin z R51 (idempotentní).
insert into public.mission_bubbles (mission_id, target_type, stop_id, character_id, text, "order")
select s.mission_id, 'stop', s.id, s.bubble_character_id, s.bubble_text, 1
from public.mission_stops s
where s.bubble_character_id is not null
  and btrim(coalesce(s.bubble_text, '')) <> ''
  and not exists (select 1 from public.mission_bubbles b where b.stop_id = s.id and b.target_type = 'stop');

do $$
declare
  puvodnich integer;
  prenesenych integer;
begin
  select count(*) into puvodnich from public.mission_stops
    where bubble_character_id is not null and btrim(coalesce(bubble_text, '')) <> '';
  select count(*) into prenesenych from public.mission_bubbles b
    join public.mission_stops s on s.id = b.stop_id
    where b.target_type = 'stop' and s.bubble_character_id is not null;
  if prenesenych < puvodnich then
    raise exception 'R52: přeneseno % z % bublin zastavení – migrace se zastavuje, nic se nemaže.', prenesenych, puvodnich;
  end if;
end $$;

alter table public.mission_stops drop constraint if exists mission_stops_bubble_character_fk;
alter table public.mission_stops drop column if exists bubble_character_id;
alter table public.mission_stops drop column if exists bubble_text;
