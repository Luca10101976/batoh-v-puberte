-- R22: herní odemykání smí probíhat pouze v rámci jednoho města.
--
-- unlock_after_mission_id dnes odkazuje na libovolnou misi, takže nic nebrání vazbě
-- „pražská hra odemyká budějovickou“. Produktové rozhodnutí to zakazuje: postup v jednom
-- městě nesmí blokovat vstupní hry v jiném městě.
--
-- Vynuceno deklarativně složeným cizím klíčem přes (id, city). Referencovaná mise tak musí
-- mít stejné město jako mise odkazující. Nejde to obejít ani service rolí, ani Mozkem.
-- Nahrazuje původní jednosloupcový cizí klíč (stejné chování při smazání mise).
--
-- Poznámka: změna města u mise, která je prerequisite, bude nově odmítnuta, dokud se vazba
-- nezruší. To je záměr (fail-closed), ne vedlejší efekt.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.missions'::regclass and conname = 'missions_id_city_key'
  ) then
    alter table public.missions add constraint missions_id_city_key unique (id, city);
  end if;
end $$;

alter table public.missions drop constraint if exists missions_unlock_after_mission_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.missions'::regclass and conname = 'missions_unlock_same_city_fk'
  ) then
    alter table public.missions
      add constraint missions_unlock_same_city_fk
      foreign key (unlock_after_mission_id, city)
      references public.missions (id, city)
      on delete set null (unlock_after_mission_id);
  end if;
end $$;
