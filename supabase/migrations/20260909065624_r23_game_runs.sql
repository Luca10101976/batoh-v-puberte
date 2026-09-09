-- R23: jednotný model rozehrání hry (VÝPRAVA) pro sólo i pro skupinu.
--
-- Doménový model:
--   HRA      = missions + mission_stops + mission_tasks (obsah, existuje bez hráčů)
--   VÝPRAVA  = child_game_sessions (jedno konkrétní rozehrání jedné hry)
--   ÚČASTNÍK = child_game_session_players (sólo výprava má jednoho)
--   ODPOVĚĎ  = child_task_progress, nově vázaná na konkrétní výpravu
--   NEJLEPŠÍ VÝSLEDEK = child_location_progress (historie, ne aktuální stav)
--
-- Migrace je idempotentní a NIC nemaže: žádné drop table, delete ani truncate.
-- Existující postup (odpovědi, nejlepší skóre, first_completed_at) zůstává beze změny,
-- historické odpovědi se jen přiřadí k dopočítané historické výpravě.

-- ---------------------------------------------------------------------------
-- 1. VÝPRAVA: sloupec s adresou hry se jmenuje podle své skutečné role
-- ---------------------------------------------------------------------------
-- Sloupec nikdy neobsahoval UUID mise, ale veřejnou adresu hry (locationId,
-- např. 'klamovka'). Název mission_id byl matoucí a svazoval ho s identitou mise,
-- kterou řeší lib/legacy-location-ids.ts.
do $$
begin
  if exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'child_game_sessions' and column_name = 'mission_id'
     )
     and not exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'child_game_sessions' and column_name = 'location_id'
     ) then
    alter table public.child_game_sessions rename column mission_id to location_id;
  end if;
end $$;

comment on column public.child_game_sessions.location_id is
  'Veřejná adresa hry (locationId), ne UUID mise. Překlad na misi řeší lib/legacy-location-ids.ts.';

alter table public.child_game_sessions add column if not exists mode text not null default 'solo';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'child_game_sessions_mode_check') then
    alter table public.child_game_sessions
      add constraint child_game_sessions_mode_check check (mode in ('solo', 'group'));
  end if;
end $$;

comment on table public.child_game_sessions is
  'R23: jedno rozehrání hry (výprava). Sólo hraní = výprava s jedním hráčem.';

-- Dosud směl mít vedoucí jen jednu otevřenou výpravu celkem. Podle P8 může mít
-- hráč rozehraných více RŮZNÝCH her, ale pořád jen jednu výpravu téže hry.
drop index if exists public.child_game_sessions_one_open_per_leader_idx;

create unique index if not exists child_game_sessions_open_run_per_leader_location_idx
  on public.child_game_sessions (leader_child_profile_id, location_id)
  where status in ('waiting', 'active') and location_id is not null;

-- Rozdělaná skupinová výprava bez zvolené hry zůstává nejvýš jedna.
create unique index if not exists child_game_sessions_open_lobby_per_leader_idx
  on public.child_game_sessions (leader_child_profile_id)
  where status in ('waiting', 'active') and location_id is null;

-- ---------------------------------------------------------------------------
-- 2. ODPOVĚĎ PATŘÍ KONKRÉTNÍ VÝPRAVĚ
-- ---------------------------------------------------------------------------
-- Bez této vazby nelze rozlišit dvě rozehrání téže hry, takže opakované hraní
-- muselo mazat odpovědi. Zároveň je (výprava, úkol) přirozený idempotentní klíč
-- pro pozdější offline synchronizaci (R27–R29).
alter table public.child_task_progress
  add column if not exists session_id uuid references public.child_game_sessions(id) on delete set null;

create index if not exists child_task_progress_session_idx
  on public.child_task_progress (session_id);

comment on column public.child_task_progress.session_id is
  'Výprava, ve které odpověď vznikla. NULL = historická odpověď z doby před R23.';

