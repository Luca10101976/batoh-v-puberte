-- Ukládání přesného bodového výsledku mise do cloudu
-- Spusť celý soubor v Supabase SQL Editoru.

alter table if exists public.child_location_progress
add column if not exists penalty_points integer not null default 0;

alter table if exists public.child_location_progress
drop constraint if exists child_location_progress_penalty_points_check;

alter table if exists public.child_location_progress
add constraint child_location_progress_penalty_points_check check (penalty_points >= 0);
