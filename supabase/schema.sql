-- ============================================================================
-- SNÍMEK SKUTEČNÉHO PRODUKČNÍHO SCHÉMATU (schéma public) – stav k 2026-10-08
-- ============================================================================
--
-- Vygenerováno skriptem scripts/snapshot-schema.mjs z katalogu Postgresu
-- (pg_get_constraintdef, pg_get_functiondef, pg_get_triggerdef, pg_policies,
-- pg_indexes, information_schema). Nic tu není psané rukou ani podle domněnky.
--
-- K ČEMU JE: jediný věrný popis toho, co na produkci skutečně je. Migrace
-- 0001_baseline.sql a 0002_production_snapshot_2026-09-07.sql to NEJSOU –
-- baseline se na produkci nikdy nespustil (audit 8. 10. 2026).
--
-- NESPOUŠTĚT NA PRODUKCI. Změny schématu jdou jen migracemi; po každé migraci
-- se tenhle soubor obnoví příkazem `npm run schema:snapshot` a drift hlídá
-- `npm run schema:verify`.
--
-- CO TU NENÍ: práva rolí (GRANT) – Management API je nevrací, neověřeno;
-- schémata auth, storage, realtime, vault (spravuje Supabase); data.

-- ---------------------------------------------------------------------------
-- Rozšíření na produkci (jen záznam – spravuje Supabase, schéma neznámé)
-- ---------------------------------------------------------------------------
--   pg_stat_statements 1.11
--   pgcrypto 1.3
--   plpgsql 1.0
--   supabase_vault 0.3.1
--   uuid-ossp 1.1

