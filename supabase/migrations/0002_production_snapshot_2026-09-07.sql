-- ============================================================================
-- 0002 · PRODUCTION SNAPSHOT · zachyceny stav produkce k 2026-09-07
-- ============================================================================
--
-- !!! NESPOUSTET NA PRODUKCNI DATABAZI (ref zrsxecvndimbclrknbvs) !!!
--
-- Tento soubor NENI cekajici migrace. Je to ZACHYCENI stavu, ktery
-- v produkci UZ EXISTUJE. Byl sestaven vyhradne z read-only metadat
-- (pg_class, pg_policies, pg_attribute, pg_constraint, pg_index) ziskanych
-- v Supabase SQL editoru 2026-09-07 12:33:44.407856+00 (PostgreSQL 17.6 on aarch64-unknown-linux-gnu).
-- Nic v nem neni odhadnute ani domyslene.
--
-- K CEMU SLOUZI
--   1. Reprodukovatelnost noveho prostredi: po 0001_baseline.sql doplni
--      zbyle 2 tabulky, zapne RLS na vsech 16 tabulkach a vytvori
--      vsechny policies presne tak, jak je ma produkce.
--   2. Zaklad budouciho rizeneho systemu migraci: od tohoto bodu ma repo
--      odpovidat produkci a kazda dalsi zmena DB vznika jako novy soubor
--      v supabase/migrations/ (po samostatnem prechecku).
--
-- PROC SE NESMI SPOUSTET NA PRODUKCI TED
--   Vsechny prikazy jsou idempotentni (if not exists / drop if exists +
--   create), takze by "nic nerozbily" - ale zaroven by nic neprinesly
--   a kazde spusteni SQL na produkci ma jit pres precheck a schvaleni.
--   Az bude zavedeny supabase link + migration repair, oznaci se tento
--   soubor v produkci jako APLIKOVANY bez spusteni.
--
-- CO OBSAHUJE
--   A. 2 tabulky, ktere 0001_baseline.sql nema: child_push_subscriptions, panbatoh_content
--      (sloupce v puvodnim poradi, typy, NOT NULL, defaulty, PK/UNIQUE/CHECK)
--   B. samostatne indexy techto 2 tabulek (indexy patrici constraintum
--      vznikaji z constraintu, zde se neduplikuji)
--   C. enable row level security na vsech 16 tabulkach v public
--      (FORCE nikde - odpovida produkci)
--   D. vsech 23 policies z produkce (nazev, prikaz, role, USING, WITH CHECK)
--
-- CO ZAMERNE NEOBSAHUJE
--   - triggery, funkce, enumy: obe tabulky zadne nemaji (overeno)
--   - GRANT/REVOKE: tabulkova prava odpovidaji vychozim Supabase grantum
--     (anon/authenticated/service_role = SELECT/INSERT/UPDATE/DELETE),
--     ktere Supabase novym tabulkam prideluje automaticky
--   - cokoliv z legacy/0002_rls_NEAPLIKOVAT.sql - ten soubor byl zavrzen,
--     tento snapshot ho nahrazuje a zadnou policy neodstranuje
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- A. TABULKY chybejici v 0001_baseline.sql
-- ----------------------------------------------------------------------------

create table if not exists public.child_push_subscriptions (
  id uuid not null default gen_random_uuid(),
  profile_code text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint child_push_subscriptions_pkey PRIMARY KEY (id),
  constraint child_push_subscriptions_endpoint_key UNIQUE (endpoint)
);

create table if not exists public.panbatoh_content (
  id uuid not null default gen_random_uuid(),
  type text not null,
  slug text not null,
  title text not null,
  summary text not null,
  status text not null default 'draft'::text,
  payload jsonb not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint panbatoh_content_pkey PRIMARY KEY (id),
  constraint panbatoh_content_type_slug_key UNIQUE (type, slug),
  constraint panbatoh_content_status_check CHECK (status = ANY (ARRAY['draft'::text, 'published'::text])),
  constraint panbatoh_content_type_check CHECK (type = ANY (ARRAY['zapisek'::text, 'vylet'::text]))
);

