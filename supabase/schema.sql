create extension if not exists "pgcrypto";

create type public.task_type as enum ('question', 'photo', 'choice');

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null,
  story text not null,
  lat double precision not null,
  lng double precision not null,
  image_url text not null,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  type public.task_type not null,
  content jsonb not null,
  answer text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_seed text,
  home_city_id uuid references public.cities(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.user_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create table public.friendships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friendships_no_self check (user_id <> friend_id)
);

create unique index locations_city_id_name_idx on public.locations (city_id, name);
create index tasks_location_id_sort_order_idx on public.tasks (location_id, sort_order);
create index user_progress_completed_at_idx on public.user_progress (completed_at desc);
create index friendships_friend_id_idx on public.friendships (friend_id);

alter table public.cities enable row level security;
alter table public.locations enable row level security;
alter table public.tasks enable row level security;
alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;
alter table public.friendships enable row level security;

create policy "cities are readable by everyone"
on public.cities for select
using (true);

create policy "locations are readable by everyone"
on public.locations for select
using (true);

create policy "tasks are readable by everyone"
on public.tasks for select
using (true);

create policy "profiles readable by signed in users"
on public.profiles for select
to authenticated
using (true);

create policy "users insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "users update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "users read own progress"
on public.user_progress for select
to authenticated
using (auth.uid() = user_id);

create policy "users insert own progress"
on public.user_progress for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users read own friendships"
on public.friendships for select
to authenticated
using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "users insert own friendships"
on public.friendships for insert
to authenticated
with check (auth.uid() = user_id);
