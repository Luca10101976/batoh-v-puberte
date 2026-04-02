-- Step 1: tighten child_profiles read access (safe variant)
-- This script also works in projects that do not yet have
-- public.child_expedition_invites.

alter table if exists public.child_profiles enable row level security;

drop policy if exists "authenticated can read child profiles for code matching" on public.child_profiles;
drop policy if exists "parents read own child profiles" on public.child_profiles;
drop policy if exists "parents read connected child profiles via friendships" on public.child_profiles;
drop policy if exists "parents read connected child profiles via invites" on public.child_profiles;

create policy "parents read own child profiles"
on public.child_profiles for select
to authenticated
using (auth.uid() = parent_user_id);

create policy "parents read connected child profiles via friendships"
on public.child_profiles for select
to authenticated
using (
  exists (
    select 1
    from public.child_profiles me
    join public.child_friendships cf
      on (
        (cf.child_profile_id = me.id and cf.friend_child_profile_id = child_profiles.id)
        or
        (cf.friend_child_profile_id = me.id and cf.child_profile_id = child_profiles.id)
      )
    where me.parent_user_id = auth.uid()
  )
);

do $$
begin
  if to_regclass('public.child_expedition_invites') is not null then
    execute $policy$
      create policy "parents read connected child profiles via invites"
      on public.child_profiles for select
      to authenticated
      using (
        exists (
          select 1
          from public.child_profiles me
          join public.child_expedition_invites inv
            on (
              (inv.inviter_child_profile_id = me.id and inv.invitee_child_profile_id = child_profiles.id)
              or
              (inv.invitee_child_profile_id = me.id and inv.inviter_child_profile_id = child_profiles.id)
            )
          where me.parent_user_id = auth.uid()
        )
      )
    $policy$;
  end if;
end
$$;