-- ----------------------------------------------------------------------------
-- B. SAMOSTATNE INDEXY (bez tech, ktere patri constraintum)
-- ----------------------------------------------------------------------------

create index if not exists child_push_subscriptions_profile_code_idx on public.child_push_subscriptions USING btree (profile_code);
create index if not exists panbatoh_content_status_type_idx on public.panbatoh_content USING btree (status, type, updated_at DESC);

-- ----------------------------------------------------------------------------
-- C. ROW LEVEL SECURITY – vsech 16 tabulek v public, FORCE nikde
-- ----------------------------------------------------------------------------

alter table public.child_expedition_invites enable row level security;
alter table public.child_friendships enable row level security;
alter table public.child_game_session_players enable row level security;
alter table public.child_game_sessions enable row level security;
alter table public.child_location_progress enable row level security;
alter table public.child_profile_blocks enable row level security;
alter table public.child_profiles enable row level security;
alter table public.child_push_subscriptions enable row level security;
alter table public.child_security_events enable row level security;
alter table public.child_task_progress enable row level security;
alter table public.mission_stops enable row level security;
alter table public.mission_tasks enable row level security;
alter table public.missions enable row level security;
alter table public.panbatoh_content enable row level security;
alter table public.pin_audit_log enable row level security;
alter table public.rate_limits enable row level security;

-- ----------------------------------------------------------------------------
-- D. POLICIES – vsech 23 z produkce, 1:1 (drop if exists + create = idempotentni)
-- ----------------------------------------------------------------------------

-- child_friendships
drop policy if exists "parents insert own child friendships" on public.child_friendships;
create policy "parents insert own child friendships" on public.child_friendships
  as permissive
  for insert
  to authenticated
  with check ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_friendships.child_profile_id) AND (cp.parent_user_id = auth.uid())))));

drop policy if exists "parents read own child friendships" on public.child_friendships;
create policy "parents read own child friendships" on public.child_friendships
  as permissive
  for select
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_friendships.child_profile_id) AND (cp.parent_user_id = auth.uid())))));

-- child_game_session_players
drop policy if exists "parents read own session players" on public.child_game_session_players;
create policy "parents read own session players" on public.child_game_session_players
  as permissive
  for select
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_game_session_players.child_profile_id) AND (cp.parent_user_id = auth.uid())))));

-- child_game_sessions
drop policy if exists "parents read own sessions" on public.child_game_sessions;
create policy "parents read own sessions" on public.child_game_sessions
  as permissive
  for select
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM (child_game_session_players sp
     JOIN child_profiles cp ON ((cp.id = sp.child_profile_id)))
  WHERE ((sp.session_id = child_game_sessions.id) AND (cp.parent_user_id = auth.uid())))));

-- child_location_progress
drop policy if exists "parents delete own child location progress" on public.child_location_progress;
create policy "parents delete own child location progress" on public.child_location_progress
  as permissive
  for delete
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.profile_code = child_location_progress.profile_code) AND (cp.parent_user_id = auth.uid())))));

drop policy if exists "parents insert own child location progress" on public.child_location_progress;
create policy "parents insert own child location progress" on public.child_location_progress
  as permissive
  for insert
  to authenticated
  with check ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.profile_code = child_location_progress.profile_code) AND (cp.parent_user_id = auth.uid())))));

drop policy if exists "parents read own child location progress" on public.child_location_progress;
create policy "parents read own child location progress" on public.child_location_progress
  as permissive
  for select
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.profile_code = child_location_progress.profile_code) AND (cp.parent_user_id = auth.uid())))));

drop policy if exists "parents update own child location progress" on public.child_location_progress;
create policy "parents update own child location progress" on public.child_location_progress
  as permissive
  for update
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.profile_code = child_location_progress.profile_code) AND (cp.parent_user_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.profile_code = child_location_progress.profile_code) AND (cp.parent_user_id = auth.uid())))));

