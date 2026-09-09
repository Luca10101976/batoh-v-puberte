-- R25: nápovědy, autorský závěr hry a strukturované pravidlo „pro splnění stačí X“.
--
-- Migrace je idempotentní a NIC nemaže: žádné drop table, delete ani truncate.
-- Obsahová část se dotýká pouze Klamovky a zapisuje přesně to, co dnešní běžící
-- kód z jejích dat sám odvozuje. Nevzniká žádný nový obsah.

-- ---------------------------------------------------------------------------
-- 1. ÚKOL: nápověda a strukturované pravidlo minimálního počtu shod
-- ---------------------------------------------------------------------------
-- hint_text a answer_mode v produkci existují, ale žádná migrace je nepopisovala.
-- Doplňují se proto jako "add if not exists", aby nové prostředí mělo stejný tvar
-- jako produkce. Na produkci je to bez efektu.
alter table public.mission_tasks add column if not exists hint_text text not null default '';
alter table public.mission_tasks add column if not exists answer_mode text not null default 'single';

comment on column public.mission_tasks.hint_text is
  'R25: autorská nápověda k úkolu. Prázdný text = úkol nápovědu nemá a tlačítko se hráči nezobrazí.';

-- Dosud se „stačí N odpovědí" hádalo z textu otázky (alespoň N / aspoň N),
-- z prefixu MIN n: a z výjimky natvrdo v kódu. Nově je to jedna explicitní hodnota.
alter table public.mission_tasks add column if not exists min_correct_matches integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mission_tasks_min_correct_matches_check') then
    alter table public.mission_tasks
      add constraint mission_tasks_min_correct_matches_check
      check (min_correct_matches is null or min_correct_matches > 0);
  end if;
end $$;

comment on column public.mission_tasks.min_correct_matches is
  'R25: kolik uznávaných odpovědí stačí ke splnění. NULL = musí sedět celá odpověď.';

-- ---------------------------------------------------------------------------
-- 2. HRA: autorský závěr
-- ---------------------------------------------------------------------------
-- Závěr měla dosud v kódu jen Klamovka; hry z databáze dostávaly konstantu.
alter table public.missions add column if not exists ending_title text not null default '';
alter table public.missions add column if not exists ending_text text not null default '';
alter table public.missions add column if not exists ending_player_message text not null default '';

comment on column public.missions.ending_title is 'R25: nadpis závěrečné obrazovky hry.';
comment on column public.missions.ending_text is 'R25: autorský závěrečný text hry.';
comment on column public.missions.ending_player_message is 'R25: osobní vzkaz hráči na konci hry.';

-- ---------------------------------------------------------------------------
-- 3. ODPOVĚĎ: použití nápovědy
-- ---------------------------------------------------------------------------
-- Patří ke konkrétní odpovědi konkrétní výpravy (řádek už nese session_id z R23),
-- takže stav přežije reload i přechod na druhé zařízení. Jednou nastavený čas se
-- nikdy nevrací zpět – server ho přepisuje jen z NULL na hodnotu.
alter table public.child_task_progress add column if not exists hint_used_at timestamptz;

comment on column public.child_task_progress.hint_used_at is
  'R25: kdy hráč u tohoto úkolu v této výpravě otevřel nápovědu. NULL = neotevřel. Snižuje hodnotu správné odpovědi z 10 na 5 bodů.';

-- ---------------------------------------------------------------------------
-- 4. KLAMOVKA: převod existujícího obsahu do nového modelu
-- ---------------------------------------------------------------------------
-- 4a. Odpovědi psané v jednom řádku oddělené mezerami.
-- Dnešní kód je rozděluje záložním pravidlem „obsahuje číslici → rozděl podle mezer".
-- Nový model dělí jen podle řádků a oddělovačů, proto se stejný seznam zapíše natvrdo.
-- Hodnoty odpovídají tomu, co runtime z těchto řádků dnes vytváří.
update public.mission_tasks set correct_answer = '16' || chr(10) || 'sestnact'
 where id = 'dba4b267-017b-4fd4-b857-5b8ea66a68b0' and correct_answer = '16 sestnact';

update public.mission_tasks set correct_answer = '12' || chr(10) || 'dvanáct'
 where id = 'b45592ba-09b5-4e51-b776-7c4d2b46b53a' and correct_answer = '12 dvanáct';

update public.mission_tasks set correct_answer = '4' || chr(10) || 'ctyri' || chr(10) || 'čtyři'
 where id = 'a49c74f2-18d1-4538-9fec-647b88c4517b' and correct_answer = '4 ctyri čtyři';

-- 4b. Úkoly, kde dnes platí „stačí N shod" odvozené z textu zadání.
-- „Slovní hra" má v textu úkolu „aspoň 2", „Vlajky" mají v otázce „alespoň 3".
update public.mission_tasks set min_correct_matches = 2
 where id = '84663bc1-b9b8-49e8-b9bd-4b33b1dd68b2' and min_correct_matches is null;

update public.mission_tasks set min_correct_matches = 3
 where id = 'df0b3e2d-8026-4da2-aa88-eb5db62e7dc7' and min_correct_matches is null;

-- 4c. Autorský závěr Klamovky se přesouvá z kódu do databáze, doslova.
update public.missions
   set ending_title = 'Klamovka zase vypráví',
       ending_text = 'Neposkládala jsi jen jednu hádanku. Posbírala jsi kusy minulosti, které tu byly rozházené po celém parku. Klamovka není rozbitá, jen je složená z víc časů najednou.',
       ending_player_message = 'Skvělá práce, našli jste zadek. A ne, bohužel nevím, co je rýžový špaček, ale když budeš googlit a zjistíš to, dej mi vědět. A víš, že je v Praze kašna, kde bydlí úhoř Pepa? Ne? Tak třeba příště. A teď už je čas jít domů, čert ví, kolik je vlastně hodin.'
 where id = '70b31e6d-6a24-4e3a-a48e-dfbc3dbd2b43'
   and ending_title = '';
