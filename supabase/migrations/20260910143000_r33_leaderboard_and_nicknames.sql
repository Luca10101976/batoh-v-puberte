-- R33: žebříček a hráčské přezdívky.
--
-- Migrace je idempotentní a NIC nemaže: žádné drop table, delete ani truncate.
-- Nemění se žádná odpověď hráče, žádný výsledek, žádná přezdívka a žádný obsah hry.
--
-- Před nasazením ověřeno na produkci: 6 profilů, žádná duplicitní přezdívka ani
-- při ignorování velikosti písmen a Unicode normalizace, žádná přezdívka mimo
-- rozsah 2–24 znaků, žádný účet se dvěma profily.

-- ---------------------------------------------------------------------------
-- 1. PROFIL VYŘAZENÝ Z POŘADÍ (produktové pravidlo 12)
-- ---------------------------------------------------------------------------
-- Testovací a syntetické profily se nesmějí objevit v produkčním žebříčku ani
-- ovlivnit pořadí ostatních. Filtrování podle názvu přezdívky by bylo křehké,
-- proto je to explicitní příznak. Výchozí hodnota je false, takže žádný
-- existující profil se automaticky neoznačí.
alter table public.child_profiles
  add column if not exists excluded_from_leaderboard boolean not null default false;

comment on column public.child_profiles.excluded_from_leaderboard is
  'R33: true = profil se nezapočítává do žebříčku a neovlivňuje pořadí (testovací/syntetický profil). Nastavuje se výhradně ručně přes service role, nikdy podle názvu přezdívky.';

-- ---------------------------------------------------------------------------
-- 2. PŘEZDÍVKA: délka 2–24 znaků (produktové pravidlo 4)
-- ---------------------------------------------------------------------------
-- Pravidlo platí pro každý zápis, tedy i pro ten, který by šel mimo API.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'child_profiles_child_name_length'
       and conrelid = 'public.child_profiles'::regclass
  ) then
    alter table public.child_profiles
      add constraint child_profiles_child_name_length
      check (char_length(btrim(child_name)) between 2 and 24);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. PŘEZDÍVKA JE JEDINEČNÁ (produktové pravidlo 4)
-- ---------------------------------------------------------------------------
-- Porovnání ignoruje velikost písmen (Pepík = pepík = PEPÍK), ale diakritika je
-- významná (Pepík ≠ Pepik). normalize(..., nfc) srovná dvě různé Unicode
-- reprezentace téhož vizuálního textu, aby z nich nevznikly dvě přezdívky.
--
-- Unikátní index je zároveň jediná ochrana, která obstojí při souběžném zápisu
-- dvou hráčů: kontrola v aplikaci může proběhnout u obou zároveň, index pustí
-- jen jednoho a druhý dostane 23505.
create unique index if not exists child_profiles_nickname_key
  on public.child_profiles (lower(normalize(btrim(child_name), nfc)));

comment on index public.child_profiles_nickname_key is
  'R33: přezdívka je jedinečná napříč hráči. Bez ohledu na velikost písmen, s významnou diakritikou, po Unicode normalizaci NFC.';

-- ---------------------------------------------------------------------------
-- 4. JEDEN ÚČET = JEDEN PROFIL
-- ---------------------------------------------------------------------------
-- Aplikace to už dnes předpokládá (profil se zakládá jen tehdy, když žádný
-- neexistuje), ale nebylo to nikde vynucené. Bez toho musel žebříček „kanonizovat“
-- profily podle stáří a legitimní druhý profil by z pořadí tiše zmizel.
-- Zároveň to brání tomu, aby si klient přes RLS založil další profil s vybranou
-- přezdívkou.
create unique index if not exists child_profiles_parent_user_id_key
  on public.child_profiles (parent_user_id);

-- ---------------------------------------------------------------------------
-- 5. PROFIL SE MĚNÍ JEN SERVEROVOU CESTOU (produktové pravidlo 5)
-- ---------------------------------------------------------------------------
-- Nález auditu: přihlášený hráč mohl přes veřejný anon klíč přepsat vlastní
-- řádek v child_profiles, a obejít tím validaci přezdívky v API.
--
-- Aplikace tuhle tabulku z prohlížeče NIKDY neupravuje: profil, avatar i Traki
-- klíč se zapisují přes API se service-role klíčem, který RLS obchází. Odebrání
-- zapisovací politiky proto nic legitimního nerozbije.
--
-- Politika pro INSERT zůstává: legacy e-mailové přihlášení (app/api/auth/login)
-- zakládá profil klientem přihlášeného uživatele. Délku i jedinečnost přezdívky
-- u něj vynutí check a unikátní index výše.
drop policy if exists "parents update own child profiles" on public.child_profiles;

do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = 'child_profiles'
       and cmd in ('UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

alter table public.child_profiles enable row level security;

comment on table public.child_profiles is
  'R33: hráčský profil. Přezdívka je veřejná identita, je jedinečná (case-insensitive, NFC, diakritika významná) a mění se výhradně serverem; klientský UPDATE přes RLS je zakázaný.';