-- ---------------------------------------------------------------------------
-- Funkce
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_mission_task_correct_answer()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
  ordered_values text[] := '{}';
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

  -- R46: seřazení. Správné pořadí musí obsahovat přesně tytéž položky
  -- jako nabídka, každou právě jednou.
  if new.type = 'serad' then
    option_values := array(
      select btrim(value)
      from jsonb_array_elements_text(coalesce(new.options, '[]'::jsonb)) as value
      where btrim(value) <> ''
    );

    if coalesce(array_length(option_values, 1), 0) < 2 then
      raise exception 'U typu Seřaď musí být aspoň 2 položky k seřazení.';
    end if;

    working_text := regexp_replace(new.correct_answer, E'[|;]+', E'\n', 'g');
    answer_values := regexp_split_to_array(working_text, E'\n+');
    foreach answer_value in array answer_values loop
      answer_value := btrim(answer_value);
      if answer_value <> '' then
        ordered_values := array_append(ordered_values, answer_value);
      end if;
    end loop;

    if array_length(ordered_values, 1) is distinct from array_length(option_values, 1) then
      raise exception 'Správné pořadí musí obsahovat všechny položky, každou právě jednou.';
    end if;

    -- každá položka správného pořadí musí být jednou z nabízených
    foreach answer_value in array ordered_values loop
      selected_option := null;
      foreach option_value in array option_values loop
        if lower(regexp_replace(option_value, '\s+', ' ', 'g')) = lower(regexp_replace(answer_value, '\s+', ' ', 'g')) then
          selected_option := option_value;
          exit;
        end if;
      end loop;
      if selected_option is null then
        raise exception 'Položka „%" ve správném pořadí není mezi nabízenými možnostmi.', answer_value;
      end if;
      cleaned_answers := array_append(cleaned_answers, selected_option);
    end loop;

    -- a žádná se nesmí opakovat
    if (select count(distinct lower(regexp_replace(x, '\s+', ' ', 'g'))) from unnest(cleaned_answers) as x)
         is distinct from array_length(cleaned_answers, 1) then
      raise exception 'Ve správném pořadí se položka opakuje. Každá smí být jen jednou.';
    end if;

    new.correct_answer := array_to_string(cleaned_answers, E'\n');
    return new;
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
    -- jediná úprava této větve: obranné vynulování. Dnes bez vlivu (větev
    -- „serad" se sem nedostane, vrací se dřív), ale drží větve nezávislé.
    cleaned_answers := '{}';
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
$function$;

CREATE OR REPLACE FUNCTION public.set_child_location_progress_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_child_task_progress_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  new.last_answered_at = now();
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Tabulky
-- ---------------------------------------------------------------------------
create table public.child_friendships (
  child_profile_id uuid not null,
  friend_child_profile_id uuid not null,
  friend_profile_code text not null,
  friend_display_name text not null,
  created_at timestamp with time zone not null default now()
);

create table public.child_game_session_players (
  id uuid not null default gen_random_uuid(),
  session_id uuid not null,
  child_profile_id uuid not null,
  status text not null default 'invited'::text,
  joined_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  confirmed_stop_transitions jsonb not null default '[]'::jsonb
);
comment on column public.child_game_session_players.confirmed_stop_transitions is $txt$R26: id zastávek, jejichž přechodovou obrazovku už tenhle hráč v téhle výpravě potvrdil. Není zdrojem pravdy o dokončení zastávky.$txt$;

create table public.child_game_sessions (
  id uuid not null default gen_random_uuid(),
  leader_child_profile_id uuid not null,
  location_id text,
  status text not null default 'waiting'::text,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  mode text not null default 'solo'::text
);
comment on table public.child_game_sessions is $txt$R23: jedno rozehrání hry (výprava). Sólo hraní = výprava s jedním hráčem.$txt$;
comment on column public.child_game_sessions.location_id is $txt$Veřejná adresa hry (locationId), ne UUID mise. Překlad na misi řeší lib/legacy-location-ids.ts.$txt$;

create table public.child_location_progress (
  profile_code text not null,
  location_id text not null,
  completed_at timestamp with time zone not null default now(),
  penalty_points integer not null default 0,
  status text not null default 'completed'::text,
  first_completed_at timestamp with time zone,
  best_score integer,
  completion_source text,
  updated_at timestamp with time zone not null default now(),
  child_profile_id uuid
);
comment on table public.child_location_progress is $txt$R23/R26: nejlepší historický výsledek hráče v dané hře. Zapisuje výhradně server; klientský zápis přes RLS je zakázaný.$txt$;

create table public.child_profiles (
  id uuid not null default gen_random_uuid(),
  parent_user_id uuid not null,
  child_name text not null,
  profile_code text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  avatar text,
  avatar_config jsonb,
  player_code text,
  recovery_key_hash text,
  recovery_key_created_at timestamp with time zone,
  recovery_key_last_used_at timestamp with time zone,
  excluded_from_leaderboard boolean not null default false
);
comment on table public.child_profiles is $txt$R33: hráčský profil. Přezdívka je veřejná identita, je jedinečná (case-insensitive, NFC, diakritika významná) a mění se výhradně serverem; klientský UPDATE přes RLS je zakázaný.$txt$;
comment on column public.child_profiles.parent_user_id is $txt$parent_user_id represents the Supabase auth.users owner of the player profile; the legacy column name does not imply a current parent-account model.$txt$;
comment on column public.child_profiles.excluded_from_leaderboard is $txt$R33: true = profil se nezapočítává do žebříčku a neovlivňuje pořadí (testovací/syntetický profil). Nastavuje se výhradně ručně přes service role, nikdy podle názvu přezdívky.$txt$;

create table public.child_task_progress (
  id uuid not null default gen_random_uuid(),
  child_profile_id uuid not null,
  profile_code text not null,
  location_id text not null,
  task_id text not null,
  status text not null,
  attempts integer not null default 0,
  penalty_points integer not null default 0,
  first_answered_at timestamp with time zone not null default now(),
  last_answered_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  session_id uuid,
  hint_used_at timestamp with time zone
);
comment on table public.child_task_progress is $txt$R26: odpovědi hráče ve výpravě. Zapisuje výhradně server (service role); klientský zápis přes RLS je zakázaný.$txt$;
comment on column public.child_task_progress.session_id is $txt$Výprava, ve které odpověď vznikla. NULL = historická odpověď z doby před R23.$txt$;
comment on column public.child_task_progress.hint_used_at is $txt$R25: kdy hráč u tohoto úkolu v této výpravě otevřel nápovědu. NULL = neotevřel. Snižuje hodnotu správné odpovědi z 10 na 5 bodů.$txt$;

create table public.cities (
  id uuid not null default gen_random_uuid(),
  slug text not null,
  name text not null,
  name_locative text not null default ''::text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  lat double precision,
  lng double precision,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
comment on table public.cities is $txt$R37: města spravovaná v Mozku. Zdroj pravdy pro nabídku měst, jejich pořadí, skloňování a souřadnice.$txt$;

create table public.mission_stops (
  id uuid not null default gen_random_uuid(),
  mission_id uuid not null,
  title text not null,
  description text,
  image_url text,
  order integer not null default 1,
  transition_text text not null default ''::text
);
comment on column public.mission_stops.transition_text is $txt$R26: autorský text, který hráč uvidí po dokončení TÉTO zastávky, než vyrazí na další. Prázdný = obecný text.$txt$;

create table public.mission_tasks (
  id uuid not null default gen_random_uuid(),
  stop_id uuid not null,
  type text not null,
  question text not null,
  correct_answer text not null,
  options jsonb not null default '[]'::jsonb,
  order integer not null default 1,
  hint_text text not null default ''::text,
  min_correct_matches integer
);
comment on column public.mission_tasks.hint_text is $txt$R25: autorská nápověda k úkolu. Prázdný text = úkol nápovědu nemá a tlačítko se hráči nezobrazí.$txt$;
comment on column public.mission_tasks.min_correct_matches is $txt$R25: kolik uznávaných odpovědí stačí ke splnění. NULL = musí sedět celá odpověď.$txt$;

create table public.missions (
  id uuid not null default gen_random_uuid(),
  title text not null,
  city text not null,
  intro_text text not null,
  difficulty text not null,
  duration_min integer not null,
  is_published boolean not null default false,
  created_at timestamp with time zone not null default now(),
  hero_image_url text not null default ''::text,
  short_description text not null default ''::text,
  catalog_order integer not null default 0,
  unlock_after_mission_id uuid,
  ending_title text not null default ''::text,
  ending_text text not null default ''::text,
  ending_player_message text not null default ''::text,
  city_id uuid,
  first_published_at timestamp with time zone,
  start_place_name text,
  start_lat double precision,
  start_lng double precision,
  detail_text text,
  print_url text
);
comment on column public.missions.ending_title is $txt$R25: nadpis závěrečné obrazovky hry.$txt$;
comment on column public.missions.ending_text is $txt$R25: autorský závěrečný text hry.$txt$;
comment on column public.missions.ending_player_message is $txt$R25: osobní vzkaz hráči na konci hry.$txt$;
comment on column public.missions.city_id is $txt$R37: vazba na spravované město. missions.city zůstává zobrazovaným názvem a drží se s městem v souladu.$txt$;
comment on column public.missions.first_published_at is $txt$R37: kdy byla hra poprvé publikovaná. Nenulová hodnota znamená, že hra legitimně vyšla ven, a její výsledky se proto počítají do žebříčku i po pozdějším odpublikování. Nikdy se nemaže.$txt$;
comment on column public.missions.start_place_name is $txt$R44: lidsky čitelné místo srazu, kam má hráč přijít (např. „Park Klamovka, Praha 5“). Spravuje se v Mozku.$txt$;
comment on column public.missions.start_lat is $txt$R44: zeměpisná šířka místa startu. Používá se pro odkaz do externí mapy, Traki vlastní mapu nemá.$txt$;
comment on column public.missions.start_lng is $txt$R44: zeměpisná délka místa startu.$txt$;
comment on column public.missions.detail_text is $txt$R44: lákací text na detailu hry. Prázdný = detail použije krátký popis z katalogu jako dosud.$txt$;
comment on column public.missions.print_url is $txt$Odkaz na papírovou verzi hry u Šneldy. Prázdné = hra papírovou verzi nemá.$txt$;

create table public.panbatoh_content (
  id uuid not null default gen_random_uuid(),
  type text not null,
  slug text not null,
  title text not null,
  summary text not null,
  status text not null default 'draft'::text,
  payload jsonb not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.rate_limits (
  id uuid not null default gen_random_uuid(),
  action_key text not null,
  ip_address text,
  user_id uuid,
  attempts integer not null default 0,
  window_start timestamp with time zone not null default now(),
  blocked_until timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- ---------------------------------------------------------------------------
-- Omezení: primární klíče, unikátnost, CHECK
-- ---------------------------------------------------------------------------
alter table public.child_friendships add constraint child_friendships_no_self CHECK ((child_profile_id <> friend_child_profile_id));
alter table public.child_friendships add constraint child_friendships_pkey PRIMARY KEY (child_profile_id, friend_child_profile_id);
alter table public.child_game_session_players add constraint child_game_session_players_pkey PRIMARY KEY (id);
alter table public.child_game_session_players add constraint child_game_session_players_session_id_child_profile_id_key UNIQUE (session_id, child_profile_id);
alter table public.child_game_session_players add constraint child_game_session_players_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'accepted'::text, 'declined'::text, 'removed'::text])));
alter table public.child_game_sessions add constraint child_game_sessions_mode_check CHECK ((mode = ANY (ARRAY['solo'::text, 'group'::text])));
alter table public.child_game_sessions add constraint child_game_sessions_pkey PRIMARY KEY (id);
alter table public.child_game_sessions add constraint child_game_sessions_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'active'::text, 'finished'::text, 'cancelled'::text])));
alter table public.child_location_progress add constraint child_location_progress_completion_source_check CHECK ((completion_source = ANY (ARRAY['gameplay'::text, 'expedition'::text, 'manual'::text])));
alter table public.child_location_progress add constraint child_location_progress_penalty_points_check CHECK ((penalty_points >= 0));
alter table public.child_location_progress add constraint child_location_progress_pkey PRIMARY KEY (profile_code, location_id);
alter table public.child_location_progress add constraint child_location_progress_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text])));
alter table public.child_profiles add constraint child_profiles_child_name_length CHECK (((char_length(btrim(child_name)) >= 2) AND (char_length(btrim(child_name)) <= 24)));
alter table public.child_profiles add constraint child_profiles_pkey PRIMARY KEY (id);
alter table public.child_profiles add constraint child_profiles_profile_code_key UNIQUE (profile_code);
alter table public.child_task_progress add constraint child_task_progress_attempts_check CHECK (((attempts >= 0) AND (attempts <= 10)));
alter table public.child_task_progress add constraint child_task_progress_penalty_points_check CHECK ((penalty_points >= 0));
alter table public.child_task_progress add constraint child_task_progress_pkey PRIMARY KEY (id);
alter table public.child_task_progress add constraint child_task_progress_status_check CHECK ((status = ANY (ARRAY['correct'::text, 'wrong'::text, 'unknown'::text])));
alter table public.cities add constraint cities_name_length CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 60)));
alter table public.cities add constraint cities_pkey PRIMARY KEY (id);
alter table public.mission_stops add constraint mission_stops_pkey PRIMARY KEY (id);
alter table public.mission_tasks add constraint mission_tasks_min_correct_matches_check CHECK (((min_correct_matches IS NULL) OR (min_correct_matches > 0)));
alter table public.mission_tasks add constraint mission_tasks_pkey PRIMARY KEY (id);
alter table public.mission_tasks add constraint mission_tasks_type_check CHECK ((type = ANY (ARRAY['otevrena'::text, 'vyber'::text, 'ano-ne'::text, 'serad'::text])));
alter table public.missions add constraint missions_difficulty_check CHECK ((difficulty = ANY (ARRAY['lehka'::text, 'stredni'::text, 'tezka'::text])));
alter table public.missions add constraint missions_duration_min_check CHECK ((duration_min >= 0));
alter table public.missions add constraint missions_id_city_key UNIQUE (id, city);
alter table public.missions add constraint missions_pkey PRIMARY KEY (id);
alter table public.panbatoh_content add constraint panbatoh_content_pkey PRIMARY KEY (id);
alter table public.panbatoh_content add constraint panbatoh_content_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])));
alter table public.panbatoh_content add constraint panbatoh_content_type_check CHECK ((type = ANY (ARRAY['zapisek'::text, 'vylet'::text])));
alter table public.panbatoh_content add constraint panbatoh_content_type_slug_key UNIQUE (type, slug);
alter table public.rate_limits add constraint rate_limits_pkey PRIMARY KEY (id);