-- ---------------------------------------------------------------------------
-- 3. HISTORICKÁ ROZEHRÁNÍ: jedna výprava na dvojici hráč + hra
-- ---------------------------------------------------------------------------
-- Dosavadní tvar tabulky umožňoval nejvýš jednu odpověď na trojici hráč, hra, úkol,
-- takže všechny existující odpovědi jedné dvojice hráč + hra nutně pocházejí
-- z jednoho průchodu. Převod proto nic nedomýšlí:
--   začátek  = nejstarší first_answered_at ve skupině,
--   konec    = first_completed_at z nejlepšího výsledku, pokud hru dokončil,
--   stav     = finished u dokončené hry, jinak active,
--   režim    = solo (skupinové výpravy zatím nikdy neproběhly).
-- Dřívější průchody smazané starým opakovaným hraním se nerekonstruují.
do $$
declare
  grp record;
  new_run uuid;
  run_status text;
  run_finished timestamptz;
begin
  for grp in
    select tp.child_profile_id,
           tp.location_id,
           min(tp.first_answered_at) as started_at,
           max(tp.last_answered_at)  as last_answered_at
      from public.child_task_progress tp
     where tp.session_id is null
     group by tp.child_profile_id, tp.location_id
  loop
    select case when lp.status = 'completed' or lp.first_completed_at is not null then 'finished' else 'active' end,
           case when lp.status = 'completed' or lp.first_completed_at is not null
                then coalesce(lp.first_completed_at, lp.completed_at, grp.last_answered_at)
                else null end
      into run_status, run_finished
      from public.child_profiles p
      left join public.child_location_progress lp
        on lp.profile_code = p.profile_code and lp.location_id = grp.location_id
     where p.id = grp.child_profile_id;

    if run_status is null then
      run_status := 'active';
      run_finished := null;
    end if;

    insert into public.child_game_sessions
      (leader_child_profile_id, location_id, status, mode, started_at, finished_at, created_at)
    values
      (grp.child_profile_id, grp.location_id, run_status, 'solo', grp.started_at, run_finished, grp.started_at)
    returning id into new_run;

    insert into public.child_game_session_players
      (session_id, child_profile_id, status, joined_at, created_at)
    values
      (new_run, grp.child_profile_id, 'accepted', grp.started_at, grp.started_at)
    on conflict (session_id, child_profile_id) do nothing;

    update public.child_task_progress
       set session_id = new_run
     where child_profile_id = grp.child_profile_id
       and location_id = grp.location_id
       and session_id is null;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. JEDINEČNOST ODPOVĚDI V RÁMCI VÝPRAVY
-- ---------------------------------------------------------------------------
-- Staré unikátní omezení (hráč, hra, úkol) bránilo druhému rozehrání téže hry.
do $$
declare
  con record;
begin
  for con in
    select c.conname
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'child_task_progress'
       and c.contype = 'u'
  loop
    execute format('alter table public.child_task_progress drop constraint %I', con.conname);
  end loop;
end $$;

create unique index if not exists child_task_progress_run_task_idx
  on public.child_task_progress (child_profile_id, location_id, task_id, session_id);

-- Historické odpovědi bez výpravy zůstávají jedinečné i bez ní.
create unique index if not exists child_task_progress_legacy_task_idx
  on public.child_task_progress (child_profile_id, location_id, task_id)
  where session_id is null;

-- ---------------------------------------------------------------------------
-- 5. NEJLEPŠÍ VÝSLEDEK: zúžená role a jednotná identita hráče
-- ---------------------------------------------------------------------------
-- Aktuální rozehrání drží od R23 výprava. Tato tabulka je historie: dokončil někdy,
-- kdy poprvé, nejlepší skóre, nejmenší ztráta bodů. Nejlepší výsledek se nezhoršuje.
comment on table public.child_location_progress is
  'R23: nejlepší historický výsledek hráče v dané hře. Aktuální rozehrání drží child_game_sessions.';

-- T5: postup úkolů je klíčovaný child_profile_id, tahle tabulka jen textovým kódem.
-- Sloupec se doplňuje a udržuje, primární klíč se zatím nemění (patří do R40).
alter table public.child_location_progress
  add column if not exists child_profile_id uuid references public.child_profiles(id) on delete cascade;

update public.child_location_progress lp
   set child_profile_id = p.id
  from public.child_profiles p
 where p.profile_code = lp.profile_code
   and lp.child_profile_id is null;

create index if not exists child_location_progress_child_profile_idx
  on public.child_location_progress (child_profile_id);
