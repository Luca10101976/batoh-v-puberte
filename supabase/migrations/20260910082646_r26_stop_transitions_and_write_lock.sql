-- R26: přechod mezi zastávkami a uzavření přímého zápisu do herního stavu.
--
-- Migrace je idempotentní a NIC nemaže: žádné drop table, delete ani truncate.
-- Nemění se žádná odpověď hráče, žádný výsledek ani žádný obsah hry.

-- ---------------------------------------------------------------------------
-- 1. ZASTÁVKA: volitelný autorský text přechodu (Q5)
-- ---------------------------------------------------------------------------
-- Dosud byl přechod mezi zastávkami jen technické „Blok splněn“. Autor teď může
-- napsat vlastní větu; když ji nenapíše, aplikace použije obecný text a nic se
-- nevymýšlí za něj.
alter table public.mission_stops add column if not exists transition_text text not null default '';

comment on column public.mission_stops.transition_text is
  'R26: autorský text, který hráč uvidí po dokončení TÉTO zastávky, než vyrazí na další. Prázdný = obecný text.';

-- ---------------------------------------------------------------------------
-- 2. VÝPRAVA: potvrzení přechodu konkrétním hráčem (Q4)
-- ---------------------------------------------------------------------------
-- „Zastávka je dokončená" se NEUKLÁDÁ – odvozuje se z uzavřených úkolů výpravy
-- (Q3). Tenhle sloupec drží něco jiného: které přechodové obrazovky už hráč
-- odklikl. Bez toho by obrazovka po reloadu nešla zavřít, protože podmínka
-- „předchozí zastávka je hotová" platí dál. Je to tedy záznam o kliknutí,
-- ne druhá pravda o dokončení.
alter table public.child_game_session_players
  add column if not exists confirmed_stop_transitions jsonb not null default '[]'::jsonb;

comment on column public.child_game_session_players.confirmed_stop_transitions is
  'R26: id zastávek, jejichž přechodovou obrazovku už tenhle hráč v téhle výpravě potvrdil. Není zdrojem pravdy o dokončení zastávky.';

-- ---------------------------------------------------------------------------
-- 3. HERNÍ STAV SE MĚNÍ JEN SERVEROVOU CESTOU (Q10)
-- ---------------------------------------------------------------------------
-- Nález auditu R26 (CRITICAL): přihlášený hráč měl přes veřejný anon klíč právo
-- vkládat a měnit vlastní řádky v child_task_progress i child_location_progress.
-- Mohl si tak sám zapsat „správně" u všech úkolů, přepsat počet pokusů, otevřenou
-- nápovědu i nejlepší skóre – a obejít tím pořadí, bodování i odemykání her.
--
-- Aplikace tyhle tabulky z prohlížeče NIKDY nezapisuje: každý zápis jde přes API
-- se service-role klíčem, který RLS obchází. Odebrání zapisovacích politik proto
-- nic legitimního nerozbije. Čtecí politiky zůstávají beze změny.
drop policy if exists "parents insert own child task progress" on public.child_task_progress;
drop policy if exists "parents update own child task progress" on public.child_task_progress;
drop policy if exists "parents delete own child task progress" on public.child_task_progress;

drop policy if exists "parents insert own child location progress" on public.child_location_progress;
drop policy if exists "parents update own child location progress" on public.child_location_progress;
drop policy if exists "parents delete own child location progress" on public.child_location_progress;

-- Pojistka pro případ, že by v produkci existovala politika pod jiným názvem:
-- odstraní se každá zapisovací politika nad těmito dvěma tabulkami.
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('child_task_progress', 'child_location_progress')
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- RLS zůstává zapnutá; bez politiky pro daný příkaz je zápis zamítnutý.
alter table public.child_task_progress enable row level security;
alter table public.child_location_progress enable row level security;

comment on table public.child_task_progress is
  'R26: odpovědi hráče ve výpravě. Zapisuje výhradně server (service role); klientský zápis přes RLS je zakázaný.';

comment on table public.child_location_progress is
  'R23/R26: nejlepší historický výsledek hráče v dané hře. Zapisuje výhradně server; klientský zápis přes RLS je zakázaný.';