-- child_profile_blocks
drop policy if exists "parents delete own child blocks" on public.child_profile_blocks;
create policy "parents delete own child blocks" on public.child_profile_blocks
  as permissive
  for delete
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_profile_blocks.child_profile_id) AND (cp.parent_user_id = auth.uid())))));

drop policy if exists "parents insert own child blocks" on public.child_profile_blocks;
create policy "parents insert own child blocks" on public.child_profile_blocks
  as permissive
  for insert
  to authenticated
  with check ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_profile_blocks.child_profile_id) AND (cp.parent_user_id = auth.uid())))));

drop policy if exists "parents read own child blocks" on public.child_profile_blocks;
create policy "parents read own child blocks" on public.child_profile_blocks
  as permissive
  for select
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_profile_blocks.child_profile_id) AND (cp.parent_user_id = auth.uid())))));

-- child_profiles
drop policy if exists "parents insert own child profiles" on public.child_profiles;
create policy "parents insert own child profiles" on public.child_profiles
  as permissive
  for insert
  to authenticated
  with check ((auth.uid() = parent_user_id));

drop policy if exists "parents read connected child profiles via friendships" on public.child_profiles;
create policy "parents read connected child profiles via friendships" on public.child_profiles
  as permissive
  for select
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM (child_profiles me
     JOIN child_friendships cf ON ((((cf.child_profile_id = me.id) AND (cf.friend_child_profile_id = child_profiles.id)) OR ((cf.friend_child_profile_id = me.id) AND (cf.child_profile_id = child_profiles.id)))))
  WHERE (me.parent_user_id = auth.uid()))));

drop policy if exists "parents read own child profiles" on public.child_profiles;
create policy "parents read own child profiles" on public.child_profiles
  as permissive
  for select
  to authenticated
  using ((auth.uid() = parent_user_id));

drop policy if exists "parents update own child profiles" on public.child_profiles;
create policy "parents update own child profiles" on public.child_profiles
  as permissive
  for update
  to authenticated
  using ((auth.uid() = parent_user_id))
  with check ((auth.uid() = parent_user_id));

-- child_security_events
drop policy if exists "parents read own child security events" on public.child_security_events;
create policy "parents read own child security events" on public.child_security_events
  as permissive
  for select
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_security_events.actor_child_profile_id) AND (cp.parent_user_id = auth.uid())))));

-- child_task_progress
drop policy if exists "parents delete own child task progress" on public.child_task_progress;
create policy "parents delete own child task progress" on public.child_task_progress
  as permissive
  for delete
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_task_progress.child_profile_id) AND (cp.parent_user_id = auth.uid())))));

drop policy if exists "parents insert own child task progress" on public.child_task_progress;
create policy "parents insert own child task progress" on public.child_task_progress
  as permissive
  for insert
  to authenticated
  with check ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_task_progress.child_profile_id) AND (cp.parent_user_id = auth.uid())))));

drop policy if exists "parents read own child task progress" on public.child_task_progress;
create policy "parents read own child task progress" on public.child_task_progress
  as permissive
  for select
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_task_progress.child_profile_id) AND (cp.parent_user_id = auth.uid())))));

drop policy if exists "parents update own child task progress" on public.child_task_progress;
create policy "parents update own child task progress" on public.child_task_progress
  as permissive
  for update
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_task_progress.child_profile_id) AND (cp.parent_user_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_task_progress.child_profile_id) AND (cp.parent_user_id = auth.uid())))));

-- panbatoh_content
drop policy if exists "panbatoh content published readable" on public.panbatoh_content;
create policy "panbatoh content published readable" on public.panbatoh_content
  as permissive
  for select
  to public
  using ((status = 'published'::text));

-- pin_audit_log
drop policy if exists "parents read own pin audit logs" on public.pin_audit_log;
create policy "parents read own pin audit logs" on public.pin_audit_log
  as permissive
  for select
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = pin_audit_log.profile_id) AND (cp.parent_user_id = auth.uid())))));

-- rate_limits
drop policy if exists "service role manages rate limits" on public.rate_limits;
create policy "service role manages rate limits" on public.rate_limits
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

commit;