-- Cizí klíče
alter table public.child_friendships add constraint child_friendships_child_profile_id_fkey FOREIGN KEY (child_profile_id) REFERENCES child_profiles(id) ON DELETE CASCADE;
alter table public.child_friendships add constraint child_friendships_friend_child_profile_id_fkey FOREIGN KEY (friend_child_profile_id) REFERENCES child_profiles(id) ON DELETE CASCADE;
alter table public.child_game_session_players add constraint child_game_session_players_child_profile_id_fkey FOREIGN KEY (child_profile_id) REFERENCES child_profiles(id) ON DELETE CASCADE;
alter table public.child_game_session_players add constraint child_game_session_players_session_id_fkey FOREIGN KEY (session_id) REFERENCES child_game_sessions(id) ON DELETE CASCADE;
alter table public.child_game_sessions add constraint child_game_sessions_leader_child_profile_id_fkey FOREIGN KEY (leader_child_profile_id) REFERENCES child_profiles(id) ON DELETE CASCADE;
alter table public.child_location_progress add constraint child_location_progress_child_profile_id_fkey FOREIGN KEY (child_profile_id) REFERENCES child_profiles(id) ON DELETE CASCADE;
alter table public.child_profiles add constraint child_profiles_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.child_task_progress add constraint child_task_progress_child_profile_id_fkey FOREIGN KEY (child_profile_id) REFERENCES child_profiles(id) ON DELETE CASCADE;
alter table public.child_task_progress add constraint child_task_progress_session_id_fkey FOREIGN KEY (session_id) REFERENCES child_game_sessions(id) ON DELETE SET NULL;
alter table public.mission_stops add constraint mission_stops_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE;
alter table public.mission_tasks add constraint mission_tasks_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES mission_stops(id) ON DELETE CASCADE;
alter table public.missions add constraint missions_city_id_fkey FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL;
alter table public.missions add constraint missions_unlock_same_city_fk FOREIGN KEY (unlock_after_mission_id, city) REFERENCES missions(id, city) ON DELETE SET NULL (unlock_after_mission_id);
alter table public.rate_limits add constraint rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Indexy (mimo ty, které vytvářejí omezení výše)
-- ---------------------------------------------------------------------------
CREATE INDEX child_friendships_friend_child_profile_id_idx ON public.child_friendships USING btree (friend_child_profile_id);
CREATE INDEX child_game_session_players_profile_status_idx ON public.child_game_session_players USING btree (child_profile_id, status, created_at DESC);
CREATE INDEX child_game_session_players_session_status_idx ON public.child_game_session_players USING btree (session_id, status, created_at DESC);
CREATE INDEX child_game_sessions_leader_status_idx ON public.child_game_sessions USING btree (leader_child_profile_id, status, created_at DESC);
CREATE UNIQUE INDEX child_game_sessions_open_lobby_per_leader_idx ON public.child_game_sessions USING btree (leader_child_profile_id) WHERE ((status = ANY (ARRAY['waiting'::text, 'active'::text])) AND (location_id IS NULL));
CREATE UNIQUE INDEX child_game_sessions_open_run_per_leader_location_idx ON public.child_game_sessions USING btree (leader_child_profile_id, location_id) WHERE ((status = ANY (ARRAY['waiting'::text, 'active'::text])) AND (location_id IS NOT NULL));
CREATE INDEX child_location_progress_child_profile_idx ON public.child_location_progress USING btree (child_profile_id);
CREATE INDEX child_location_progress_completed_at_idx ON public.child_location_progress USING btree (completed_at DESC);
CREATE INDEX child_location_progress_status_idx ON public.child_location_progress USING btree (profile_code, status);
CREATE UNIQUE INDEX child_profiles_nickname_key ON public.child_profiles USING btree (lower(NORMALIZE(btrim(child_name), NFC)));
CREATE INDEX child_profiles_parent_user_id_idx ON public.child_profiles USING btree (parent_user_id);
CREATE UNIQUE INDEX child_profiles_parent_user_id_key ON public.child_profiles USING btree (parent_user_id);
CREATE UNIQUE INDEX child_profiles_player_code_key ON public.child_profiles USING btree (player_code) WHERE (player_code IS NOT NULL);
CREATE UNIQUE INDEX child_profiles_player_code_uidx ON public.child_profiles USING btree (player_code);
CREATE UNIQUE INDEX child_profiles_recovery_key_hash_key ON public.child_profiles USING btree (recovery_key_hash) WHERE (recovery_key_hash IS NOT NULL);
CREATE UNIQUE INDEX child_task_progress_legacy_task_idx ON public.child_task_progress USING btree (child_profile_id, location_id, task_id) WHERE (session_id IS NULL);
CREATE INDEX child_task_progress_location_idx ON public.child_task_progress USING btree (location_id);
CREATE INDEX child_task_progress_profile_code_idx ON public.child_task_progress USING btree (profile_code);
CREATE INDEX child_task_progress_profile_location_idx ON public.child_task_progress USING btree (child_profile_id, location_id);
CREATE UNIQUE INDEX child_task_progress_run_task_idx ON public.child_task_progress USING btree (child_profile_id, location_id, task_id, session_id);
CREATE INDEX child_task_progress_session_idx ON public.child_task_progress USING btree (session_id);
CREATE UNIQUE INDEX cities_name_key ON public.cities USING btree (lower(btrim(name)));
CREATE INDEX cities_order_idx ON public.cities USING btree (display_order, name);
CREATE UNIQUE INDEX cities_slug_key ON public.cities USING btree (lower(btrim(slug)));
CREATE INDEX idx_mission_stops_mission_id_order ON public.mission_stops USING btree (mission_id, "order");
CREATE UNIQUE INDEX mission_stops_mission_order_key ON public.mission_stops USING btree (mission_id, "order");
CREATE INDEX idx_mission_tasks_stop_id_order ON public.mission_tasks USING btree (stop_id, "order");
CREATE UNIQUE INDEX mission_tasks_stop_order_key ON public.mission_tasks USING btree (stop_id, "order");
CREATE INDEX idx_missions_catalog_order ON public.missions USING btree (catalog_order);
CREATE INDEX idx_missions_unlock_after ON public.missions USING btree (unlock_after_mission_id);
CREATE INDEX missions_catalog_order_idx ON public.missions USING btree (catalog_order);
CREATE INDEX missions_unlock_after_mission_id_idx ON public.missions USING btree (unlock_after_mission_id);
CREATE INDEX panbatoh_content_status_type_idx ON public.panbatoh_content USING btree (status, type, updated_at DESC);
CREATE UNIQUE INDEX rate_limits_action_ip_user_unique_idx ON public.rate_limits USING btree (action_key, COALESCE(ip_address, ''::text), COALESCE((user_id)::text, ''::text));
CREATE INDEX rate_limits_action_key_idx ON public.rate_limits USING btree (action_key);
CREATE INDEX rate_limits_blocked_until_idx ON public.rate_limits USING btree (blocked_until);
CREATE INDEX rate_limits_ip_address_idx ON public.rate_limits USING btree (ip_address);
CREATE INDEX rate_limits_user_id_idx ON public.rate_limits USING btree (user_id);

