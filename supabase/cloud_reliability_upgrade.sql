alter table if exists public.child_profiles
add column if not exists pin_hash text;

create table if not exists public.child_location_progress (
  profile_code text not null,
  location_id text not null,
  completed_at timestamptz not null default now(),
  primary key (profile_code, location_id)
);
alter table if exists public.child_location_progress
add column if not exists penalty_points integer not null default 0;
alter table if exists public.child_location_progress
drop constraint if exists child_location_progress_penalty_points_check;
alter table if exists public.child_location_progress
add constraint child_location_progress_penalty_points_check check (penalty_points >= 0);

create index if not exists child_location_progress_completed_at_idx
on public.child_location_progress (completed_at desc);

alter table if exists public.child_location_progress enable row level security;

drop policy if exists "parents read own child location progress" on public.child_location_progress;
create policy "parents read own child location progress"
on public.child_location_progress for select
to authenticated
using (
  exists (
    select 1
    from public.child_profiles cp
    where cp.profile_code = child_location_progress.profile_code
      and cp.parent_user_id = auth.uid()
  )
);

drop policy if exists "parents insert own child location progress" on public.child_location_progress;
create policy "parents insert own child location progress"
on public.child_location_progress for insert
to authenticated
with check (
  exists (
    select 1
    from public.child_profiles cp
    where cp.profile_code = child_location_progress.profile_code
      and cp.parent_user_id = auth.uid()
  )
);

drop policy if exists "parents update own child location progress" on public.child_location_progress;
create policy "parents update own child location progress"
on public.child_location_progress for update
to authenticated
using (
  exists (
    select 1
    from public.child_profiles cp
    where cp.profile_code = child_location_progress.profile_code
      and cp.parent_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.child_profiles cp
    where cp.profile_code = child_location_progress.profile_code
      and cp.parent_user_id = auth.uid()
  )
);

drop policy if exists "parents delete own child location progress" on public.child_location_progress;
create policy "parents delete own child location progress"
on public.child_location_progress for delete
to authenticated
using (
  exists (
    select 1
    from public.child_profiles cp
    where cp.profile_code = child_location_progress.profile_code
      and cp.parent_user_id = auth.uid()
  )
);
