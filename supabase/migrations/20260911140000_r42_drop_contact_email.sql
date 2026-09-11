-- R42: Traki nemá e-mail hráče.
--
-- Sloupec contact_email pochází z doby, kdy se hráč přihlašoval e-mailem a heslem.
-- Od R17 je jediným modelem anonymní účet Supabase + Traki klíč. E-mailové
-- přihlášení zůstávalo kvůli třem účtům založeným dřív; po R43 v databázi
-- nezůstal žádný hráč, takže nemá jediného uživatele, a jeho kód byl odstraněn.
--
-- Aplikace contact_email od nasazení R42 nikde nečte ani nezapisuje. Sloupec byl
-- nullable, bez cizího klíče a bez RLS politiky – držel ho jen obyčejný index,
-- který zaniká spolu s ním.
--
-- Vlastnictví profilu drží parent_user_id (NOT NULL, odkaz do auth.users), ne
-- e-mail. Tahle migrace se ho nedotýká, stejně jako se nedotýká Traki klíče
-- (recovery_key_hash a časy), herního obsahu ani Mozku.
drop index if exists public.idx_child_profiles_contact_email;

alter table public.child_profiles drop column if exists contact_email;
