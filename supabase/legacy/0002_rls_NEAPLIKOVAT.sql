-- !!! NIKDY NESPOUSTET !!!
--
-- Tento soubor vznikl 2026-09-06 na CHYBNEM predpokladu, ze produkcni
-- Supabase nema zapnutou RLS. Read-only precheck 2026-09-07 primo
-- v produkci prokazal opak:
--   - RLS je zapnuta na vsech tabulkach v public,
--   - existuje ~24 policies (vsechny authenticated scopovane pres
--     child_profiles.parent_user_id = auth.uid(); rate_limits jen service_role),
--   - anon nema na child_task_progress / pin_audit_log / rate_limits
--     zadny pristup (SELECT/INSERT/UPDATE/DELETE = NE).
--
-- Spusteni tohoto souboru by nic nezabezpecilo a odstranilo by funkcni
-- policy "parents read connected child profiles via friendships".
--
-- Zustava v legacy/ jen kvuli dohledatelnosti. Skutecny stav produkce
-- bude zachycen v supabase/migrations/ jako production snapshot.
--
-- Puvodni SQL (beze zmeny) nasleduje:

begin;

-- ------------------------------------------------------------------
-- DENY BY DEFAULT
-- RLS zapnuta bez policies = zadny pristup pro anon ani authenticated.
-- ------------------------------------------------------------------

alter table public.child_location_progress    enable row level security;
alter table public.child_task_progress        enable row level security;
alter table public.child_friendships          enable row level security;
alter table public.child_expedition_invites   enable row level security;
alter table public.child_profile_blocks       enable row level security;
alter table public.child_security_events      enable row level security;
alter table public.child_game_sessions        enable row level security;
alter table public.child_game_session_players enable row level security;
alter table public.pin_audit_log              enable row level security;
alter table public.rate_limits                enable row level security;
alter table public.missions                   enable row level security;
alter table public.mission_stops              enable row level security;
alter table public.mission_tasks              enable row level security;

-- ------------------------------------------------------------------
-- child_profiles: jediná tabulka ctena pod session tokenem rodice.
--
-- Zamerne uzsi nez puvodni legacy/schema.sql: vypousti policies
-- "read connected child profiles via friendships / via invites".
-- Profily kamaradu ctou jen /api/friends/* a /api/expeditions/*
-- pres service role, takze pod session tokenem je nikdo potrebovat nema.
-- ------------------------------------------------------------------

alter table public.child_profiles enable row level security;

drop policy if exists "parents read own child profiles" on public.child_profiles;
create policy "parents read own child profiles"
on public.child_profiles for select
to authenticated
using (auth.uid() = parent_user_id);

drop policy if exists "parents insert own child profiles" on public.child_profiles;
create policy "parents insert own child profiles"
on public.child_profiles for insert
to authenticated
with check (auth.uid() = parent_user_id);

drop policy if exists "parents update own child profiles" on public.child_profiles;
create policy "parents update own child profiles"
on public.child_profiles for update
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

-- Legacy policies z drivejsiho schema.sql, ktere uz nemaji opodstatneni.
drop policy if exists "parents read connected child profiles via friendships" on public.child_profiles;
drop policy if exists "parents read connected child profiles via invites" on public.child_profiles;

commit;
