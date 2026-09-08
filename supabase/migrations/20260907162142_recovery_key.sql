-- R17: Traki klíč (soukromý obnovovací klíč hráče).
--
-- Do DB se ukládá POUZE HMAC-SHA256(kanonický klíč, RECOVERY_KEY_PEPPER) – nikdy plaintext.
-- Částečný UNIQUE index hlídá kolizi dvou stejných klíčů (server při 23505 vygeneruje nový).
-- Žádná změna RLS: sloupce čte a zapisuje výhradně service role přes /api/recovery-key/*.

alter table public.child_profiles
  add column if not exists recovery_key_hash text,
  add column if not exists recovery_key_created_at timestamptz,
  add column if not exists recovery_key_last_used_at timestamptz;

create unique index if not exists child_profiles_recovery_key_hash_key
  on public.child_profiles (recovery_key_hash)
  where recovery_key_hash is not null;
