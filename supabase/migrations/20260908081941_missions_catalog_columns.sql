-- R20: reconciliace migration history s reálným produkčním schématem.
--
-- Katalogové sloupce short_description, catalog_order, unlock_after_mission_id a dva
-- indexy v produkci UŽ EXISTUJÍ (vznikly z supabase/admin_missions_schema.sql při práci
-- na Mozku), ale nebyly v žádné migraci v repu. Tato migrace je idempotentní:
-- na produkci nic nezmění (IF NOT EXISTS), pouze zachytí skutečný stav.
-- Definice odpovídají aplikovanému SQL a pozorovaným hodnotám ('' / 0 / null).

alter table public.missions
  add column if not exists short_description text not null default '',
  add column if not exists catalog_order integer not null default 0,
  add column if not exists unlock_after_mission_id uuid references public.missions(id) on delete set null;

create index if not exists idx_missions_catalog_order on public.missions (catalog_order);
create index if not exists idx_missions_unlock_after on public.missions (unlock_after_mission_id);
