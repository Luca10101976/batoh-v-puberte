-- Hardening release: invites, blocks, audit, and safer group completion

create table if not exists public.child_profile_blocks (
  child_profile_id uuid not null references public.child_profiles(id) on delete cascade,
  blocked_child_profile_id uuid not null references public.child_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (child_profile_id, blocked_child_profile_id),
  constraint child_profile_blocks_no_self check (child_profile_id <> blocked_child_profile_id)
);

create table if not exists public.child_security_events (
  id uuid primary key default gen_random_uuid(),
  actor_child_profile_id uuid references public.child_profiles(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists child_profile_blocks_blocked_idx
on public.child_profile_blocks (blocked_child_profile_id);

create index if not exists child_security_events_actor_created_idx
on public.child_security_events (actor_child_profile_id, created_at desc);

alter table if exists public.child_profile_blocks enable row level security;
alter table if exists public.child_security_events enable row level security;

drop policy if exists "parents read own child blocks" on public.child_profile_blocks;
create policy "parents read own child blocks"
on public.child_profile_blocks for select
to authenticated
using (
  exists (
    select 1 from public.child_profiles cp
    where cp.id = child_profile_blocks.child_profile_id
      and cp.parent_user_id = auth.uid()
  )
);

drop policy if exists "parents insert own child blocks" on public.child_profile_blocks;
create policy "parents insert own child blocks"
on public.child_profile_blocks for insert
to authenticated
with check (
  exists (
    select 1 from public.child_profiles cp
    where cp.id = child_profile_blocks.child_profile_id
      and cp.parent_user_id = auth.uid()
  )
);

drop policy if exists "parents delete own child blocks" on public.child_profile_blocks;
create policy "parents delete own child blocks"
on public.child_profile_blocks for delete
to authenticated
using (
  exists (
    select 1 from public.child_profiles cp
    where cp.id = child_profile_blocks.child_profile_id
      and cp.parent_user_id = auth.uid()
  )
);

drop policy if exists "parents read own child security events" on public.child_security_events;
create policy "parents read own child security events"
on public.child_security_events for select
to authenticated
using (
  exists (
    select 1 from public.child_profiles cp
    where cp.id = child_security_events.actor_child_profile_id
      and cp.parent_user_id = auth.uid()
  )
);
