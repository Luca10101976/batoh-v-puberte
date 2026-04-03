-- Remove upper age limit for child profiles (keep minimum age 8)
alter table if exists public.child_profiles
  drop constraint if exists child_profiles_child_age_check;

alter table if exists public.child_profiles
  add constraint child_profiles_child_age_check check (child_age >= 8);

