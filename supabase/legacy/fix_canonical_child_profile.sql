-- Fix: canonical child profile read/write consistency
-- Problem: avatar_config was missing from DB (localStorage-only),
--          and child_name changes from profile screen were never persisted to DB.
-- Solution:
--   1. Add avatar_config column so avatar survives new-device login
--   2. Code changes ensure oldest row by created_at is the canonical row
--      (profile_code UNIQUE already guarantees 1:1, but guard against legacy duplicates)

alter table public.child_profiles
  add column if not exists avatar_config jsonb;

-- Canonical row: oldest by created_at (first-ever created for this parent).
-- Index already exists via child_profiles_parent_user_id_idx; no new index needed.
-- Legacy note: if multiple rows exist for the same parent_user_id, the application
-- now always selects the oldest row and logs a warning server-side.
