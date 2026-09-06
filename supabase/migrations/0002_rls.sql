-- 0002: Row Level Security pro vsechny tabulky.
--
-- KONTEXT (proc deny-by-default):
-- Aplikace cte a zapisuje data VYHRADNE pres /api/* a server actions,
-- ktere pouzivaji service-role klic. Service role RLS obchazi, takze
-- se pridanim techto pravidel nic v aplikaci nerozbije.
--
-- Prohlizecovy klient (lib/supabase.ts) pouziva anon klic POUZE pro auth
-- (prihlaseni, obnova session). Neexistuje jediny .from() dotaz v components/.
--
-- Bez RLS je pritom kazda tabulka v public schematu ctena i zapisovatelna
-- kymkoliv, kdo ma anon klic - a ten je verejny, je v bundlu aplikace.
-- Tyka se to napr. child_task_progress, pin_audit_log nebo rate_limits
-- (smazanim radku v rate_limits jde vyradit cely rate limiter).
--
-- Vyjimka: child_profiles ma explicitni policies, protoze app/api/auth/login
-- cte a zaklada profil pod session tokenem rodice (fallback, kdyz neni
-- k dispozici service-role klic).

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
