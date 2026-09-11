-- R44: kde hra fyzicky začíná + vlastní text detailu hry.
--
-- MÍSTO STARTU
-- Hráč se na detailu hry potřebuje dozvědět, kam má doopravdy přijít. Dosud to
-- v datech nebylo: detail ukazoval jen název první zastávky („Chrámek noci
-- a poznání“), což je bod uvnitř parku, ne adresa. Souřadnice se braly z města
-- (cities.lat/lng), takže všechny hry jednoho města ukazovaly na stejný bod –
-- a u Prahy to navíc nebyl střed města, ale souřadnice Klamovky, které se tam
-- dostaly ještě z doby jediné hry.
--
-- Místo startu je vlastnost HRY, ne města a ne první zastávky: sraz nemusí být
-- totožný s prvním herním bodem.
--
-- TEXT DETAILU
-- Karta v katalogu a detail hry dosud zobrazovaly tentýž řetězec (short_description
-- oříznutý na 96 znaků), takže detail jen opakoval kartu. detail_text dává hře
-- vlastní, o něco bohatší lákací vrstvu mezi kartou a úvodem hry. Když zůstane
-- prázdný, detail se chová přesně jako dosud – žádná změna pro existující hry.
--
-- Všechny sloupce jsou nepovinné, bez výchozí hodnoty a bez cizích klíčů.
-- Migrace nemaže žádný obsah, žádný profil ani žádná hráčská data.
alter table public.missions add column if not exists start_place_name text;
alter table public.missions add column if not exists start_lat double precision;
alter table public.missions add column if not exists start_lng double precision;
alter table public.missions add column if not exists detail_text text;

comment on column public.missions.start_place_name is
  'R44: lidsky čitelné místo srazu, kam má hráč přijít (např. „Park Klamovka, Praha 5“). Spravuje se v Mozku.';
comment on column public.missions.start_lat is
  'R44: zeměpisná šířka místa startu. Používá se pro odkaz do externí mapy, Traki vlastní mapu nemá.';
comment on column public.missions.start_lng is
  'R44: zeměpisná délka místa startu.';
comment on column public.missions.detail_text is
  'R44: lákací text na detailu hry. Prázdný = detail použije krátký popis z katalogu jako dosud.';
