-- Pan Batoh: full repair baseline (idempotent)
-- Spust v Supabase SQL Editoru jako jeden celek.

begin;

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------
-- CORE GAME TABLES
-- ------------------------------------------------------------------

create table if not exists public.child_profiles (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_name text not null,
  child_age integer not null check (child_age >= 8),
  pin_hash text,
  profile_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.child_profiles add column if not exists player_code text;
alter table public.child_profiles add column if not exists contact_email text;
alter table public.child_profiles add column if not exists pin_failed_attempts integer not null default 0;
alter table public.child_profiles add column if not exists pin_locked_until timestamptz;
alter table public.child_profiles add column if not exists pin_updated_at timestamptz;
alter table public.child_profiles add column if not exists avatar text;
alter table public.child_profiles add column if not exists avatar_config jsonb;
alter table public.child_profiles add column if not exists created_at timestamptz not null default now();
alter table public.child_profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists child_profiles_profile_code_key on public.child_profiles(profile_code);
create unique index if not exists child_profiles_player_code_key on public.child_profiles(player_code) where player_code is not null;
create index if not exists child_profiles_parent_user_id_idx on public.child_profiles(parent_user_id);
create index if not exists idx_child_profiles_contact_email on public.child_profiles(contact_email);

update public.child_profiles
set player_code = profile_code
where (player_code is null or btrim(player_code) = '')
  and profile_code is not null;

update public.child_profiles cp
set contact_email = lower(u.email)
from auth.users u
where cp.parent_user_id = u.id
  and (cp.contact_email is null or btrim(cp.contact_email) = '');

create table if not exists public.child_location_progress (
  profile_code text not null,
  location_id text not null,
  completed_at timestamptz not null default now(),
  penalty_points integer not null default 0 check (penalty_points >= 0),
  primary key (profile_code, location_id)
);

create index if not exists child_location_progress_completed_at_idx
on public.child_location_progress (completed_at desc);

create table if not exists public.child_friendships (
  child_profile_id uuid not null references public.child_profiles(id) on delete cascade,
  friend_child_profile_id uuid not null references public.child_profiles(id) on delete cascade,
  friend_profile_code text not null,
  friend_display_name text not null,
  created_at timestamptz not null default now(),
  primary key (child_profile_id, friend_child_profile_id),
  constraint child_friendships_no_self check (child_profile_id <> friend_child_profile_id)
);

create index if not exists child_friendships_friend_child_profile_id_idx
on public.child_friendships(friend_child_profile_id);

create table if not exists public.child_expedition_invites (
  id uuid primary key default gen_random_uuid(),
  expedition_id uuid not null default gen_random_uuid(),
  inviter_child_profile_id uuid not null references public.child_profiles(id) on delete cascade,
  inviter_profile_code text not null,
  inviter_display_name text not null,
  invitee_child_profile_id uuid not null references public.child_profiles(id) on delete cascade,
  invitee_profile_code text not null,
  invitee_display_name text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint child_expedition_invites_no_self check (inviter_child_profile_id <> invitee_child_profile_id)
);

create index if not exists child_expedition_invites_invitee_status_idx
on public.child_expedition_invites (invitee_child_profile_id, status, created_at desc);

create index if not exists child_expedition_invites_inviter_status_idx
on public.child_expedition_invites (inviter_child_profile_id, status, created_at desc);

create table if not exists public.child_profile_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_profile_code text not null,
  blocked_profile_code text not null,
  created_at timestamptz not null default now(),
  unique (blocker_profile_code, blocked_profile_code)
);

create table if not exists public.child_security_events (
  id uuid primary key default gen_random_uuid(),
  profile_code text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pin_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  profile_id uuid references public.child_profiles(id) on delete set null,
  success boolean not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists pin_audit_log_user_id_idx on public.pin_audit_log(user_id, created_at desc);
create index if not exists pin_audit_log_profile_id_idx on public.pin_audit_log(profile_id, created_at desc);

create table if not exists public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  action_key text not null,
  ip_address text,
  user_id uuid references auth.users(id) on delete cascade,
  attempts integer not null default 0,
  window_start timestamptz not null default now(),
  blocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rate_limits_unique_scope_idx
on public.rate_limits (action_key, coalesce(ip_address, ''), coalesce(user_id::text, ''));
create index if not exists rate_limits_action_key_idx on public.rate_limits(action_key);
create index if not exists rate_limits_ip_idx on public.rate_limits(ip_address);
create index if not exists rate_limits_user_idx on public.rate_limits(user_id);

create table if not exists public.child_task_progress (
  id uuid primary key default gen_random_uuid(),
  profile_code text not null,
  location_id text not null,
  task_id text not null,
  task_order integer not null default 0,
  task_type text,
  status text not null check (status in ('correct', 'wrong', 'unknown')),
  attempts integer not null default 0,
  penalty_points integer not null default 0 check (penalty_points >= 0),
  last_answer text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_code, location_id, task_id)
);

create index if not exists child_task_progress_profile_location_idx
on public.child_task_progress (profile_code, location_id);
create index if not exists child_task_progress_location_task_order_idx
on public.child_task_progress (location_id, task_order);

-- ------------------------------------------------------------------
-- EXPEDITIONS (MVP)
-- ------------------------------------------------------------------

create table if not exists public.child_game_sessions (
  id uuid primary key default gen_random_uuid(),
  leader_child_profile_id uuid not null references public.child_profiles(id) on delete cascade,
  mission_id text,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'cancelled')),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.child_game_session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.child_game_sessions(id) on delete cascade,
  child_profile_id uuid not null references public.child_profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'accepted', 'declined', 'removed')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, child_profile_id)
);

