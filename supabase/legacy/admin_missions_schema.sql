create extension if not exists "pgcrypto";

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  city text not null,
  intro_text text not null,
  hero_image_url text not null default '',
  difficulty text not null check (difficulty in ('lehka', 'stredni', 'tezka')),
  duration_min integer not null check (duration_min >= 0),
  points integer not null check (points >= 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.mission_stops (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  title text not null,
  description text,
  image_url text,
  "order" integer not null default 1
);

create table if not exists public.mission_tasks (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.mission_stops(id) on delete cascade,
  type text not null check (type in ('otevrena', 'vyber', 'ano-ne')),
  question text not null,
  correct_answer text not null,
  options jsonb not null default '[]'::jsonb,
  "order" integer not null default 1
);

create index if not exists idx_mission_stops_mission_id_order on public.mission_stops (mission_id, "order");
create index if not exists idx_mission_tasks_stop_id_order on public.mission_tasks (stop_id, "order");

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
