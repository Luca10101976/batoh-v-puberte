-- R41: Traki nemá PIN – mrtvá infrastruktura odchází z databáze.
--
-- Sloupce pin_hash, pin_updated_at, pin_failed_attempts a pin_locked_until
-- pocházejí z původního rodičovského modelu. Od R17 se hráč přihlašuje
-- anonymním účtem a Traki klíčem, starší účty e-mailem. U všech šesti
-- produkčních profilů byly tyhle sloupce prázdné (pin_hash, pin_updated_at
-- a pin_locked_until NULL, pin_failed_attempts 0) a žádný kód do nich
-- nezapisoval. Aplikace je od nasazení R41 ani nečte.
--
-- Tabulka pin_audit_log měla 0 řádků a nečetl ji žádný kód ani žádná funkce.
-- Její RLS politika a indexy zanikají s ní.
--
-- Migrace nemaže žádný profil, žádnou odpověď hráče, žádný výsledek ani žádný
-- text hry. Nedotýká se parent_user_id, contact_email, Traki klíče ani
-- přihlášení starším e-mailovým účtem.
alter table public.child_profiles drop column if exists pin_hash;
alter table public.child_profiles drop column if exists pin_updated_at;
alter table public.child_profiles drop column if exists pin_failed_attempts;
alter table public.child_profiles drop column if exists pin_locked_until;

drop table if exists public.pin_audit_log;

-- Název sloupce je historický. Aby ho nikdo nečetl jako důkaz, že Traki má
-- rodičovské účty, nese sloupec od R41 vlastní vysvětlení přímo ve schématu.
comment on column public.child_profiles.parent_user_id is 'parent_user_id represents the Supabase auth.users owner of the player profile; the legacy column name does not imply a current parent-account model.';