create index if not exists child_game_sessions_leader_status_idx
on public.child_game_sessions (leader_child_profile_id, status, created_at desc);

create index if not exists child_game_session_players_profile_status_idx
on public.child_game_session_players (child_profile_id, status, created_at desc);

create index if not exists child_game_session_players_session_status_idx
on public.child_game_session_players (session_id, status, created_at desc);

create unique index if not exists child_game_sessions_one_open_per_leader_idx
on public.child_game_sessions (leader_child_profile_id)
where status in ('waiting', 'active');

-- ------------------------------------------------------------------
-- ADMIN MISSIONS
-- ------------------------------------------------------------------

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  city text not null,
  intro_text text not null default '',
  hero_image_url text not null default '',
  difficulty text not null default 'stredni',
  duration_min integer not null default 0,
  points integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.missions add column if not exists hero_image_url text not null default '';

create table if not exists public.mission_stops (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  title text not null,
  description text not null default '',
  image_url text not null default '',
  "order" integer not null default 0
);

create table if not exists public.mission_tasks (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.mission_stops(id) on delete cascade,
  type text not null,
  question text not null,
  correct_answer text not null default '',
  options jsonb not null default '[]'::jsonb,
  "order" integer not null default 0
);

create index if not exists mission_stops_mission_order_idx
on public.mission_stops (mission_id, "order");

create index if not exists mission_tasks_stop_order_idx
on public.mission_tasks (stop_id, "order");

create or replace function public.normalize_mission_task_correct_answer()
returns trigger
language plpgsql
as $$
declare
  normalized_answer text;
  option_values text[];
  selected_option text;
  option_value text;
  option_index integer;
  min_matches integer;
  working_text text;
  answer_values text[];
  answer_value text;
  cleaned_answers text[] := '{}';
begin
  new.correct_answer := btrim(coalesce(new.correct_answer, ''));

  if new.correct_answer = '' then
    raise exception 'Správná odpověď je povinná.';
  end if;

  if new.type = 'ano-ne' then
    normalized_answer := lower(regexp_replace(new.correct_answer, '\s+', ' ', 'g'));

    if normalized_answer = 'ano' then
      new.correct_answer := 'Ano';
      new.options := '["Ano","Ne"]'::jsonb;
      return new;
    end if;

    if normalized_answer = 'ne' then
      new.correct_answer := 'Ne';
      new.options := '["Ano","Ne"]'::jsonb;
      return new;
    end if;

    raise exception 'U typu Ano / ne musí být správná odpověď Ano nebo Ne.';
  end if;

  if new.type = 'vyber' then
    option_values := array(
      select btrim(value)
      from jsonb_array_elements_text(coalesce(new.options, '[]'::jsonb)) as value
      where btrim(value) <> ''
    );

    if coalesce(array_length(option_values, 1), 0) < 2 then
      raise exception 'U typu Výběr z možností musí být aspoň 2 možnosti.';
    end if;

    normalized_answer := lower(regexp_replace(new.correct_answer, '\s+', ' ', 'g'));

    if normalized_answer ~ '^\d+$' then
      option_index := normalized_answer::integer;
      if option_index < 1 or option_index > array_length(option_values, 1) then
        raise exception 'Číslo správné možnosti není v seznamu možností.';
      end if;

      new.correct_answer := option_values[option_index];
      return new;
    end if;

    foreach option_value in array option_values loop
      if lower(regexp_replace(option_value, '\s+', ' ', 'g')) = normalized_answer then
        selected_option := option_value;
        exit;
      end if;
    end loop;

    if selected_option is null then
      raise exception 'U typu Výběr z možností musí být správná odpověď přesný text možnosti nebo její pořadí.';
    end if;

    new.correct_answer := selected_option;
    return new;
  end if;

  normalized_answer := lower(regexp_replace(coalesce(new.question, ''), '\s+', ' ', 'g'));
  if normalized_answer ~ 'alespon[[:space:]]+[0-9]+' then
    min_matches := substring(normalized_answer from 'alespon[[:space:]]+([0-9]+)')::integer;

    working_text := regexp_replace(new.correct_answer, E'[|,;*•]+', E'\n', 'g');
    answer_values := regexp_split_to_array(working_text, E'\n+');

    foreach answer_value in array answer_values loop
      answer_value := btrim(answer_value);
      if answer_value <> '' then
        cleaned_answers := array_append(cleaned_answers, answer_value);
      end if;
    end loop;

    if coalesce(array_length(cleaned_answers, 1), 0) < min_matches then
      raise exception 'U whitelist úkolu typu napiš aspoň % odděl položky čárkou, středníkem nebo novým řádkem a zadej jich aspoň %.', min_matches, min_matches;
    end if;

    new.correct_answer := array_to_string(cleaned_answers, E'\n');
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_mission_task_correct_answer_trigger on public.mission_tasks;

create trigger normalize_mission_task_correct_answer_trigger
before insert or update on public.mission_tasks
for each row
execute function public.normalize_mission_task_correct_answer();

-- ------------------------------------------------------------------
-- TRIGGERS
-- ------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_child_profiles_touch_updated_at on public.child_profiles;
create trigger trg_child_profiles_touch_updated_at
before update on public.child_profiles
for each row execute function public.touch_updated_at();

drop trigger if exists trg_rate_limits_touch_updated_at on public.rate_limits;
create trigger trg_rate_limits_touch_updated_at
before update on public.rate_limits
for each row execute function public.touch_updated_at();

drop trigger if exists trg_child_task_progress_touch_updated_at on public.child_task_progress;
create trigger trg_child_task_progress_touch_updated_at
before update on public.child_task_progress
for each row execute function public.touch_updated_at();

commit;