-- ---------------------------------------------------------------------------
-- Spouštěče
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_child_location_progress_updated_at BEFORE UPDATE ON public.child_location_progress FOR EACH ROW EXECUTE FUNCTION set_child_location_progress_updated_at();
CREATE TRIGGER trg_child_task_progress_updated_at BEFORE UPDATE ON public.child_task_progress FOR EACH ROW EXECUTE FUNCTION touch_child_task_progress_updated_at();
CREATE TRIGGER normalize_mission_task_correct_answer_trigger BEFORE INSERT OR UPDATE ON public.mission_tasks FOR EACH ROW EXECUTE FUNCTION normalize_mission_task_correct_answer();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.child_friendships enable row level security;
alter table public.child_game_session_players enable row level security;
alter table public.child_game_sessions enable row level security;
alter table public.child_location_progress enable row level security;
alter table public.child_profiles enable row level security;
alter table public.child_task_progress enable row level security;
alter table public.cities enable row level security;
alter table public.mission_stops enable row level security;
alter table public.mission_tasks enable row level security;
alter table public.missions enable row level security;
alter table public.panbatoh_content enable row level security;
alter table public.rate_limits enable row level security;

create policy "parents insert own child friendships" on public.child_friendships as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_friendships.child_profile_id) AND (cp.parent_user_id = auth.uid())))));
create policy "parents read own child friendships" on public.child_friendships as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_friendships.child_profile_id) AND (cp.parent_user_id = auth.uid())))));
create policy "parents read own session players" on public.child_game_session_players as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_game_session_players.child_profile_id) AND (cp.parent_user_id = auth.uid())))));
create policy "parents read own sessions" on public.child_game_sessions as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (child_game_session_players sp
     JOIN child_profiles cp ON ((cp.id = sp.child_profile_id)))
  WHERE ((sp.session_id = child_game_sessions.id) AND (cp.parent_user_id = auth.uid())))));
create policy "parents read own child location progress" on public.child_location_progress as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.profile_code = child_location_progress.profile_code) AND (cp.parent_user_id = auth.uid())))));
create policy "parents insert own child profiles" on public.child_profiles as permissive for insert to authenticated
  with check ((auth.uid() = parent_user_id));
create policy "parents read own child profiles" on public.child_profiles as permissive for select to authenticated
  using ((auth.uid() = parent_user_id));
create policy "parents read own child task progress" on public.child_task_progress as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM child_profiles cp
  WHERE ((cp.id = child_task_progress.child_profile_id) AND (cp.parent_user_id = auth.uid())))));
create policy "panbatoh content published readable" on public.panbatoh_content as permissive for select to public
  using ((status = 'published'::text));
create policy "service role manages rate limits" on public.rate_limits as permissive for all to service_role
  using (true)
  with check (true);

